#!/bin/bash
# Script to install dependencies and run the song extraction tool

echo "=================================================="
echo "  Song Extraction and Database Insertion Setup"
echo "=================================================="
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found"
    exit 1
fi

echo "📦 Installing required Python packages..."
pip install mysql-connector-python

echo ""
echo "🚀 Running song extraction and insertion..."
echo ""

python3 extract_and_insert_songs.py

echo ""
echo "✅ Process complete!"
