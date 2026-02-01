#!/bin/bash

# Script to import TopCharts songs into the database
# Run this from Windows/WSL, NOT from inside the dev container

set -e

AUDIO_SERVICE_URL="http://localhost:5000"

echo "🎵 TopCharts Songs Import Script"
echo "=================================="
echo ""

# Step 1: Rebuild audio-service container
echo "📦 Step 1: Rebuilding audio-service container..."
cd "$(dirname "$0")"
docker compose -f docker-compose.services.yml -p gamestore_services up -d --build audio-service
echo "✅ Container rebuilt successfully"
echo ""

# Step 2: Wait for service to be ready
echo "⏳ Step 2: Waiting for audio service to start..."
sleep 8
echo "✅ Service should be ready"
echo ""

# Step 3: Clear previously imported songs
echo "🗑️  Step 3: Clearing previously imported songs..."
curl -X DELETE "${AUDIO_SERVICE_URL}/api/itunes/clear-imported-songs"
echo ""
echo "✅ Cleanup complete"
echo ""

# Step 4: Import songs for each artist
echo "📥 Step 4: Importing TopCharts songs..."
echo ""

# Artist 1: Aphex Twin (50 songs)
echo "🎹 Importing Aphex Twin songs..."
curl -X POST "${AUDIO_SERVICE_URL}/api/itunes/import-to-database?limit=50&genre=Aphex%20Twin"
echo ""
echo "✅ Aphex Twin songs imported"
echo ""

sleep 3

# Artist 2: Boards of Canada (50 songs)
echo "🎹 Importing Boards of Canada songs..."
curl -X POST "${AUDIO_SERVICE_URL}/api/itunes/import-to-database?limit=50&genre=Boards%20of%20Canada"
echo ""
echo "✅ Boards of Canada songs imported"
echo ""

sleep 3

# Artist 3: Squarepusher (50 songs)
echo "🎹 Importing Squarepusher songs..."
curl -X POST "${AUDIO_SERVICE_URL}/api/itunes/import-to-database?limit=50&genre=Squarepusher"
echo ""
echo "✅ Squarepusher songs imported"
echo ""

echo "=================================="
echo "🎉 Import Complete!"
echo "=================================="
echo ""
echo "📊 Summary:"
echo "  - 150 songs imported (50 per artist)"
echo "  - Artists: Aphex Twin, Boards of Canada, Squarepusher"
echo "  - These songs are now available for audio-based recommendations"
echo ""
