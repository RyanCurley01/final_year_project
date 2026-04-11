# audio_service/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import uvicorn
import os

from utils import console
from config import executor, EXTERNAL_IMAGE_GENERATION_ENABLED, get_allowed_origins
import ml_service

# Import Routers
from routes import (
    health,
    recommendations,
    interactions,
    feature_processing,
    itunes,
    visualization,
    image_generation,
)

from fastapi.concurrency import run_in_threadpool

# Initialize FastAPI app
app = FastAPI(title="Audio Analysis Service", version="2.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# APP LIFECYCLE EVENTS
# ============================================

# EXECUTION ORDER: Runs when the application server starts.
@app.on_event("startup")
async def startup_event():
    """
    Initialize the service:
    1. Verify database connection
    2. Load audio features from DB into memory cache
    3. Train/Load ML Scaler for feature normalization
    4. Compute PCA projection for visualization
    5. Start background top-charts auto-refresh scheduler
    """
    console.log("🚀 Starting Audio Analysis Service...")
    
    # Warm ML cache in the background.
    # IMPORTANT: FastAPI does not serve requests until startup completes, so
    # we must not block here or the frontend will time out and show blanks.
    try:
        async def _warm_ml_cache_bg():
            try:
                await ml_service.startup_cache()
                console.log("🧠 ML cache warmed")
            except Exception as e:
                console.log(f"⚠️ ML startup cache failed (will retry on first request): {e}")

        asyncio.create_task(_warm_ml_cache_bg())
    except Exception as e:
        console.log(f"⚠️ ML cache warmup scheduling failed: {e}")

    # Precompute per-song image pools so the UI doesn't display placeholders.
    # This only generates/stores URLs (fast) — it does not download the images.
    try:
        console.log(
            f"🖼️ Image precompute startup: external_generation_enabled={EXTERNAL_IMAGE_GENERATION_ENABLED}"
        )

        async def _precompute_images_bg():
            try:
                summary = await run_in_threadpool(image_generation.precompute_all_song_image_pools)
                console.log(f"🖼️ Image pools ready: {summary}")
            except Exception as e:
                console.log(f"⚠️ Image pool precompute task failed: {e}")

        asyncio.create_task(_precompute_images_bg())
    except Exception as e:
        console.log(f"⚠️ Image pool precompute failed (will fill on-demand): {e}")

    # Start the background job that keeps iTunes top-charts in sync
    try:
        from routes.itunes import start_refresh_scheduler
        start_refresh_scheduler()
    except Exception as e:
        console.log(f"⚠️ Refresh scheduler failed to start: {e}")
    
    console.log("✅ Service startup complete. API ready.")

# EXECUTION ORDER: Runs when the application server shuts down.
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    console.log("🛑 Shutting down service...")

    # Cancel the background top-charts refresh
    from routes.itunes import stop_refresh_scheduler
    stop_refresh_scheduler()

    executor.shutdown(wait=True)
    console.log("✅ Executor shut down.")

# ============================================
# REGISTER ROUTERS
# ============================================

# Health and System
app.include_router(health.router)

# Core Audio & ML Features
app.include_router(recommendations.router)

# User Interactions & Analytics
app.include_router(interactions.router)

# Administrative Feature Processing
app.include_router(feature_processing.router)

# External Integrations
app.include_router(itunes.router)

# Visualization
app.include_router(visualization.router)

# Image Generation (AI image proxy for onset-reactive visuals)
app.include_router(image_generation.router)


if __name__ == "__main__":
    # Railway injects PORT (often 8080) but routes public traffic to the
    # Dockerfile EXPOSE port (5000).  Always bind to 5000 so the two match.
    port = 5000
    reload_enabled = str(os.getenv("UVICORN_RELOAD", "false")).strip().lower() in {"1", "true", "yes", "on"}
    console.log(f"🔌 Running on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload_enabled)
