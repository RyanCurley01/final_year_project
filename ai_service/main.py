from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import onnxruntime as ort
import numpy as np
import os
from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

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

# YouTube API configuration
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
YOUTUBE_CHANNEL_ID = os.getenv("YOUTUBE_CHANNEL_ID", "@Ritrix252")

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
    

@app.get("/api/youtube/top-songs")
async def get_top_songs(max_results: int = 10):
    """
    Fetch top songs/videos from the YouTube channel
    
    Args:
        max_results: Maximum number of videos to return (default: 10)
    """
    if not YOUTUBE_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="YouTube API key not configured"
        )
    
    try:
        # Build YouTube API client
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        
        # For @username format, we need to search for the channel
        channel_username = YOUTUBE_CHANNEL_ID.replace('@', '') if YOUTUBE_CHANNEL_ID.startswith('@') else YOUTUBE_CHANNEL_ID
        
        # Search for the channel by username/handle
        search_response = youtube.search().list(
            part='snippet',
            q=channel_username,
            type='channel',
            maxResults=1
        ).execute()
        
        if not search_response.get('items'):
            raise HTTPException(status_code=404, detail=f"Channel '{YOUTUBE_CHANNEL_ID}' not found")
        
        # Get the actual channel ID
        channel_id = search_response['items'][0]['snippet']['channelId']
        
        # Get the channel's uploads playlist ID
        channel_response = youtube.channels().list(
            part='contentDetails,snippet',
            id=channel_id
        ).execute()
        
        if not channel_response.get('items'):
            raise HTTPException(status_code=404, detail="Channel details not found")
        
        # Get the uploads playlist ID
        uploads_playlist_id = channel_response['items'][0]['contentDetails']['relatedPlaylists']['uploads']
        
        # Fetch ALL videos from the uploads playlist (or a large number)
        playlist_response = youtube.playlistItems().list(
            part='snippet,contentDetails',
            playlistId=uploads_playlist_id,
            maxResults=50  # Fetch more to sort by views
        ).execute()
        
        # Get video statistics for each video
        video_ids = [item['contentDetails']['videoId'] for item in playlist_response['items']]
        
        if not video_ids:
            return []
        
        videos_response = youtube.videos().list(
            part='statistics,snippet,contentDetails',
            id=','.join(video_ids)
        ).execute()
        
        # Sort videos by view count (descending)
        videos_sorted = sorted(
            videos_response['items'],
            key=lambda x: int(x['statistics'].get('viewCount', 0)),
            reverse=True
        )
        
        # Take only the requested number of top videos
        top_videos = videos_sorted[:max_results]
        
        # Format the response
        songs = []
        for video in top_videos:
            songs.append({
                'id': video['id'],
                'key': video['id'],  # For React key prop
                'title': video['snippet']['title'],
            })
        
        return songs
        
    except HttpError as e:
        raise HTTPException(
            status_code=e.resp.status,
            detail=f"YouTube API error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching YouTube data: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
