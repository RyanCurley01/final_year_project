#!/usr/bin/env bash
set -euo pipefail

echo "Running devcontainer post-create steps..."

# Ensure pip and npm are up to date
python3 -m pip install --upgrade pip
if command -v npm >/dev/null 2>&1; then
  npm --version || true
fi

# Ensure the venv PATH is available for this script
VENV_PATH=${VENV_PATH:-/opt/venv}
export PATH="$VENV_PATH/bin:$PATH"

# Install frontend deps if package.json exists in frontend directory
if [ -f ./frontend/package.json ]; then
  echo "Found frontend/package.json — installing npm dependencies..."
  cd ./frontend && npm install || true
  cd ..
fi

# Install python deps if requirements.txt exists (for AI service)
if [ -f ./ai_service/requirements.txt ]; then
  echo "Found ai_service/requirements.txt — installing Python dependencies into venv..."
  "$VENV_PATH/bin/pip" install --upgrade pip || true
  "$VENV_PATH/bin/pip" install -r ./ai_service/requirements.txt || true
fi

# Install python deps if requirements.txt exists in root
if [ -f requirements.txt ]; then
  echo "Found requirements.txt — installing Python dependencies..."
  "$VENV_PATH/bin/pip" install -r requirements.txt || true
fi

# Pre-cache Gradle dependencies for any Java projects to avoid fetching at first build
if [ -f ./backend/gradlew ]; then
  echo "Found Gradle wrapper — pre-caching dependencies..."
  cd ./backend && ./gradlew dependencies --no-daemon || true
  cd ..
fi

# Initialize Git LFS for the repository
if command -v git-lfs >/dev/null 2>&1; then
  echo "Initializing Git LFS..."
  git lfs install || true
  git lfs pull || true
fi

echo "Devcontainer setup complete."
