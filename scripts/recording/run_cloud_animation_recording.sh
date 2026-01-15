#!/bin/bash
#
# Run Cloud Animation Recording and Upload to S3
# This script records the cloud animation as a video and uploads it to AWS S3.
#
# Prerequisites:
# - Node.js and npm installed
# - Python 3 with boto3 and pyyaml installed
# - ffmpeg installed (for video encoding)
# - Puppeteer npm package installed
#
# Usage:
#   ./run_cloud_animation_recording.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "🎬 Cloud Animation Recording & Upload"
echo "============================================"
echo ""

# Check for required tools
echo "🔍 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "❌ ffmpeg is not installed. Install with: sudo apt-get install ffmpeg"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed."
    exit 1
fi

# Check if puppeteer is installed
if [ ! -d "node_modules/puppeteer" ]; then
    echo "📦 Installing puppeteer..."
    npm install puppeteer
fi

echo "✅ All prerequisites met!"
echo ""

# Step 1: Record the animation
echo "============================================"
echo "Step 1: Recording Cloud Animation"
echo "============================================"
node record_cloud_animation.js

# Step 2: Upload to S3
echo ""
echo "============================================"
echo "Step 2: Uploading to AWS S3"
echo "============================================"
python3 upload_cloud_animation_to_s3.py

echo ""
echo "============================================"
echo "🎉 All done!"
echo "============================================"
echo ""
echo "The cloud animation video has been uploaded to S3."
echo "The init-database.sh file already references the video URL."
echo ""
echo "Next steps:"
echo "1. Verify the video is accessible at the S3 URL"
echo "2. Reinitialize the database if needed"
echo "3. Test the frontend to ensure videos display correctly"
