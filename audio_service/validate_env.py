#!/usr/bin/env python3
"""
Environment validation script for AI Recommendation Service
Checks all environment variables and identifies potential issues
"""

import os
from dotenv import load_dotenv

def validate_environment():
    """Validate all environment variables and identify issues"""
    
    print("🔍 Environment Validation Report")
    print("=" * 50)
    
    # Load environment variables
    load_dotenv()
    
    issues = []
    warnings = []
    
    # Check critical variables
    critical_vars = {
        'SERVICE_PORT': os.getenv('SERVICE_PORT', '5000'),
        'SERVICE_HOST': os.getenv('SERVICE_HOST', '0.0.0.0'),
        'MODEL_PATH': os.getenv('MODEL_PATH', './models/recommendation_model.onnx'),
        'BACKEND_API_URL': os.getenv('BACKEND_API_URL', 'http://localhost:8080'),
    }
    
    print("\n✅ Critical Variables:")
    for var, value in critical_vars.items():
        print(f"  {var}: {value}")
    
    # Check YouTube API configuration
    youtube_api_key = os.getenv('YOUTUBE_API_KEY')
    youtube_channel_id = os.getenv('YOUTUBE_CHANNEL_ID', '@Ritrix252')
    
    print(f"\n🎵 YouTube Configuration:")
    print(f"  YOUTUBE_API_KEY: {'✅ Set' if youtube_api_key and youtube_api_key != 'your_youtube_api_key_here' else '❌ Not configured'}")
    print(f"  YOUTUBE_CHANNEL_ID: {youtube_channel_id}")
    
    if not youtube_api_key or youtube_api_key == 'your_youtube_api_key_here':
        warnings.append("YouTube API key not configured - will use fallback data")
    
    # Check environment detection
    environment = os.getenv('ENVIRONMENT', 'unknown')
    is_codespaces = os.getenv('CODESPACES') == 'true'
    codespace_name = os.getenv('CODESPACE_NAME')
    
    print(f"\n🌍 Environment Detection:")
    print(f"  ENVIRONMENT: {environment}")
    print(f"  CODESPACES: {'✅ Yes' if is_codespaces else '❌ No'}")
    print(f"  CODESPACE_NAME: {codespace_name if codespace_name else 'Not set'}")
    
    # Check file paths
    model_path = os.getenv('MODEL_PATH', './models/recommendation_model.onnx')
    env_file_exists = os.path.exists('.env')
    model_exists = os.path.exists(model_path)
    
    print(f"\n📁 File System:")
    print(f"  .env file: {'✅ Exists' if env_file_exists else '❌ Missing'}")
    print(f"  Model file: {'✅ Exists' if model_exists else '❌ Missing'} ({model_path})")
    
    if not env_file_exists:
        issues.append("Missing .env file - run setup_env.py or copy from .env.example")
    
    if not model_exists:
        warnings.append(f"Model file not found at {model_path} - will use fallback recommendations")
    
    # Check URL configuration for Codespaces
    if is_codespaces:
        backend_url = os.getenv('BACKEND_API_URL', 'http://localhost:8080')
        if 'localhost' in backend_url:
            issues.append("Using localhost URL in Codespaces - should use Codespaces URL")
        elif codespace_name and codespace_name not in backend_url:
            issues.append("Backend URL doesn't match current Codespace name")
    
    # Print summary
    print(f"\n📊 Summary:")
    print(f"  Issues: {len(issues)}")
    print(f"  Warnings: {len(warnings)}")
    
    if issues:
        print(f"\n❌ Issues Found:")
        for i, issue in enumerate(issues, 1):
            print(f"  {i}. {issue}")
    
    if warnings:
        print(f"\n⚠️  Warnings:")
        for i, warning in enumerate(warnings, 1):
            print(f"  {i}. {warning}")
    
    if not issues and not warnings:
        print(f"\n🎉 All checks passed! Environment is properly configured.")
        return True
    
    print(f"\n💡 Recommendations:")
    if issues or warnings:
        print(f"  1. Run 'python setup_env.py' to auto-configure environment")
        print(f"  2. Check the .env file and update missing values")
        print(f"  3. Test with 'GET /api/config/check' endpoint")
    
    return len(issues) == 0

if __name__ == "__main__":
    validate_environment()
