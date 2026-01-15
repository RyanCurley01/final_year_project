#!/usr/bin/env python3
"""
Upload the recorded cloud animation video to AWS S3
and update the database with the video URL.
"""
import boto3
import yaml
from pathlib import Path
import os

# Configuration
BACKEND_CONFIG_PATH = Path(__file__).parent.parent / "backend" / "products-service" / "src" / "main" / "resources" / "application.yml"
VIDEO_PATH = Path(__file__).parent / "recorded_videos" / "cloud-animation.mp4"
S3_VIDEO_KEY = "Music Cover Image and cloud movement script/cloud-animation.mp4"

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

def upload_video():
    """Upload the cloud animation video to S3"""
    if not VIDEO_PATH.exists():
        print(f"❌ Video file not found: {VIDEO_PATH}")
        print("   Run 'node record_cloud_animation.js' first to generate the video.")
        return None
    
    aws_config = load_aws_config()
    bucket_name = aws_config['bucket_name']
    
    # Create S3 client
    s3_client = boto3.client(
        's3',
        region_name=aws_config['region'],
        aws_access_key_id=aws_config['access_key_id'],
        aws_secret_access_key=aws_config['secret_access_key']
    )
    
    file_size_mb = VIDEO_PATH.stat().st_size / (1024 * 1024)
    
    print(f"📤 Uploading cloud animation video to S3...")
    print(f"   File: {VIDEO_PATH.name} ({file_size_mb:.2f} MB)")
    print(f"   Bucket: {bucket_name}")
    print(f"   Key: {S3_VIDEO_KEY}")
    
    try:
        s3_client.upload_file(
            str(VIDEO_PATH),
            bucket_name,
            S3_VIDEO_KEY,
            ExtraArgs={
                'ContentType': 'video/mp4'
            }
        )
        
        # Construct the S3 URL
        video_url = f"https://{bucket_name}.s3.{aws_config['region']}.amazonaws.com/{S3_VIDEO_KEY}"
        
        print(f"\n✅ Upload successful!")
        print(f"📎 Video URL: {video_url}")
        
        return video_url
        
    except Exception as e:
        print(f"❌ Upload failed: {e}")
        return None

def generate_sql_update(video_url):
    """Generate SQL to update albums with the video URL"""
    sql = f"""
-- Update all music albums to use the cloud animation video
-- This replaces the static albumCoverImageUrl with the animated video URL

UPDATE Products 
SET albumCoverImageUrl = '{video_url}'
WHERE AlbumTitle IS NOT NULL 
  AND AlbumTitle != '';

-- Verify the update
SELECT ProductID, AlbumTitle, albumCoverImageUrl 
FROM Products 
WHERE AlbumTitle IS NOT NULL 
LIMIT 5;
"""
    return sql

def main():
    print("=" * 60)
    print("🎬 Cloud Animation Video Uploader")
    print("=" * 60 + "\n")
    
    video_url = upload_video()
    
    if video_url:
        print("\n" + "=" * 60)
        print("📝 SQL to update the database:")
        print("=" * 60)
        sql = generate_sql_update(video_url)
        print(sql)
        
        # Save SQL to file
        sql_path = Path(__file__).parent / "update_album_cover_video.sql"
        with open(sql_path, 'w') as f:
            f.write(sql)
        print(f"\n📁 SQL saved to: {sql_path}")
        
        print("\n" + "=" * 60)
        print("🎉 Done! Next steps:")
        print("=" * 60)
        print("1. Update init-database.sh to use the video URL for albums")
        print("2. Or run the generated SQL against your database")
        print("3. Update frontend components to handle video display")
        
        return True
    
    return False

if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
