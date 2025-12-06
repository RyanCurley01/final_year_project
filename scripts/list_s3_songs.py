#!/usr/bin/env python3
"""
List all songs in the S3 bucket
"""
import boto3
import yaml
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

def list_songs():
    """List all files in the songs/ folder"""
    aws_config = load_aws_config()
    
    # Create S3 client
    s3_client = boto3.client(
        's3',
        region_name=aws_config['region'],
        aws_access_key_id=aws_config['access_key_id'],
        aws_secret_access_key=aws_config['secret_access_key']
    )
    
    bucket_name = aws_config['bucket_name']
    
    print(f"📁 Listing files in {bucket_name}/songs/\n")
    
    try:
        # List all objects in songs/ folder
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='songs/'
        )
        
        if 'Contents' not in response:
            print("❌ No files found in songs/ folder")
            return
        
        files = [obj for obj in response['Contents'] if not obj['Key'].endswith('/')]
        print(f"Found {len(files)} files:\n")
        
        for obj in sorted(files, key=lambda x: x['Key']):
            size_mb = obj['Size'] / (1024 * 1024)
            print(f"  • {obj['Key']} ({size_mb:.2f} MB)")
        
    except Exception as e:
        print(f"❌ Error listing files: {e}")

if __name__ == "__main__":
    list_songs()
