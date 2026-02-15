#!/usr/bin/env python3
"""
Complete script to:
1. Read AWS credentials from application.yml
2. List and download songs directly from S3 songs/ folder
3. Generate and execute SQL to insert songs into database
"""

import os
import sys
import mysql.connector
import yaml
import boto3
from dotenv import load_dotenv
from pathlib import Path
from botocore.exceptions import ClientError, NoCredentialsError
from urllib.parse import quote

# Load environment variables from .env.docker if it exists
load_dotenv('.env.docker')
if not os.getenv('AWS_ACCESS_KEY_ID'):
    # Try .env if .env.docker didn't set it (fallback)
    load_dotenv()

# Configuration
ALBUM_COVER_URL = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music%20Cover%20Image%20and%20cloud%20movement%20script/cloud-animation.mp4'
S3_SONGS_BASE_URL = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/'
S3_SONGS_PREFIX = 'songs/'
PRICE_PER_SONG = 0.50
STOCK_QUANTITY = 200

# Database configuration
DB_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_ROOT_PASSWORD', os.getenv('DB_PASSWORD')),
    'database': os.getenv('MYSQL_DATABASE', 'Game_Store_System')
}

def resolve_placeholder(value):
    """Resolve Spring Boot style placeholders ${VAR:default}"""
    if not isinstance(value, str):
        return value
    
    # Simple check for ${...}
    if value.startswith('${') and value.endswith('}'):
        content = value[2:-1]
        if ':' in content:
            var_name, default_val = content.split(':', 1)
            return os.getenv(var_name, default_val)
        else:
            return os.getenv(content, value)
    return value

def load_aws_config():
    """Load AWS credentials from application.yml"""
    yml_path = '/workspaces/final_year_project/backend/products-service/src/main/resources/application.yml'
    
    try:
        with open(yml_path, 'r') as f:
            config = yaml.safe_load(f)
        
        aws_config = {
            'region': resolve_placeholder(config['aws']['region']),
            'access_key_id': resolve_placeholder(config['aws']['access-key-id']),
            'secret_access_key': resolve_placeholder(config['aws']['secret-access-key']),
            'bucket_name': resolve_placeholder(config['aws']['s3']['bucket-name'])
        }
        
        print(f"✅ Loaded AWS credentials from application.yml")
        print(f"   Region: {aws_config['region']}")
        print(f"   Bucket: {aws_config['bucket_name']}")
        
        return aws_config
    except Exception as e:
        print(f"❌ Error loading AWS config: {e}")
        return None

def list_songs_from_s3(aws_config):
    """List all song files in the S3 songs/ folder"""
    print(f"\n📥 Listing songs from S3 bucket...")
    print(f"   Bucket: {aws_config['bucket_name']}")
    print(f"   Prefix: {S3_SONGS_PREFIX}")
    
    try:
        # Create S3 client
        s3_client = boto3.client(
            's3',
            region_name=aws_config['region'],
            aws_access_key_id=aws_config['access_key_id'],
            aws_secret_access_key=aws_config['secret_access_key']
        )
        
        # List objects in the songs/ folder
        response = s3_client.list_objects_v2(
            Bucket=aws_config['bucket_name'],
            Prefix=S3_SONGS_PREFIX
        )
        
        songs = []
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                # Skip the folder itself and only get audio files
                if key != S3_SONGS_PREFIX and key.lower().endswith(('.wav', '.mp3', '.flac', '.ogg', '.m4a')):
                    filename = os.path.basename(key)
                    songs.append(filename)
                    print(f"   ✓ {filename}")
        
        print(f"\n✅ Found {len(songs)} songs in S3")
        return sorted(songs)
    
    except NoCredentialsError:
        print(f"❌ AWS credentials not found or invalid")
        return []
    except ClientError as e:
        print(f"❌ AWS Error: {e}")
        return []
    except Exception as e:
        print(f"❌ Error listing songs: {e}")
        return []

def download_songs_from_s3(aws_config, songs, output_dir="extracted_songs"):
    """Download songs from S3 to local directory (optional for audio feature extraction)"""
    print(f"\n📦 Downloading songs from S3...")
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True, parents=True)
    
    try:
        # Create S3 client
        s3_client = boto3.client(
            's3',
            region_name=aws_config['region'],
            aws_access_key_id=aws_config['access_key_id'],
            aws_secret_access_key=aws_config['secret_access_key']
        )
        
        downloaded = []
        for song_filename in songs:
            s3_key = f"{S3_SONGS_PREFIX}{song_filename}"
            local_path = str(output_path / song_filename)
            
            try:
                s3_client.download_file(aws_config['bucket_name'], s3_key, local_path)
                downloaded.append(song_filename)
                print(f"   ✓ {song_filename}")
            except Exception as e:
                print(f"   ✗ Error downloading {song_filename}: {e}")
        
        print(f"\n✅ Downloaded {len(downloaded)} songs to: {output_dir}")
        return downloaded
    
    except Exception as e:
        print(f"❌ Error downloading songs: {e}")
        return []

def insert_songs_to_database(songs):
    """Insert song records into the database"""
    print(f"\n💾 Inserting songs into database...")
    
    try:
        # Connect to database
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Prepare INSERT statement
        insert_query = """
        INSERT INTO Products 
        (AlbumTitle, AlbumPrice, albumCoverImageUrl, file_url, preview_url, StockQuantity) 
        VALUES 
        (%s, %s, %s, %s, %s, %s)
        """
        
        inserted_count = 0
        for song_filename in sorted(songs):
            # Create song title (clean up filename)
            song_name = Path(song_filename).stem  # Remove extension
            
            # Create S3 URL for the song with proper URL encoding for special characters
            # URL encode the filename to handle apostrophes, spaces, and other special characters
            encoded_filename = quote(song_filename, safe='')
            file_url = f"{S3_SONGS_BASE_URL}{encoded_filename}"
            
            # Insert into database
            values = (song_name, PRICE_PER_SONG, ALBUM_COVER_URL, file_url, file_url, STOCK_QUANTITY)
            
            try:
                cursor.execute(insert_query, values)
                inserted_count += 1
                print(f"   ✓ {song_name}")
            except mysql.connector.Error as e:
                print(f"   ✗ Error inserting {song_name}: {e}")
        
        # Commit changes
        conn.commit()
        
        print(f"\n✅ Successfully inserted {inserted_count} songs into database")
        
        # Close connection
        cursor.close()
        conn.close()
        
        return inserted_count
    
    except mysql.connector.Error as e:
        print(f"❌ Database error: {e}")
        return 0

def generate_sql_file(songs, output_file="insert_songs.sql"):
    """Generate SQL file as backup"""
    print(f"\n📝 Generating SQL file as backup...")
    
    sql_lines = [
        "-- Insert individual songs from Selected Electronic Works",
        "USE Game_Store_System;\n",
        "INSERT INTO Products (AlbumTitle, AlbumPrice, albumCoverImageUrl, file_url, preview_url, StockQuantity) VALUES"
    ]
    
    values = []
    for song_filename in sorted(songs):
        song_name = Path(song_filename).stem
        
        # URL encode the filename to handle apostrophes, spaces, and other special characters
        encoded_filename = quote(song_filename, safe='')
        file_url = f"{S3_SONGS_BASE_URL}{encoded_filename}"
        
        # Replace single quotes in song_name with escaped quotes for SQL (e.g. Ted's -> Ted\'s)
        # Note: In standard SQL, escaping a single quote is often done by doubling it (''), but here we use backslash depending on MySQL mode.
        # Actually standard SQL uses doubling: 'Ted''s'. Let's use doubling to be safe.
        song_name_sql = song_name.replace("'", "''")
        
        value = f"('{song_name_sql}', {PRICE_PER_SONG}, '{ALBUM_COVER_URL}', '{file_url}', '{file_url}', {STOCK_QUANTITY})"
        values.append(value)
    
    sql_lines.append(",\n".join(values) + ";")
    
    with open(output_file, 'w') as f:
        f.write("\n".join(sql_lines))
    
    print(f"✅ SQL file saved: {output_file}")
    return output_file

def main():
    print("=" * 60)
    print("  Song Extraction and Database Insertion Tool")
    print("  Using AWS credentials from application.yml")
    print("=" * 60)
    
    # Step 1: Load AWS configuration
    aws_config = load_aws_config()
    if not aws_config:
        print("\n❌ Failed to load AWS configuration. Exiting.")
        sys.exit(1)
    
    # Step 2: List songs from S3 songs/ folder
    songs = list_songs_from_s3(aws_config)
    if not songs:
        print("\n❌ No songs found in S3 bucket. Exiting.")
        sys.exit(1)
    
    print(f"\n📊 Found {len(songs)} songs")
    
    # Step 3: Download songs for local processing (optional, for audio feature extraction)
    print("\n" + "=" * 60)
    # download_response = input("Do you want to download songs locally? (yes/no): ").strip().lower()
    download_response = 'no' 
    print("Skipping download (SQL generation only mode)")
    
    if download_response in ['yes', 'y']:
        downloaded = download_songs_from_s3(aws_config, songs)
        if downloaded:
            print(f"   ✅ Songs saved to: extracted_songs/")
    
    # Step 4: Generate SQL file (backup)
    sql_file = generate_sql_file(songs)
    
    # Step 5: Ask user if they want to insert into database
    print("\n" + "=" * 60)
    response = input("Do you want to insert these songs into the database? (yes/no): ").strip().lower()
    
    if response in ['yes', 'y']:
        inserted = insert_songs_to_database(songs)
        
        if inserted > 0:
            print("\n" + "=" * 60)
            print("✅ SUCCESS!")
            print(f"   - {inserted} songs added to database")
            print(f"   - Each song has the album cover image")
            print(f"   - SQL backup saved to: {sql_file}")
            print("\n   The songs should now appear in your frontend!")
            print("=" * 60)
        else:
            print("\n❌ Failed to insert songs. Check the error messages above.")
            print(f"   You can manually run: mysql ... < {sql_file}")
    else:
        print(f"\n📝 Songs not inserted. You can manually run:")
        print(f"   mysql -h localhost -u root -prootpassword Game_Store_System < {sql_file}")
    
    print("\n✅ Done!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
