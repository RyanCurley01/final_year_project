#!/usr/bin/env python3
"""
Configure CORS policy for S3 bucket to allow frontend access
"""
import boto3
import yaml
import json
from pathlib import Path

# Configuration
BACKEND_CONFIG_PATH = Path(__file__).parent.parent / "backend" / "products-service" / "src" / "main" / "resources" / "application.yml"

def load_aws_config():
    """Load AWS configuration from application.yml"""
    with open(BACKEND_CONFIG_PATH, 'r') as f:
        config = yaml.safe_load(f)
    
    aws = config['aws']
    return {
        'bucket_name': aws['s3']['bucket-name'],
        'region': aws['region'],
        'access_key_id': aws['access-key-id'],
        'secret_access_key': aws['secret-access-key']
    }

def configure_cors():
    """Configure CORS policy for the S3 bucket"""
    aws_config = load_aws_config()
    
    # Create S3 client
    s3_client = boto3.client(
        's3',
        region_name=aws_config['region'],
        aws_access_key_id=aws_config['access_key_id'],
        aws_secret_access_key=aws_config['secret_access_key']
    )
    
    bucket_name = aws_config['bucket_name']
    
    # Define CORS configuration
    cors_configuration = {
        'CORSRules': [
            {
                'AllowedHeaders': ['*'],
                'AllowedMethods': ['GET', 'HEAD'],
                'AllowedOrigins': [
                    'http://localhost:5173',  # Vite dev server
                    'http://localhost:3000',  # Alternative dev port
                    'http://localhost:8080',  # Backend port
                    '*'  # Allow all origins (you can restrict this in production)
                ],
                'ExposeHeaders': [
                    'ETag',
                    'Content-Length',
                    'Content-Type'
                ],
                'MaxAgeSeconds': 3600
            }
        ]
    }
    
    print(f"🔧 Configuring CORS for bucket: {bucket_name}")
    print(f"📋 CORS Configuration:")
    print(json.dumps(cors_configuration, indent=2))
    
    try:
        # Apply CORS configuration
        s3_client.put_bucket_cors(
            Bucket=bucket_name,
            CORSConfiguration=cors_configuration
        )
        
        print(f"\n✅ CORS configuration applied successfully!")
        
        # Verify the configuration
        response = s3_client.get_bucket_cors(Bucket=bucket_name)
        print(f"\n✓ Verified CORS configuration:")
        print(json.dumps(response['CORSRules'], indent=2, default=str))
        
    except Exception as e:
        print(f"❌ Error configuring CORS: {e}")
        return False
    
    return True

if __name__ == "__main__":
    try:
        configure_cors()
    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)
