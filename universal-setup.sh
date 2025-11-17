#!/bin/bash

# Universal startup script for both Codespaces and localhost
# This script automatically detects the environment and configures accordingly

# Detect environment
if [ "$CODESPACES" = "true" ]; then
    echo "🚀 Configuring GitHub Codespaces environment..."
    ENVIRONMENT="codespaces"
else
    echo "🏠 Configuring localhost devcontainer environment..."
    ENVIRONMENT="localhost"
fi

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
max_attempts=30
attempt=0

while ! mysqladmin ping -h db -u gamestore_user -pgamestore_pass --silent 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "❌ Database connection failed after $max_attempts attempts"
        echo "   Trying alternative connection methods..."
        
        # Try localhost connection for local development
        if mysqladmin ping -h localhost -u gamestore_user -pgamestore_pass --silent 2>/dev/null; then
            echo "✅ Database connected via localhost!"
            break
        elif mysqladmin ping -h 127.0.0.1 -u gamestore_user -pgamestore_pass --silent 2>/dev/null; then
            echo "✅ Database connected via 127.0.0.1!"
            break
        else
            echo "❌ Could not connect to database. Please check if MySQL is running."
            exit 1
        fi
    fi
    sleep 2
    echo "  Database not ready yet, waiting... (attempt $attempt/$max_attempts)"
done

if [ $attempt -lt $max_attempts ]; then
    echo "✅ Database is ready! (connected via db service)"
fi

# Run all environment setup scripts
echo "🔧 Setting up all services for $ENVIRONMENT environment..."

# Setup AI Service
if [ -d "ai_service" ]; then
    echo "📝 Configuring AI Service..."
    cd ai_service
    python setup_env.py
    cd ..
fi

# Setup Backend Services
if [ -d "backend" ]; then
    echo "📝 Configuring Backend Services..."
    cd backend
    python setup_backend_env.py
    cd ..
fi

# Setup Frontend
if [ -d "frontend" ]; then
    echo "📝 Configuring Frontend..."
    cd frontend
    python setup_frontend_env.py
    cd ..
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."

# AI Service dependencies
if [ -f "ai_service/requirements.txt" ]; then
    echo "  Installing AI Service dependencies..."
    cd ai_service
    pip install -r requirements.txt
    cd ..
fi

# Frontend dependencies
if [ -f "frontend/package.json" ]; then
    echo "  Installing Frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Backend - Gradle wrapper permissions
if [ -f "backend/gradlew" ]; then
    echo "  Setting up Backend Gradle permissions..."
    chmod +x backend/gradlew
fi

echo "✅ Environment setup complete for $ENVIRONMENT!"
echo ""
echo "🌐 Your services will be available at:"

if [ "$ENVIRONMENT" = "codespaces" ] && [ -n "$CODESPACE_NAME" ]; then
    echo "  • AI Service: https://${CODESPACE_NAME}-5000.preview.app.github.dev"
    echo "  • Backend: https://${CODESPACE_NAME}-8080.preview.app.github.dev"
    echo "  • Frontend: https://${CODESPACE_NAME}-5173.preview.app.github.dev"
    echo "  • Database: Internal Docker network (db:3306)"
else
    echo "  • AI Service: http://localhost:5000"
    echo "  • Backend: http://localhost:8080"
    echo "  • Frontend: http://localhost:5173 or http://localhost:3000"
    echo "  • Database: localhost:3306 or Docker network (db:3306)"
fi
echo ""
echo "🚀 To start services:"
echo "  • AI Service: cd ai_service && python main.py"
echo "  • Backend: cd backend && ./gradlew bootRun"
echo "  • Frontend: cd frontend && npm run dev"
echo ""
echo "🔍 To test connections:"
if [ "$ENVIRONMENT" = "codespaces" ]; then
    echo "  • Database: mysql -h db -u gamestore_user -pgamestore_pass Game_Store_System"
    echo "  • AI Service: curl http://localhost:5000/health"
    echo "  • Backend: curl http://localhost:8080/actuator/health"
else
    echo "  • Database: mysql -h db -u gamestore_user -pgamestore_pass Game_Store_System"
    echo "  • Database (alt): mysql -h localhost -u gamestore_user -pgamestore_pass Game_Store_System"
    echo "  • AI Service: curl http://localhost:5000/health"
    echo "  • Backend: curl http://localhost:8080/actuator/health"
fi

echo ""
echo "💡 Environment Details:"
echo "  • Container: $(if [ -f /.dockerenv ]; then echo "Yes (Docker)"; else echo "No (Native)"; fi)"
echo "  • Codespaces: $(if [ "$CODESPACES" = "true" ]; then echo "Yes"; else echo "No"; fi)"
echo "  • Remote Containers: $(if [ -n "$REMOTE_CONTAINERS" ]; then echo "Yes"; else echo "No"; fi)"
