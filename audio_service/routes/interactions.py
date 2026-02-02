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
                        (AccountID, ProductID, InteractionType, DurationSeconds, SessionID)
                        VALUES (%s, %s, %s, %s, %s)
                    """
                    cursor.execute(sql, (
                        interaction.account_id,
                        interaction.product_id,
                        interaction.interaction_type,
                        interaction.duration_seconds,
                        interaction.session_id
                    ))
                    conn.commit()
                    
                    return {
                        "status": "success",
                        "message": f"Recorded {interaction.interaction_type} interaction for product {interaction.product_id}",
                        "interaction_id": cursor.lastrowid
                    }
            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        console.log(f"Error recording interaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))
