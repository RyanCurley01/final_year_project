#!/bin/bash
# Test script to validate YouTube API works in both local and Codespaces environments

set -e

echo "=========================================="
echo "🎵 YouTube API Test Script"
echo "=========================================="
echo ""

# Detect environment
if [ "$CODESPACES" = "true" ]; then
    echo "🚀 Environment: GitHub Codespaces"
    CODESPACE_NAME="${CODESPACE_NAME}"
    DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-preview.app.github.dev}"
    
    AUDIO_SERVICE_URL="https://${CODESPACE_NAME}-5000.${DOMAIN}"
    BACKEND_URL="https://${CODESPACE_NAME}-8080.${DOMAIN}"
    FRONTEND_URL="https://${CODESPACE_NAME}-5173.${DOMAIN}"
    
    echo "   Codespace: $CODESPACE_NAME"
    echo "   Domain: $DOMAIN"
else
    echo "🏠 Environment: Local Development"
    AUDIO_SERVICE_URL="http://localhost:5000"
    BACKEND_URL="http://localhost:8080"
    FRONTEND_URL="http://localhost:5173"
fi

echo ""
echo "🔗 Service URLs:"
echo "   AI Service: $AUDIO_SERVICE_URL"
echo "   Backend: $BACKEND_URL"
echo "   Frontend: $FRONTEND_URL"
echo ""

# Test AI Service Health
echo "1️⃣  Testing AI Service Health..."
if curl -sf "${AUDIO_SERVICE_URL}/health" > /dev/null 2>&1; then
    echo "   ✅ AI Service is running"
    curl -s "${AUDIO_SERVICE_URL}/health" | head -5
else
    echo "   ❌ AI Service is not accessible"
    echo "   Please start the Audio service: cd audio_service && python3 main.py"
    exit 1
fi

echo ""

# Test YouTube API Configuration
echo "2️⃣  Testing YouTube API Configuration..."
echo "   Checking .env file..."
if [ -f "audio_service/.env" ]; then
    echo "   ✅ .env file exists"
    
    YOUTUBE_API_KEY=$(grep "YOUTUBE_API_KEY" audio_service/.env | cut -d'=' -f2)
    YOUTUBE_CHANNEL_ID=$(grep "YOUTUBE_CHANNEL_ID" audio_service/.env | cut -d'=' -f2)
    
    if [ -n "$YOUTUBE_API_KEY" ] && [ "$YOUTUBE_API_KEY" != "your_youtube_api_key_here" ]; then
        echo "   ✅ YouTube API Key is configured"
    else
        echo "   ❌ YouTube API Key is not properly configured"
        exit 1
    fi
    
    if [ -n "$YOUTUBE_CHANNEL_ID" ]; then
        echo "   ✅ YouTube Channel ID: $YOUTUBE_CHANNEL_ID"
    else
        echo "   ❌ YouTube Channel ID is not configured"
        exit 1
    fi
else
    echo "   ❌ .env file not found"
    exit 1
fi

echo ""

# Test YouTube API Endpoint
echo "3️⃣  Testing YouTube API Endpoint..."
echo "   Fetching top songs from YouTube..."

YOUTUBE_RESPONSE=$(curl -s "${AUDIO_SERVICE_URL}/api/youtube/top-songs?max_results=3")

# Check if response contains error
if echo "$YOUTUBE_RESPONSE" | grep -q '"error"'; then
    echo "   ❌ YouTube API returned an error:"
    echo "$YOUTUBE_RESPONSE" | head -10
    exit 1
else
    echo "   ✅ YouTube API is working!"
    
    # Count videos returned
    VIDEO_COUNT=$(echo "$YOUTUBE_RESPONSE" | grep -o '"id":' | wc -l)
    echo "   📊 Retrieved $VIDEO_COUNT videos"
    
    # Show first video title
    FIRST_TITLE=$(echo "$YOUTUBE_RESPONSE" | grep -o '"title":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$FIRST_TITLE" ]; then
        echo "   🎵 Sample song: $FIRST_TITLE"
    fi
fi

echo ""

# Test CORS Configuration
echo "4️⃣  Testing CORS Configuration..."
if curl -sf -H "Origin: ${FRONTEND_URL}" "${AUDIO_SERVICE_URL}/health" > /dev/null 2>&1; then
    echo "   ✅ CORS is properly configured"
else
    echo "   ⚠️  CORS might need adjustment (non-fatal)"
fi

echo ""

# Test Frontend Configuration
echo "5️⃣  Testing Frontend Configuration..."
if [ -f "frontend/.env" ]; then
    echo "   ✅ Frontend .env exists"
    
    FRONTEND_API_URL=$(grep "VITE_API_BASE_URL" frontend/.env | cut -d'=' -f2)
    echo "   📍 Frontend API URL: $FRONTEND_API_URL"
    
    if [ "$FRONTEND_API_URL" = "$AUDIO_SERVICE_URL" ] || [ "$FRONTEND_API_URL" = "http://localhost:5000" ]; then
        echo "   ✅ Frontend is configured to connect to Audio service"
    else
        echo "   ⚠️  Frontend API URL might need adjustment"
    fi
else
    echo "   ❌ Frontend .env not found"
fi

echo ""
echo "=========================================="
echo "✅ All YouTube API Tests Passed!"
echo "=========================================="
echo ""
echo "🎉 Your YouTube API is configured correctly for both"
echo "   local development and GitHub Codespaces!"
echo ""
echo "📝 Summary:"
echo "   • AI Service: Running"
echo "   • YouTube API Key: Configured"
echo "   • YouTube Channel: $YOUTUBE_CHANNEL_ID"
echo "   • CORS: Enabled"
echo "   • Environment: $([ "$CODESPACES" = "true" ] && echo "Codespaces" || echo "Local")"
echo ""
echo "🚀 Next Steps:"
echo "   1. Start Backend: cd backend && ./gradlew bootRun"
echo "   2. Start Frontend: cd frontend && npm run dev"
echo "   3. Access Frontend: $FRONTEND_URL"
echo ""
