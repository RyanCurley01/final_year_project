#!/usr/bin/env bash
set -euo pipefail

echo "Running devcontainer post-create steps..."

# Ensure pip and npm are up to date
python3 -m pip install --user --upgrade pip
if command -v npm >/dev/null 2>&1; then
  npm --version || true
fi

# Install frontend deps if package.json exists
if [ -f package.json ]; then
  echo "Found package.json — installing npm dependencies..."
  npm install || true
fi

# Install python deps if requirements.txt exists
if [ -f requirements.txt ]; then
  echo "Found requirements.txt — installing Python dependencies..."
  python3 -m pip install --user -r requirements.txt || true
fi

# Pre-cache Maven dependencies for any Java projects to avoid fetching at first build
if command -v mvn >/dev/null 2>&1; then
  echo "Searching for pom.xml files to pre-cache Maven dependencies..."
  find . -name pom.xml -print -execdir bash -lc 'mvn -DskipTests dependency:go-offline || true' \;
fi

echo "Devcontainer setup complete."
