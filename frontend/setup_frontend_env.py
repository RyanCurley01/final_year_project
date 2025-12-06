#!/usr/bin/env python3
"""
Frontend environment setup script
Automatically configures URLs for both local and Codespaces environments
Uses dynamic environment variable resolution
"""

import os
import subprocess
import json

def get_runtime_urls():
    """Get the actual runtime URLs for the current environment"""
    
    # Check if we're in GitHub Codespaces
    is_codespaces = os.getenv('CODESPACES') == 'true'
    codespace_name = os.getenv('CODESPACE_NAME')
    github_codespaces_port_forwarding_domain = os.getenv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'preview.app.github.dev')
    
    if is_codespaces and codespace_name:
        # GitHub Codespaces environment - use dynamic URLs
        ai_api_url = f"https://{codespace_name}-5000.{github_codespaces_port_forwarding_domain}"
        backend_api_url = f"https://{codespace_name}-8080.{github_codespaces_port_forwarding_domain}"
        environment = 'codespaces'
        
        print(f"🚀 Detected GitHub Codespaces: {codespace_name}")
        
    else:
        # Local development environment
        ai_api_url = 'http://localhost:5000'
        backend_api_url = 'http://localhost:8080'
        environment = 'local'
        
        print("🏠 Detected Local Development Environment")
    
    return ai_api_url, backend_api_url, environment

def setup_frontend_environment():
    """Setup frontend environment variables with dynamic URL resolution"""
    
    # Get current environment URLs
    ai_api_url, backend_api_url, environment = get_runtime_urls()
    
    print(f"📍 AI API: {ai_api_url}")
    print(f"📍 Backend API: {backend_api_url}")
    print(f"🌍 Environment: {environment}")
    
    # Copy .env.example to .env if .env doesn't exist
    if not os.path.exists('.env'):
        if os.path.exists('.env.example'):
            import shutil
            shutil.copy('.env.example', '.env')
            print("Created .env from .env.example")
        else:
            print("Warning: .env.example not found")
    
    # Read current .env file
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    
    # Update environment variables with current values
    env_vars['VITE_API_BASE_URL'] = ai_api_url
    env_vars['VITE_BACKEND_API_URL'] = backend_api_url
    env_vars['VITE_ENVIRONMENT'] = environment
    
    # Preserve YouTube channel ID
    if 'VITE_YOUTUBE_CHANNEL_ID' not in env_vars:
        env_vars['VITE_YOUTUBE_CHANNEL_ID'] = '@Ritrix252'
    
    # Write updated .env file
    with open('.env', 'w') as f:
        f.write("# Frontend Environment Variables\n")
        f.write("# Variables prefixed with VITE_ are exposed to the browser\n")
        f.write("# Auto-configured for current environment\n\n")
        
        # YouTube Configuration
        f.write("# YouTube Configuration\n")
        f.write(f"VITE_YOUTUBE_CHANNEL_ID={env_vars.get('VITE_YOUTUBE_CHANNEL_ID')}\n\n")
        
        # API Configuration
        f.write("# API Configuration - Dynamically set for current environment\n")
        f.write(f"VITE_API_BASE_URL={env_vars.get('VITE_API_BASE_URL')}\n")
        f.write(f"VITE_BACKEND_API_URL={env_vars.get('VITE_BACKEND_API_URL')}\n\n")
        
        # Environment
        f.write("# Environment detection\n")
        f.write(f"VITE_ENVIRONMENT={env_vars.get('VITE_ENVIRONMENT')}\n\n")
        
        # Auto-detection info
        f.write("# Runtime environment info\n")
        f.write(f"# Codespace: {os.getenv('CODESPACE_NAME', 'none')}\n")
        f.write(f"# Domain: {os.getenv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'none')}\n")
    
    print("✅ Frontend environment configured successfully!")
    return True

def create_env_js():
    """Create a JavaScript file with environment configuration for runtime"""
    
    ai_api_url, backend_api_url, environment = get_runtime_urls()
    
    env_config = {
        'VITE_API_BASE_URL': ai_api_url,
        'VITE_BACKEND_API_URL': backend_api_url,
        'VITE_ENVIRONMENT': environment,
        'VITE_YOUTUBE_CHANNEL_ID': '@Ritrix252'
    }
    
    # Create public/env-config.js for runtime configuration
    os.makedirs('public', exist_ok=True)
    
    with open('public/env-config.js', 'w') as f:
        f.write('// Auto-generated environment configuration\n')
        f.write('// This file is updated automatically based on the current environment\n')
        f.write(f'window.ENV_CONFIG = {json.dumps(env_config, indent=2)};\n')
    
    print("✅ Created public/env-config.js for runtime configuration")

if __name__ == "__main__":
    setup_frontend_environment()
    create_env_js()
