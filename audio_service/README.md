# Audio Feature Similarity Service

This service provides song recommendations using audio feature similarity matching.

## Architecture

- **Framework**: FastAPI (Python REST API)
- **Algorithm**: Weighted audio feature similarity (tempo, energy, valence, danceability)
- **Data Source**: AudioFeatures table from MySQL database
- **Storage**: AWS S3 for media files with presigned URL generation
- **Deployment**: Containerized service

## Setup

### Install Dependencies
```bash
cd audio_service
pip install -r requirements.txt
```

### Run the Service
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

## API Endpoints

- `GET /` - Service status
- `GET /health` - Health check with database status
- `GET /api/songs/top-played?limit=5` - Get top played songs
- `POST /api/interactions/record` - Record user interaction (play, purchase, etc.)
- `POST /api/audio/realtime-recommendations` - Get similar songs based on audio features
- `POST /api/audio/similar-artist-songs` - Get songs matching artist profiles
- `GET /api/audio/features/{product_id}` - Get audio features for a product
- `GET /api/config/check` - Check service configuration

## Environment Variables

Create a `.env` file with:
```
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=rootpassword
MYSQL_DATABASE=Game_Store_System
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=eu-west-1
AWS_S3_BUCKET_NAME=game-and-music-files
```

## Recommendation Algorithm

The recommendation system uses **weighted audio feature similarity**:

| Feature | Weight | Description |
|---------|--------|-------------|
| Energy | 35% | Intensity/power of the track |
| Tempo | 25% | BPM matching (ratio-based) |
| Valence | 20% | Musical positivity/mood |
| Danceability | 15% | Rhythm strength |
| Acousticness | 5% | Acoustic vs electronic |

Songs are scored using:
```python
similarity = (tempo_match * 0.25 + energy_match * 0.35 + 
              mood_match * 0.20 + dance_match * 0.15 + 
              acoustic_match * 0.05)
```

## Integration with Frontend

The service:
1. Caches audio features from database at startup for fast responses
2. Generates presigned S3 URLs for secure media access
3. Provides real-time similarity recommendations via REST API
4. Records user interactions for play count tracking
