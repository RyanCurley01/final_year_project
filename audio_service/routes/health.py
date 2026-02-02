# audio_service/routes/health.py
from fastapi import APIRouter
from database import get_db_connection
import ml_service

router = APIRouter()

# ============================================
# HEALTH CHECK ENDPOINTS
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.get("/")
def home():
    return {"message": "Audio Analysis Service Running"}

# EXECUTION ORDER: Router endpoint.
@router.get("/health")
async def health_check():
    # Check database connectivity
    db_status = "disconnected"
    audio_features_count = 0
    with get_db_connection() as conn:
        if conn:
            try:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) as count FROM AudioFeatures")
                    result = cursor.fetchone()
                    audio_features_count = result['count'] if result else 0
                    db_status = "connected"
            except Exception as e:
                db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "database_status": db_status,
        "audio_features_in_db": audio_features_count,
        "cache_loaded": ml_service.cache_loaded,
        "cached_products": len(ml_service.audio_features_cache)
    }
