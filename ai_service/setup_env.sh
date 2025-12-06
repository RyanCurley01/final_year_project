#!/bin/bash

# Environment setup script for AI Recommendation Service
# Automatically detects if running in GitHub Codespaces and sets appropriate URLs

echo "Setting up environment for AI Recommendation Service..."

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env from .env.example"
    else
        echo "Warning: .env.example not found"
        exit 1
    fi
fi

# Check if we're in GitHub Codespaces
if [ "$CODESPACES" = "true" ] && [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
    echo "Detected GitHub Codespaces environment: $CODESPACE_NAME"
    
    # Set Codespaces URLs
    BACKEND_URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    DATABASE_HOST="${CODESPACE_NAME}-3306.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    
    echo "Backend URL: $BACKEND_URL"
    
    # Update .env file with Codespaces URLs
    sed -i "s|BACKEND_API_URL=.*|BACKEND_API_URL=$BACKEND_URL|g" .env
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=mysql+pymysql://user:password@$DATABASE_HOST/game_music_store|g" .env
    
    # Add environment marker
    if ! grep -q "ENVIRONMENT=" .env; then
        echo "ENVIRONMENT=codespaces" >> .env
    else
        sed -i "s|ENVIRONMENT=.*|ENVIRONMENT=codespaces|g" .env
    fi
    
else
    echo "Detected local development environment"
    
    # Ensure local URLs are set
    sed -i "s|BACKEND_API_URL=.*|BACKEND_API_URL=http://localhost:8080|g" .env
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=mysql+pymysql://user:password@localhost:3306/game_music_store|g" .env
    
    # Add environment marker
    if ! grep -q "ENVIRONMENT=" .env; then
        echo "ENVIRONMENT=local" >> .env
    else
        sed -i "s|ENVIRONMENT=.*|ENVIRONMENT=local|g" .env
    fi
fi

echo "Environment setup complete!"
echo "Current configuration:"
grep -E "(BACKEND_API_URL|DATABASE_URL|ENVIRONMENT)=" .env
