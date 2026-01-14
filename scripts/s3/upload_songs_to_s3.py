#!/usr/bin/env python3
"""
Upload all extracted songs to S3
"""
import boto3
import yaml
from pathlib import Path
import os

# Configuration
BACKEND_CONFIG_PATH = Path(__file__).parent.parent / "backend" / "products-service" / "src" / "main" / "resources" / "application.yml"
EXTRACTED_SONGS_DIR = Path(__file__).parent / "extracted_songs"

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

def upload_songs():
    """Upload all songs from extracted_songs directory to S3"""
    if not EXTRACTED_SONGS_DIR.exists():
        print(f"❌ Directory not found: {EXTRACTED_SONGS_DIR}")
        return False
    
    aws_config = load_aws_config()
    
    # Create S3 client
    s3_client = boto3.client(
        's3',
        region_name=aws_config['region'],
        aws_access_key_id=aws_config['access_key_id'],
        aws_secret_access_key=aws_config['secret_access_key']
    )
    
    bucket_name = aws_config['bucket_name']
    
    # Get all WAV files
    wav_files = list(EXTRACTED_SONGS_DIR.glob('*.wav'))
    
    if not wav_files:
        print(f"❌ No .wav files found in {EXTRACTED_SONGS_DIR}")
        return False
    
    print(f"📤 Uploading {len(wav_files)} songs to S3...\n")
    
    uploaded_count = 0
    failed_count = 0
    
    for wav_file in sorted(wav_files):
        s3_key = f"songs/{wav_file.name}"
        file_size_mb = wav_file.stat().st_size / (1024 * 1024)
        
        try:
            print(f"   Uploading: {wav_file.name} ({file_size_mb:.2f} MB)...", end='', flush=True)
            
            s3_client.upload_file(
                str(wav_file),
                bucket_name,
                s3_key,
                ExtraArgs={
                    'ContentType': 'audio/wav'
                }
            )
            
            print(" ✓")
            uploaded_count += 1
            
        except Exception as e:
            print(f" ✗ Error: {e}")
            failed_count += 1
    
    print(f"\n{'='*60}")
    print(f"✅ Successfully uploaded: {uploaded_count}/{len(wav_files)} songs")
    if failed_count > 0:
        print(f"❌ Failed: {failed_count} songs")
    print(f"{'='*60}")
    
    return failed_count == 0

if __name__ == "__main__":
    try:
        success = upload_songs()
        exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)
