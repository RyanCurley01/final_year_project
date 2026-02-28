# audio_service/routes/interactions.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional

from utils import console
from database import get_db_connection
from s3_service import generate_presigned_url
from models import UserInteractionRequest

router = APIRouter()

# ============================================
# TOP PLAYED SONGS ENDPOINT (from UserInteractions)
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.get("/api/songs/top-played")
async def get_top_played_songs(limit: int = 5):
    """
    Get top played songs based on play count from UserInteractions table.
    Returns songs ranked by number of 'play' interactions.
    
    Args:
        limit: Maximum number of songs to return (default: 5)
    """
    try:
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    # Joins Products and UserInteractions tables to show most played songs
                    # Renames columns to variable names for the Python dictionary
                    sql = """
                        SELECT 
                            p.ProductID as productId,
                            p.AlbumTitle as albumTitle,
                            p.albumCoverImageUrl,
                            p.file_url as fileUrl,
                            p.preview_url as previewUrl,
                            p.AlbumPrice as albumPrice,
                            COUNT(ui.InteractionID) as playCount
                        FROM Products p
                        LEFT JOIN UserInteractions ui ON p.ProductID = ui.ProductID 
                            AND ui.InteractionType = 'play'
                        WHERE p.AlbumTitle IS NOT NULL 
                            AND p.AlbumTitle != 'Selected Electronic Works'
                            AND p.file_url IS NOT NULL
                            AND p.ProductID > 0
                        GROUP BY p.ProductID, p.AlbumTitle, p.albumCoverImageUrl, 
                                 p.file_url, p.preview_url, p.AlbumPrice
                        ORDER BY playCount DESC, p.AlbumTitle ASC
                        LIMIT %s
                    """
                    cursor.execute(sql, (limit,))
                    results = cursor.fetchall()
                    
                    # Map database table (with presigned URLs) to array variables so variables can be used directly in frontend
                    songs = []
                    for row in results:
                        songs.append({
                            "productId": row['productId'],
                            "albumTitle": row['albumTitle'],
                            "albumCoverImageUrl": generate_presigned_url(row['albumCoverImageUrl']),
                            "fileUrl": generate_presigned_url(row['fileUrl']),
                            "previewUrl": generate_presigned_url(row['previewUrl']) if row['previewUrl'] else None,
                            "albumPrice": float(row['albumPrice']) if row['albumPrice'] else 0.5,
                            "playCount": row['playCount']
                        })
                    
                    return {
                        "status": "success",
                        "data": songs,
                        "count": len(songs)
                    }
            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        console.log(f"Error fetching top played songs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# RECORD USER INTERACTION ENDPOINT
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.post("/api/interactions/record")
async def record_interaction(interaction: UserInteractionRequest):
    """
    Record a user interaction with a product (e.g., play, preview, purchase)
    This tracks user behavior for analytics and recommendations
    """
    try:
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    # Maps the object models fields to the database columns so the interaction type of a product can be recorded
                    # Adds the new row to the UserInteractions table so a new interaction can keep being recorded
                    sql = """
                        INSERT INTO UserInteractions 
                        (AccountID, ProductID, InteractionType, DurationSeconds, CompletionPercentage, EngagementScore, DeviceType, SessionID)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    real_product_id = interaction.product_id
                    
                    # If product_id is a string or looks like an iTunes ID, try to convert to int if possible.
                    # If it's strictly a string (like 'db-1'), we need to extract the ID.
                    try:
                        real_product_id = int(str(interaction.product_id).replace('db-', ''))
                    except ValueError:
                        # If we can't convert to an int (e.g. some complex string), we can't record it in our SQL table
                        # Return success to not crash the frontend
                        return {"status": "ignored", "message": "Skipped recording interaction for non-integer ProductID"}

                    # Execute the insertion
                    # We wrap in try-except specifically for foreign key constraints in case the product doesn't exist
                    # Compute completion percentage from duration if not provided
                    completion_pct = interaction.completion_percentage
                    # Compute engagement score: weighted combo of duration and completion
                    engagement = interaction.engagement_score
                    if engagement is None and interaction.duration_seconds and interaction.duration_seconds > 0:
                        # Simple heuristic: longer listens = higher engagement (capped at 1.0)
                        dur_score = min(interaction.duration_seconds / 300.0, 1.0)  # 5 min = max
                        comp_score = completion_pct if completion_pct is not None else 0.0
                        engagement = round(0.4 * dur_score + 0.6 * comp_score, 4)

                    try:
                        cursor.execute(sql, (
                            interaction.account_id,
                            real_product_id,
                            interaction.interaction_type,
                            interaction.duration_seconds,
                            completion_pct,
                            engagement,
                            interaction.device_type,
                            interaction.session_id
                        ))
                        conn.commit()
                        return {
                            "status": "success",
                            "message": f"Recorded {interaction.interaction_type} interaction for product {real_product_id}",
                            "interaction_id": cursor.lastrowid
                        }
                    except Exception as db_err:
                         # Foreign key constraint fails or other DB error
                        console.log(f"Skipping interaction insert (likely FK violation): {db_err}")
                        return {"status": "ignored", "message": "Product not found in database"}

            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        console.log(f"Error recording interaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# ALL INTERACTIONS ENDPOINT (from UserInteractions)
# ============================================

@router.get("/api/interactions")
async def get_all_interactions():
    """
    Get all user interactions for the manager dashboard.
    """
    try:
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    sql = """
                        SELECT 
                            InteractionID as interactionId,
                            AccountID as accountId,
                            ProductID as productId,
                            InteractionType as interactionType,
                            InteractionTimestamp as interactionTimestamp,
                            DurationSeconds as durationSeconds,
                            CompletionPercentage as completionPercentage,
                            EngagementScore as engagementScore,
                            DeviceType as deviceType,
                            SessionID as sessionId
                        FROM UserInteractions
                        ORDER BY InteractionTimestamp ASC
                    """
                    cursor.execute(sql)
                    results = cursor.fetchall()
                    return results
            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        console.log(f"Error fetching interactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
