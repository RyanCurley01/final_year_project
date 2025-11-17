#!/usr/bin/env python3
"""
Complete script to:
1. Read AWS credentials from application.yml
2. Download ZIP file from S3 using those credentials
3. Extract individual songs
4. Generate and execute SQL to insert songs into database
"""

import zipfile
import os
import sys
import mysql.connector
import yaml
import boto3
from pathlib import Path
from botocore.exceptions import ClientError, NoCredentialsError

# Configuration
ALBUM_COVER_URL = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp'
S3_SONGS_BASE_URL = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/'
PRICE_PER_SONG = 0.50
STOCK_QUANTITY = 200

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'rootpassword',
    'database': 'Game_Store_System'
}

def load_aws_config():
    """Load AWS credentials from application.yml"""
    yml_path = '/workspaces/final_year_project/backend/products-service/src/main/resources/application.yml'
    
    try:
        with open(yml_path, 'r') as f:
            config = yaml.safe_load(f)
        
        aws_config = {
            'region': config['aws']['region'],
            'access_key_id': config['aws']['access-key-id'],
            'secret_access_key': config['aws']['secret-access-key'],
            'bucket_name': config['aws']['s3']['bucket-name']
        }
        
        print(f"✅ Loaded AWS credentials from application.yml")
        print(f"   Region: {aws_config['region']}")
        print(f"   Bucket: {aws_config['bucket_name']}")
        
        return aws_config
    except Exception as e:
        print(f"❌ Error loading AWS config: {e}")
        return None

def download_from_s3(aws_config, s3_key='Song_WAV_Files_For_Final_Year_Project.zip', output_path='songs.zip'):
    """Download ZIP file from S3 using boto3"""
    print(f"\n📥 Downloading ZIP from S3...")
    print(f"   Bucket: {aws_config['bucket_name']}")
    print(f"   Key: {s3_key}")
    
    try:
        # Create S3 client
        s3_client = boto3.client(
            's3',
            region_name=aws_config['region'],
            aws_access_key_id=aws_config['access_key_id'],
            aws_secret_access_key=aws_config['secret_access_key']
        )
        
        # Download file
        s3_client.download_file(aws_config['bucket_name'], s3_key, output_path)
        
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # Convert to MB
        print(f"✅ Downloaded successfully: {output_path} ({file_size:.2f} MB)")
        
        return output_path
    
    except NoCredentialsError:
        print(f"❌ AWS credentials not found or invalid")
        return None
    except ClientError as e:
        print(f"❌ AWS Error: {e}")
        return None
    except Exception as e:
        print(f"❌ Error downloading: {e}")
        return None

def extract_songs(zip_path, output_dir="extracted_songs"):
    """Extract all audio files from ZIP"""
    print(f"\n📦 Extracting songs from ZIP...")
    
    # Create output directory
    Path(output_dir).mkdir(exist_ok=True)
    
    songs = []
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file_info in zip_ref.filelist:
                # Check if it's an audio file
                if file_info.filename.lower().endswith(('.wav', '.mp3', '.flac', '.ogg', '.m4a')):
                    filename = os.path.basename(file_info.filename)
                    
                    # Skip hidden files, __MACOSX, and empty names
                    if filename and not filename.startswith('.') and '__MACOSX' not in file_info.filename:
                        # Extract file
                        target_path = os.path.join(output_dir, filename)
                        
                        with zip_ref.open(file_info.filename) as source:
                            with open(target_path, 'wb') as target:
                                target.write(source.read())
                        
                        songs.append(filename)
                        print(f"   ✓ {filename}")
        
        print(f"\n✅ Extracted {len(songs)} songs to: {output_dir}")
        return songs
    
    except Exception as e:
        print(f"❌ Error extracting: {e}")
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
        (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, 
         albumCoverImageUrl, gameCoverImageUrl, file_url, preview_url, StockQuantity) 
        VALUES 
        (NULL, %s, NULL, NULL, %s, %s, NULL, %s, NULL, %s)
        """
        
        inserted_count = 0
        for song_filename in sorted(songs):
            # Create song title (clean up filename)
            song_name = Path(song_filename).stem  # Remove extension
            song_title = f"Electronic Works - {song_name}"
            
            # Create S3 URL for the song
            file_url = f"{S3_SONGS_BASE_URL}{song_filename}"
            
            # Insert into database
            values = (song_title, PRICE_PER_SONG, ALBUM_COVER_URL, file_url, STOCK_QUANTITY)
            
            try:
                cursor.execute(insert_query, values)
                inserted_count += 1
                print(f"   ✓ {song_title}")
            except mysql.connector.Error as e:
                print(f"   ✗ Error inserting {song_title}: {e}")
        
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
        "INSERT INTO Products (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, albumCoverImageUrl, gameCoverImageUrl, file_url, preview_url, StockQuantity) VALUES"
    ]
    
    values = []
    for song_filename in sorted(songs):
        song_name = Path(song_filename).stem
        song_title = f"Electronic Works - {song_name}"
        file_url = f"{S3_SONGS_BASE_URL}{song_filename}"
        
        value = f"(NULL, '{song_title}', NULL, NULL, {PRICE_PER_SONG}, '{ALBUM_COVER_URL}', NULL, '{file_url}', NULL, {STOCK_QUANTITY})"
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
    
    # Step 2: Download ZIP from S3
    zip_path = download_from_s3(aws_config)
    if not zip_path:
        print("\n❌ Failed to download ZIP file. Exiting.")
        sys.exit(1)
    
    # Step 3: Extract songs
    songs = extract_songs(zip_path)
    if not songs:
        print("\n❌ No songs found in ZIP file. Exiting.")
        sys.exit(1)
    
    print(f"\n📊 Found {len(songs)} songs")
    
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
    
    # Cleanup
    print("\n🧹 Cleaning up...")
    if os.path.exists(zip_path):
        os.remove(zip_path)
        print(f"   Removed: {zip_path}")
    
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
