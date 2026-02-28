#!/bin/bash

# Script to refresh TopCharts songs in the database.
# Performs a live differential sync:
#   - Removes songs that dropped off the iTunes charts (from ALL tables)
#   - Imports new songs that appeared on the charts
#   - Updates stock availability from real data
#
# The audio-service also runs this automatically every 6 hours.
# Run this manually from Windows/WSL, or inside the dev container.

set -e

AUDIO_SERVICE_URL="${AUDIO_SERVICE_URL:-http://localhost:5000}"

echo "🎵 TopCharts Live Refresh Script"
echo "=================================="
echo ""

# Step 1: Rebuild audio-service container (optional – skip if already running)
if [ "${SKIP_REBUILD:-}" != "1" ]; then
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
fi

# Step 3: Run differential refresh
echo "🔄 Step 3: Running live top-charts refresh..."
echo "   This will:"
echo "   - Fetch current Top 150 Pop songs + 150 Electronic artist songs from iTunes"
echo "   - Remove songs that dropped off the charts (from Products, AudioFeatures,"
echo "     Stock, UserInteractions, Recommendations, Wishlist, Orders, etc.)"
echo "   - Import new songs that appeared on the charts"
echo "   - Update Stock availability from real preview_url / AudioFeatures data"
echo "   - Reload the ML recommendation cache"
echo ""

RESULT=$(curl -s -X POST "${AUDIO_SERVICE_URL}/api/itunes/refresh-topcharts")
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

echo ""
echo "=================================="
echo "🎉 Refresh Complete!"
echo "=================================="
echo ""
echo "📊 The service also auto-refreshes every 1 hour in the background."
echo "   Override interval with env var TOPCHARTS_REFRESH_INTERVAL (seconds)."
echo ""
