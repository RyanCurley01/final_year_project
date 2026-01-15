#!/bin/bash

# Frontend environment setup script for both local and Codespaces
# Automatically detects environment and sets correct URLs

echo "🔧 Setting up frontend environment..."

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env from .env.example"
    else
        echo "⚠️  Warning: .env.example not found"
        # Create basic .env file
        cat > .env << EOF
# Frontend Environment Variables
VITE_API_BASE_URL=http://localhost:5000
VITE_BACKEND_API_URL=http://localhost:8080
VITE_ENVIRONMENT=local
EOF
        echo "✅ Created basic .env file"
    fi
fi

# Check if we're in GitHub Codespaces
if [ "$CODESPACES" = "true" ] && [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
    echo "🚀 Detected GitHub Codespaces environment: $CODESPACE_NAME"
    
    # Set Codespaces URLs
    AI_API_URL="https://${CODESPACE_NAME}-5000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    BACKEND_API_URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    
    echo "📍 AI API URL: $AI_API_URL"
    echo "📍 Backend API URL: $BACKEND_API_URL"
    
    # Update .env file with Codespaces URLs
    sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$AI_API_URL|g" .env
    sed -i "s|VITE_BACKEND_API_URL=.*|VITE_BACKEND_API_URL=$BACKEND_API_URL|g" .env
    
    # Update environment
    if ! grep -q "VITE_ENVIRONMENT=" .env; then
        echo "VITE_ENVIRONMENT=codespaces" >> .env
    else
        sed -i "s|VITE_ENVIRONMENT=.*|VITE_ENVIRONMENT=codespaces|g" .env
    fi
    
    # Create runtime config for JavaScript
    mkdir -p public
    cat > public/env-config.js << EOF
// Auto-generated environment configuration for Codespaces
window.ENV_CONFIG = {
  "VITE_API_BASE_URL": "$AI_API_URL",
  "VITE_BACKEND_API_URL": "$BACKEND_API_URL",
  "VITE_ENVIRONMENT": "codespaces",
};
EOF
    
else
    echo "🏠 Detected local development environment"
    
    # Set local URLs
    sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=http://localhost:5000|g" .env
    sed -i "s|VITE_BACKEND_API_URL=.*|VITE_BACKEND_API_URL=http://localhost:8080|g" .env
    
    # Update environment
    if ! grep -q "VITE_ENVIRONMENT=" .env; then
        echo "VITE_ENVIRONMENT=local" >> .env
    else
        sed -i "s|VITE_ENVIRONMENT=.*|VITE_ENVIRONMENT=local|g" .env
    fi
    
    # Create runtime config for JavaScript
    mkdir -p public
    cat > public/env-config.js << EOF
// Auto-generated environment configuration for local development
window.ENV_CONFIG = {
  "VITE_API_BASE_URL": "http://localhost:5000",
  "VITE_BACKEND_API_URL": "http://localhost:8080",
  "VITE_ENVIRONMENT": "local",
};
EOF
fi

echo "✅ Frontend environment setup complete!"
echo "📋 Current configuration:"
grep -E "(VITE_API_BASE_URL|VITE_BACKEND_API_URL|VITE_ENVIRONMENT)=" .env

# Show the generated config file
echo ""
echo "📋 Runtime configuration (public/env-config.js):"
cat public/env-config.js
