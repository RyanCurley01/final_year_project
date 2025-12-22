#!/bin/bash

# Audio Feature Extraction Setup Script
# Installs required dependencies and runs feature extraction

echo "🎵 Audio Feature Extraction Setup"
echo "=================================="

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

echo ""
echo "📦 Installing required Python packages..."
pip install --user librosa soundfile pymysql boto3 pyyaml || {
    echo "⚠️  Regular pip install failed, trying with sudo..."
    sudo pip install librosa soundfile pymysql boto3 pyyaml
}

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "📖 Usage Instructions:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option 1: Extract from S3 (recommended)"
echo "  python3 scripts/extract_audio_features.py"
echo ""
echo "Option 2: Extract from local files"
echo "  python3 scripts/extract_audio_features.py --local-dir /path/to/music/files"
echo ""
echo "Option 3: Process only first N products (for testing)"
echo "  python3 scripts/extract_audio_features.py --limit 5"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 The script will:"
echo "   1. Connect to your database"
echo "   2. Find all music products (with AlbumTitle)"
echo "   3. Download audio files from S3 or use local files"
echo "   4. Extract audio features using librosa"
echo "   5. Insert features into AudioFeatures table"
echo "   6. Skip products that already have features"
echo ""
echo "🚀 Ready to extract features!"
echo ""
