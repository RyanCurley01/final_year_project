# AI Recommendation Service

This service provides personalized game and music recommendations using PyTorch and ONNX Runtime.

## Architecture

- **Framework**: FastAPI (Python REST API)
- **ML Engine**: PyTorch for training, ONNX Runtime for inference
- **Data Source**: Purchased Products from backend via API
- **Model Storage**: AWS S3
- **Deployment**: Containerized service

## Setup

### Install Dependencies
```bash
cd ai_service
pip install -r requirements.txt
```

### Run the Service
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

## API Endpoints

- `GET /recommendations/{user_id}` - Get personalized recommendations for a user
- `POST /train` - Trigger model retraining (admin only)
- `GET /health` - Health check

## Environment Variables

Create a `.env` file with:
```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your_bucket_name
BACKEND_API_URL=http://localhost:8080
MODEL_PATH=/models/recommendation_model.onnx
```

## Model Training

The recommendation model uses collaborative filtering based on:
- User purchase history
- Product categories (games/music)
- User preferences
- Similar user behavior patterns

## Integration with Backend

The AI service:
1. Fetches purchase history from `Purchased_Products` service
2. Processes data and generates recommendations
3. Returns recommendations to frontend via REST API
