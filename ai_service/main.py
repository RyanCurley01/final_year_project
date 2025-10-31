from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import onnxruntime as ort
import numpy as np
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(
    title="AI Recommendation Service",
    description="Personalized game and music recommendations",
    version="1.0.0"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class Recommendation(BaseModel):
    product_id: int
    product_name: str
    category: str
    score: float

class RecommendationResponse(BaseModel):
    user_id: int
    recommendations: List[Recommendation]

# Global variables for model
model_session: Optional[ort.InferenceSession] = None
MODEL_PATH = os.getenv("MODEL_PATH", "./models/recommendation_model.onnx")

@app.on_event("startup")
async def load_model():
    """Load the ONNX model on startup"""
    global model_session
    try:
        if os.path.exists(MODEL_PATH):
            model_session = ort.InferenceSession(MODEL_PATH)
            print(f"Model loaded successfully from {MODEL_PATH}")
        else:
            print(f"Warning: Model not found at {MODEL_PATH}. Using fallback recommendations.")
    except Exception as e:
        print(f"Error loading model: {e}")

@app.get("/")
async def root():
    return {
        "service": "AI Recommendation Service",
        "status": "running",
        "model_loaded": model_session is not None
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": model_session is not None
    }

@app.get("/recommendations/{user_id}", response_model=RecommendationResponse)
async def get_recommendations(user_id: int, limit: int = 10):
    """
    Get personalized recommendations for a user
    
    Args:
        user_id: The user's ID
        limit: Maximum number of recommendations to return
    """
    try:
        # TODO: Fetch user's purchase history from backend
        # TODO: Run inference using ONNX model
        # For now, return dummy recommendations
        
        dummy_recommendations = [
            Recommendation(
                product_id=1,
                product_name="The Witcher 3: Wild Hunt",
                category="game",
                score=0.95
            ),
            Recommendation(
                product_id=2,
                product_name="Cyberpunk 2077 Soundtrack",
                category="music",
                score=0.89
            ),
            Recommendation(
                product_id=3,
                product_name="Red Dead Redemption 2",
                category="game",
                score=0.87
            ),
        ]
        
        return RecommendationResponse(
            user_id=user_id,
            recommendations=dummy_recommendations[:limit]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")

@app.post("/train")
async def train_model():
    """
    Trigger model retraining (admin only)
    TODO: Add authentication
    """
    return {
        "status": "training_started",
        "message": "Model training has been triggered"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
