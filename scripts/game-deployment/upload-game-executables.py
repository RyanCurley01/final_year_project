#!/usr/bin/env python3
"""
Python script to upload game executables to S3 and update database
Alternative to the bash script for cross-platform compatibility
"""

import os
import sys
import boto3
from pathlib import Path
from urllib.parse import quote
import pymysql
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
S3_BUCKET = os.getenv('AWS_S3_BUCKET_NAME', 'game-and-music-files')
S3_REGION = os.getenv('AWS_REGION', 'eu-west-1')
S3_PREFIX = 'Game Executables'
GAME_EXECUTABLES_DIR = Path(__file__).parent.parent.parent / 'game executables'

# Database configuration
DB_CONFIG = {
    'host': os.getenv('MYSQL_HOST', os.getenv('DB_HOST', 'localhost')),
    'port': int(os.getenv('MYSQL_PORT', os.getenv('DB_PORT', '3306'))),
    'user': os.getenv('MYSQL_USER', os.getenv('DB_USER', 'root')),
    'password': os.getenv('MYSQL_PASSWORD', os.getenv('MYSQL_ROOT_PASSWORD', os.getenv('DB_PASSWORD'))),
    'database': os.getenv('MYSQL_DATABASE', os.getenv('DB_NAME', 'Game_Store_System')),
}

def init_s3_client():
    """Initialize S3 client"""
    try:
        client = boto3.client(
            's3',
            region_name=S3_REGION,
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
        )
        # Test connection
        client.head_bucket(Bucket=S3_BUCKET)
        return client
    except Exception as e:
        print(f"❌ Error initializing S3 client: {e}")
        return None

def upload_game_executable(s3_client, file_path):
    """Upload a single game executable to S3"""
    file_name = file_path.name
    s3_key = f"{S3_PREFIX}/{file_name}"
    
    print(f"📤 Uploading: {file_name}")
    
    try:
        # Upload file
        s3_client.upload_file(
            str(file_path),
            S3_BUCKET,
            s3_key,
            ExtraArgs={
                'ContentType': 'application/x-msdownload',
                'Metadata': {
                    'game-executable': 'true',
                    'uploaded-by': 'python-deployment-script'
                }
            }
        )
        
        # Generate S3 URL (URL-encoded)
        s3_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{quote(s3_key)}"
        
        print(f"✅ Uploaded: {file_name}")
        print(f"   URL: {s3_url}")
        
        return s3_url, file_name
    except Exception as e:
        print(f"❌ Failed to upload {file_name}: {e}")
        return None, file_name

def update_database(game_urls):
    """Update database with S3 URLs"""
    if not game_urls:
        print("⚠️  No URLs to update in database")
        return
    
    try:
        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        print("\n📝 Updating database...")
        
        for file_name, s3_url in game_urls:
            # Remove .exe extension to get game title
            game_title = file_name.replace('.exe', '')
            
            sql = """
                UPDATE Products 
                SET file_url = %s, preview_url = NULL
                WHERE gameTitle = %s
            """
            
            cursor.execute(sql, (s3_url, game_title))
            
            if cursor.rowcount > 0:
                print(f"✅ Updated {game_title} in database")
            else:
                print(f"⚠️  No product found with gameTitle: {game_title}")
        
        connection.commit()
        print(f"\n✅ Database updated successfully ({len(game_urls)} products)")
        
        # Verify updates
        print("\n🔍 Verifying updates...")
        cursor.execute("""
            SELECT ProductID, gameTitle, file_url 
            FROM Products 
            WHERE gameTitle IN ('Jimmy Jungle', 'Midnight Haunt', 'Platform Game')
        """)
        results = cursor.fetchall()
        
        for row in results:
            print(f"   Product {row[0]}: {row[1]}")
            print(f"   URL: {row[2]}")
        
        cursor.close()
        connection.close()
        
    except Exception as e:
        print(f"❌ Database error: {e}")

def main():
    """Main function"""
    print("=" * 60)
    print("🎮 Game Executable Upload Script (Python)")
    print("=" * 60)
    print(f"S3 Bucket: {S3_BUCKET}")
    print(f"Region: {S3_REGION}")
    print(f"Local Directory: {GAME_EXECUTABLES_DIR}")
    print()
    
    # Check if directory exists
    if not GAME_EXECUTABLES_DIR.exists():
        print(f"❌ Error: Game executables directory not found: {GAME_EXECUTABLES_DIR}")
        sys.exit(1)
    
    # Initialize S3 client
    s3_client = init_s3_client()
    if not s3_client:
        print("❌ Failed to initialize S3 client. Check your AWS credentials.")
        sys.exit(1)
    
    print("✅ S3 client initialized\n")
    
    # Find all .exe files
    exe_files = list(GAME_EXECUTABLES_DIR.glob('*.exe'))
    
    if not exe_files:
        print("⚠️  No .exe files found in directory")
        sys.exit(0)
    
    print(f"Found {len(exe_files)} game executable(s)\n")
    
    # Upload each file
    uploaded_urls = []
    failed_count = 0
    
    for exe_file in exe_files:
        s3_url, file_name = upload_game_executable(s3_client, exe_file)
        if s3_url:
            uploaded_urls.append((file_name, s3_url))
        else:
            failed_count += 1
        print()
    
    # Summary
    print("=" * 60)
    print("📊 Upload Summary")
    print("=" * 60)
    print(f"✅ Uploaded: {len(uploaded_urls)}")
    if failed_count > 0:
        print(f"❌ Failed: {failed_count}")
    print()
    
    # Update database if uploads were successful
    if uploaded_urls:
        update_db = input("Update database with these URLs? (y/n): ").lower()
        if update_db == 'y':
            update_database(uploaded_urls)
        else:
            print("\n⚠️  Skipping database update")
            print("\nYou can manually update the database with these SQL statements:")
            print()
            for file_name, s3_url in uploaded_urls:
                game_title = file_name.replace('.exe', '')
                print(f"UPDATE Products")
                print(f"SET file_url = '{s3_url}', preview_url = NULL")
                print(f"WHERE gameTitle = '{game_title}';")
                print()
    
    print("\n✅ Complete!")

if __name__ == '__main__':
    main()
