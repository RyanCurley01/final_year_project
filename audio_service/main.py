# audio_service/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

from utils import console
from config import executor
import ml_service

# Import Routers
from routes import (
    health,
    recommendations,
    interactions,
    feature_processing,
    itunes,
    visualization
)

# Initialize FastAPI app
app = FastAPI(title="Audio Analysis Service", version="2.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
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
    """
    console.log("🚀 Starting Audio Analysis Service...")
    
    # Initialize ML components (Cache, Scaler, PCA)
    await ml_service.startup_cache()
    
    console.log("✅ Service startup complete. API ready.")

# EXECUTION ORDER: Runs when the application server shuts down.
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    console.log("🛑 Shutting down service...")
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


if __name__ == "__main__":
    # For local debugging
    port = int(os.getenv("PORT", 5000))
    console.log(f"🔌 Running on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
