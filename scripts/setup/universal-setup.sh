set -e  # Exit on error

echo "=========================================="
echo "🚀 Universal Setup Script Starting..."
echo "=========================================="

# Fix venv permissions if needed
VENV_PATH=${VENV_PATH:-/opt/venv}
if [ ! -w "$VENV_PATH" ]; then
    echo "🔧 Fixing venv permissions..."
    sudo chown -R vscode:vscode "$VENV_PATH" 2>/dev/null || true
fi

# Detect environment
if [ "$CODESPACES" = "true" ]; then
    echo "🚀 Environment: GitHub Codespaces"
    ENVIRONMENT="codespaces"
else
    echo "🏠 Environment: Local devcontainer"
    ENVIRONMENT="localhost"
fi

# Ensure we're using the venv
VENV_PATH=${VENV_PATH:-/opt/venv}
export PATH="$VENV_PATH/bin:$PATH"
echo "✅ Using Python from: $(which python3)"

# Wait for database to be ready
echo ""
echo "⏳ Checking for database connection..."
max_attempts=10
attempt=0
db_ready=false

# Try different connection methods in order of preference
# Get credentials from environment
DB_USER="${DB_USERNAME}"\nDB_PASS="${DB_PASSWORD}"\n\nwhile [ $attempt -lt $max_attempts ]; do\n    # First try host.docker.internal (external services)\n    if mysqladmin ping -h host.docker.internal -u "$DB_USER" -p"$DB_PASS" --silent 2>/dev/null; then\n        echo "✅ Database is ready! (connected via external services)"\n        db_ready=true\n        break\n    # Then try 'db' service name (old devcontainer setup)\n    elif mysqladmin ping -h db -u "$DB_USER" -p"$DB_PASS" --silent 2>/dev/null; then\n        echo "✅ Database is ready! (connected via 'db' service)"\n        db_ready=true\n        break\n    # Then try localhost\n    elif mysqladmin ping -h localhost -u "$DB_USER" -p"$DB_PASS" --silent 2>/dev/null; then\n        echo "✅ Database is ready! (connected via localhost)"\n        db_ready=true\n        break\n    # Finally try 127.0.0.1\n    elif mysqladmin ping -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASS" --silent 2>/dev/null; then\n        echo "✅ Database is ready! (connected via 127.0.0.1)"\n        db_ready=true\n        break\n    fi
    
    attempt=$((attempt + 1))
    echo "  Waiting for database... (attempt $attempt/$max_attempts)"
    sleep 2
done

if [ "$db_ready" = false ]; then
    echo "⚠️  Warning: Could not connect to database after $max_attempts attempts"
    echo "   Continuing with setup, but database operations may fail"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."

# AI Service dependencies
if [ -f "audio_service/requirements.txt" ]; then
    echo "  Installing AI Service dependencies..."
    "$VENV_PATH/bin/pip" install -q -r audio_service/requirements.txt || {
        echo "⚠️  AI Service dependencies installation had issues (non-fatal)"
    }
fi

# Frontend dependencies
if [ -f "frontend/package.json" ]; then
    echo "  Installing Frontend dependencies..."
    cd frontend
    npm install || {
        echo "⚠️  Frontend dependencies installation had issues (non-fatal)"
    }
    cd ..
fi

# Backend - Gradle wrapper permissions and cache dependencies
if [ -f "backend/gradlew" ]; then
    echo "  Setting up Backend..."
    chmod +x backend/gradlew
    cd backend
    ./gradlew dependencies --no-daemon || {
        echo "⚠️  Gradle dependency caching had issues (non-fatal)"
    }
    cd ..
fi

# Setup environment files (only if setup scripts exist)
echo ""
echo "🔧 Configuring environment files..."

if [ -f "audio_service/setup_env.py" ]; then
    echo "  Configuring AI Service environment..."
    cd audio_service
    python3 setup_env.py || echo "⚠️  AI Service env setup failed (non-fatal)"
    cd ..
else
    echo "  ℹ️  No AI Service setup script found (skipping)"
fi

if [ -f "backend/setup_backend_env.py" ]; then
    echo "  Configuring Backend environment..."
    cd backend
    python3 setup_backend_env.py || echo "⚠️  Backend env setup failed (non-fatal)"
    cd ..
else
    echo "  ℹ️  No Backend setup script found (skipping)"
fi

if [ -f "frontend/setup_frontend_env.py" ]; then
    echo "  Configuring Frontend environment..."
    cd frontend
    python3 setup_frontend_env.py || echo "⚠️  Frontend env setup failed (non-fatal)"
    cd ..
else
    echo "  ℹ️  No Frontend setup script found (skipping)"
fi

# Initialize Git LFS if available
if command -v git-lfs >/dev/null 2>&1; then
    echo ""
    echo "📦 Initializing Git LFS..."
    git lfs install --skip-repo || true
    git lfs pull || true
fi

echo ""
echo "=========================================="
echo "✅ Universal Setup Complete!"
echo "=========================================="
