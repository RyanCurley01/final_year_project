#!/usr/bin/env python3
"""
Audio Feature Extraction Script
Extracts audio features from music files and populates the AudioFeatures table

This script:
1. Queries the Products table for all music products (with AlbumTitle)
2. Downloads audio files from S3 or uses local files
3. Extracts comprehensive audio features using librosa
4. Inserts features into the AudioFeatures database table

Usage:
    python extract_audio_features.py [--local-dir <path>] [--limit <n>]
"""

import argparse
import os
import sys
import yaml
import json
import tempfile
import numpy as np
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse, unquote

try:
    import pymysql
    import boto3
    import librosa
    from botocore.exceptions import ClientError
except ImportError as e:
    print(f"❌ Missing required package: {e}")
    print("\n📦 Install required packages:")
    print("   pip install pymysql boto3 librosa soundfile")
    sys.exit(1)

# Database configuration - build dynamically to respect env vars
_db_host = os.getenv('DB_HOST') or os.getenv('MYSQL_HOST') or 'host.docker.internal'
_db_port = int(os.getenv('DB_PORT') or os.getenv('MYSQL_PORT') or '3306')
_db_user = os.getenv('DB_USER') or os.getenv('MYSQL_USER') or 'root'
_db_pass = os.getenv('DB_PASSWORD') or os.getenv('MYSQL_ROOT_PASSWORD') or 'rootpassword'
_db_name = os.getenv('DB_NAME') or os.getenv('MYSQL_DATABASE') or 'Game_Store_System'

DB_CONFIG = {
    'host': _db_host,
    'port': _db_port,
    'user': _db_user,
    'password': _db_pass,
    'database': _db_name,
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'connect_timeout': 5,
    'read_timeout': 10,
    'write_timeout': 10
}

# Path to init-database.sh
INIT_DATABASE_PATH = '/workspaces/final_year_project/deployment/init-database.sh'


def parse_products_from_init_script():
    """
    Parse the init-database.sh file to extract music products.
    Returns a list of dicts with ProductID, AlbumTitle, and file_url.
    """
    import re
    
    try:
        with open(INIT_DATABASE_PATH, 'r') as f:
            content = f.read()
        
        products = []
        
        # Find the INSERT INTO Products statement
        # Pattern matches: (NULL, 'SongName', NULL, NULL, 0.5, 'cover_url', NULL, 'file_url', 'preview_url', 200)
        # For music: GameTitle is NULL, AlbumTitle has value
        pattern = r"\(NULL,\s*'([^']+)',\s*NULL,\s*NULL,\s*[\d.]+,\s*'[^']*',\s*NULL,\s*'([^']+)',\s*'[^']*',\s*\d+\)"
        
        matches = re.findall(pattern, content)
        
        # Product IDs start at 1 for games, then album, then individual songs
        # Based on init-database.sh: 4 games (1-4), 1 album (5), then songs (6+)
        # We need to count all products to get correct IDs
        
        # First, count all products in order
        all_products_pattern = r"\('([^']*)',\s*'?([^',]*)'?,\s*'?([^',]*)'?,\s*[\d.]+,\s*'?([^',]*)'?,\s*'([^']*)',\s*'?([^',]*)'?,\s*'([^']*)',\s*'?([^',]*)'?,\s*\d+\)"
        
        # Simpler approach: find all music product inserts (where GameTitle is NULL and AlbumTitle is not)
        # Skip the full album (Selected Electronic Works) which doesn't have individual file_url in songs folder
        
        product_id = 1  # Start counting
        
        # Find the Products INSERT section
        insert_start = content.find("INSERT INTO Products")
        if insert_start == -1:
            print("❌ Could not find Products INSERT in init-database.sh")
            return []
        
        insert_section = content[insert_start:]
        
        # Count games first (GameTitle is NOT NULL)
        # Games pattern: ('GameTitle', NULL, 'Platform', price, NULL, ...)
        games_pattern = r"\('([^']+)',\s*NULL,\s*'([^']+)',\s*[\d.]+,"
        games = re.findall(games_pattern, insert_section)
        product_id += len(games)  # Skip game IDs
        
        # Skip the album bundle (ID after games)
        # Album pattern: (NULL, 'Selected Electronic Works', NULL, NULL, 5.00, ...)
        album_pattern = r"\(NULL,\s*'Selected Electronic Works',"
        if re.search(album_pattern, insert_section):
            product_id += 1  # Skip album ID
        
        # Now find all individual songs
        # Individual songs pattern: (NULL, 'SongTitle', NULL, NULL, 0.5, 'cover', NULL, 'file_url', ...)
        # But NOT 'Selected Electronic Works'
        songs_pattern = r"\(NULL,\s*'([^']+)',\s*NULL,\s*NULL,\s*0\.5[0]*,\s*'[^']*',\s*NULL,\s*'([^']+)',\s*'[^']*',\s*\d+\)"
        songs = re.findall(songs_pattern, insert_section)
        
        for album_title, file_url in songs:
            # Skip the album bundle
            if album_title == 'Selected Electronic Works':
                continue
            
            products.append({
                'ProductID': product_id,
                'AlbumTitle': album_title,
                'file_url': file_url
            })
            product_id += 1
        
        print(f"   Found {len(games)} games (IDs 1-{len(games)})")
        print(f"   Found 1 album bundle (ID {len(games) + 1})")
        print(f"   Found {len(products)} individual songs (IDs {len(games) + 2}-{len(games) + 1 + len(products)})")
        
        return products
        
    except Exception as e:
        print(f"❌ Error parsing init-database.sh: {e}")
        import traceback
        traceback.print_exc()
        return []


def load_aws_config():
    """Load AWS credentials from application.yml"""
    yml_path = '/workspaces/final_year_project/backend/products-service/src/main/resources/application.yml'
    
    try:
        with open(yml_path, 'r') as f:
            config = yaml.safe_load(f)
        
        return {
            'region': config['aws']['region'],
            'access_key_id': config['aws']['access-key-id'],
            'secret_access_key': config['aws']['secret-access-key'],
            'bucket_name': config['aws']['s3']['bucket-name']
        }
    except Exception as e:
        print(f"⚠️  Could not load AWS config: {e}")
        return None


def get_s3_client(aws_config):
    """Create and return S3 client"""
    if not aws_config:
        return None
    
    try:
        return boto3.client(
            's3',
            region_name=aws_config['region'],
            aws_access_key_id=aws_config['access_key_id'],
            aws_secret_access_key=aws_config['secret_access_key']
        )
    except Exception as e:
        print(f"⚠️  Could not create S3 client: {e}")
        return None


def download_from_s3(s3_client, bucket_name, s3_url):
    """Download audio file from S3 to temporary file"""
    try:
        # Parse S3 key from URL
        parsed = urlparse(s3_url)
        s3_key = unquote(parsed.path.lstrip('/'))
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        temp_path = temp_file.name
        temp_file.close()
        
        # Download
        s3_client.download_file(bucket_name, s3_key, temp_path)
        return temp_path
    
    except Exception as e:
        print(f"      ❌ Download error: {e}")
        return None


def extract_audio_features(audio_path):
    """
    Extract comprehensive audio features using librosa
    
    Returns dict with all audio features needed for recommendations
    """
    try:
        # Load audio file
        y, sr = librosa.load(audio_path, sr=22050, duration=30)  # Load first 30 seconds
        
        # Basic info
        duration = int(librosa.get_duration(y=y, sr=sr))
        
        # Tempo and beat tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        tempo = float(tempo)
        
        # Spectral features
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spectral_centroid = float(np.mean(spectral_centroids))
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        spectral_rolloff_mean = float(np.mean(spectral_rolloff))
        
        # Zero crossing rate (noisiness)
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        zero_crossing_rate = float(np.mean(zcr))
        
        # RMS Energy
        rms = librosa.feature.rms(y=y)[0]
        energy = float(np.mean(rms))
        
        # Loudness (in dB)
        S = librosa.stft(y)
        loudness = float(librosa.amplitude_to_db(np.abs(S), ref=np.max).mean())
        
        # MFCC (Mel-frequency cepstral coefficients)
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = [float(x) for x in np.mean(mfccs, axis=1)]
        
        # Chroma features (pitch class distribution)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        chroma_mean = [float(x) for x in np.mean(chroma, axis=1)]
        
        # Derive musical characteristics
        
        # Energy (normalize to 0-1)
        energy_normalized = min(1.0, energy * 2)
        
        # Danceability (based on tempo and beat strength)
        beat_strength = float(np.mean(librosa.onset.onset_strength(y=y, sr=sr)))
        tempo_factor = 1 - abs(tempo - 120) / 120  # Optimal around 120 BPM
        danceability = float(np.clip((tempo_factor * 0.6 + beat_strength * 0.4), 0, 1))
        
        # Valence (positivity - derived from brightness and energy)
        normalized_centroid = spectral_centroid / 2000  # Normalize
        valence = float(np.clip((normalized_centroid * 0.6 + energy_normalized * 0.4), 0, 1))
        
        # Acousticness (inverse of high frequency content)
        high_freq_ratio = float(np.sum(spectral_rolloff_mean > 4000) / len(spectral_rolloff))
        acousticness = float(1 - np.clip(high_freq_ratio, 0, 1))
        
        # Instrumentalness (lack of vocal frequencies 300-3400 Hz)
        # Using spectral features as proxy
        instrumentalness = float(np.clip(1 - zero_crossing_rate * 2, 0, 1))
        
        # Speechiness (presence of vocal-like patterns)
        speechiness = float(1 - instrumentalness)
        
        # Detect key (simplified)
        chroma_vals = np.mean(chroma, axis=1)
        key_map = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        key = key_map[int(np.argmax(chroma_vals))]
        
        # Mode (Major/Minor based on chroma pattern)
        mode = 'Major' if chroma_vals[0] > chroma_vals[9] else 'Minor'
        
        # Genre classification (simplified based on features)
        if tempo > 120 and energy_normalized > 0.7:
            genre = 'Electronic'
        elif tempo < 100 and acousticness > 0.6:
            genre = 'Ambient'
        elif energy_normalized > 0.8:
            genre = 'Energetic'
        else:
            genre = 'Pop'
        
        # Mood classification
        if valence > 0.7 and energy_normalized > 0.6:
            mood = 'Energetic'
        elif valence > 0.6:
            mood = 'Uplifting'
        elif valence < 0.4 and energy_normalized < 0.5:
            mood = 'Calm'
        elif energy_normalized > 0.7:
            mood = 'Intense'
        else:
            mood = 'Neutral'
        
        return {
            'tempo': round(tempo, 2),
            'energy': round(energy_normalized, 3),
            'danceability': round(danceability, 3),
            'valence': round(valence, 3),
            'acousticness': round(acousticness, 3),
            'instrumentalness': round(instrumentalness, 3),
            'loudness': round(loudness, 2),
            'speechiness': round(speechiness, 3),
            'genre': genre,
            'mood': mood,
            'key_signature': key,
            'time_signature': '4/4',  # Default
            'duration': duration,
            'spectral_centroid': round(spectral_centroid, 2),
            'spectral_rolloff': round(spectral_rolloff_mean, 2),
            'zero_crossing_rate': round(zero_crossing_rate, 4),
            'mfcc_mean': json.dumps(mfcc_mean),
            'chroma_mean': json.dumps(chroma_mean)
        }
    
    except Exception as e:
        print(f"      ❌ Feature extraction error: {e}")
        return None


def insert_features_to_db(connection, product_id, features):
    """Insert or update audio features in database"""
    try:
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO AudioFeatures (
                    ProductID, Tempo, Energy, Danceability, Valence,
                    Acousticness, Instrumentalness, Loudness, Speechiness,
                    Genre, Mood, Key_Signature, TimeSignature, Duration,
                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate,
                    MfccMean, ChromaMean
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                ON DUPLICATE KEY UPDATE
                    Tempo = VALUES(Tempo),
                    Energy = VALUES(Energy),
                    Danceability = VALUES(Danceability),
                    Valence = VALUES(Valence),
                    Acousticness = VALUES(Acousticness),
                    Instrumentalness = VALUES(Instrumentalness),
                    Loudness = VALUES(Loudness),
                    Speechiness = VALUES(Speechiness),
                    Genre = VALUES(Genre),
                    Mood = VALUES(Mood),
                    Key_Signature = VALUES(Key_Signature),
                    TimeSignature = VALUES(TimeSignature),
                    Duration = VALUES(Duration),
                    SpectralCentroid = VALUES(SpectralCentroid),
                    SpectralRolloff = VALUES(SpectralRolloff),
                    ZeroCrossingRate = VALUES(ZeroCrossingRate),
                    MfccMean = VALUES(MfccMean),
                    ChromaMean = VALUES(ChromaMean)
            """
            
            cursor.execute(sql, (
                product_id,
                features['tempo'],
                features['energy'],
                features['danceability'],
                features['valence'],
                features['acousticness'],
                features['instrumentalness'],
                features['loudness'],
                features['speechiness'],
                features['genre'],
                features['mood'],
                features['key_signature'],
                features['time_signature'],
                features['duration'],
                features['spectral_centroid'],
                features['spectral_rolloff'],
                features['zero_crossing_rate'],
                features['mfcc_mean'],
                features['chroma_mean']
            ))
            
        connection.commit()
        return True
    
    except Exception as e:
        print(f"      ❌ Database insert error: {e}")
        connection.rollback()
        return False


def generate_sql_insert(product_id, features):
    """Generate SQL INSERT statement for features"""
    sql = f"""INSERT INTO AudioFeatures (
    ProductID, Tempo, Energy, Danceability, Valence,
    Acousticness, Instrumentalness, Loudness, Speechiness,
    Genre, Mood, Key_Signature, TimeSignature, Duration,
    SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean
) VALUES (
    {product_id}, {features['tempo']}, {features['energy']}, {features['danceability']}, {features['valence']},
    {features['acousticness']}, {features['instrumentalness']}, {features['loudness']}, {features['speechiness']},
    '{features['genre']}', '{features['mood']}', '{features['key_signature']}', '{features['time_signature']}', {features['duration']},
    {features['spectral_centroid']}, {features['spectral_rolloff']}, {features['zero_crossing_rate']},
    '{features['mfcc_mean']}', '{features['chroma_mean']}'
) ON DUPLICATE KEY UPDATE
    Tempo = VALUES(Tempo), Energy = VALUES(Energy), Danceability = VALUES(Danceability),
    Valence = VALUES(Valence), Mood = VALUES(Mood), Genre = VALUES(Genre);"""
    return sql


def process_products(local_dir=None, limit=None, sql_only=False, output_file=None):
    """Main processing function"""
    
    print("\n" + "="*70)
    print("🎵 AUDIO FEATURE EXTRACTION PIPELINE")
    print("="*70)
    
    if sql_only:
        print("\n📝 SQL-ONLY MODE - Generating SQL statements without database connection")
    
    connection = None
    
    if not sql_only:
        # Connect to database
        print("\n📊 Connecting to database...")
        print(f"   Host: {DB_CONFIG['host']}")
        print(f"   Port: {DB_CONFIG['port']}")
        print(f"   Database: {DB_CONFIG['database']}")
    
    if not sql_only:
        try:
            connection = pymysql.connect(**DB_CONFIG)
            print(f"✅ Connected successfully!")
        except pymysql.err.OperationalError as e:
            print(f"❌ Database connection failed: {e}")
            print("\n💡 Troubleshooting tips:")
            print("   1. Check if database is running: docker ps | grep mysql")
            print("   2. Try different hosts:")
            print("      export DB_HOST=localhost")
            print("      export DB_HOST=host.docker.internal")
            print("      export DB_HOST=db")
            print("   3. Check if port 3306 is accessible")
            print("   4. Use --sql-only to generate SQL without database connection")
            return
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            return
    
    # Load AWS config
    aws_config = load_aws_config()
    s3_client = get_s3_client(aws_config) if aws_config else None
    
    if s3_client:
        print(f"✅ S3 client initialized (bucket: {aws_config['bucket_name']})")
    elif not local_dir:
        print("⚠️  No S3 access and no local directory specified")
        print("   Use --local-dir <path> to process local files")
        if connection:
            connection.close()
        return
    
    # SQL output storage
    sql_statements = []
    
    # For SQL-only mode, we need a list of products from init-database.sh
    if sql_only:
        print("\n📀 Parsing products from init-database.sh...")
        products = parse_products_from_init_script()
        if not products:
            print("❌ Failed to parse products from init-database.sh")
            return
        if limit:
            products = products[:limit]
        print(f"✅ Found {len(products)} music products")
    else:
        # Get music products from database
        print("\n📀 Querying music products...")
        try:
            with connection.cursor() as cursor:
                sql = """
                    SELECT ProductID, AlbumTitle, file_url, preview_url
                    FROM Products
                    WHERE AlbumTitle IS NOT NULL AND AlbumTitle != ''
                """
                if limit:
                    sql += f" LIMIT {limit}"
                
                cursor.execute(sql)
                products = cursor.fetchall()
                print(f"✅ Found {len(products)} music products")
        except Exception as e:
            print(f"❌ Query failed: {e}")
            connection.close()
            return
    
    # Process each product
    print(f"\n🔬 Extracting audio features...")
    print(f"{'─'*70}")
    
    success_count = 0
    skip_count = 0
    error_count = 0
    
    for i, product in enumerate(products, 1):
        product_id = product['ProductID']
        album_title = product['AlbumTitle']
        file_url = product['file_url']
        
        print(f"\n[{i}/{len(products)}] {album_title} (ID: {product_id})")
        
        # Check if already processed (only if connected to DB)
        if connection and not sql_only:
            with connection.cursor() as cursor:
                cursor.execute("SELECT FeatureID FROM AudioFeatures WHERE ProductID = %s", (product_id,))
                if cursor.fetchone():
                    print(f"   ⏭️  Already processed - skipping")
                    skip_count += 1
                    continue
        
        # Get audio file
        audio_path = None
        temp_file = None
        
        if local_dir:
            # Try to find local file
            potential_files = list(Path(local_dir).glob(f"*{album_title}*"))
            if potential_files:
                audio_path = str(potential_files[0])
                print(f"   📁 Using local file: {audio_path}")
        
        elif file_url and s3_client:
            # Download from S3
            print(f"   ⬇️  Downloading from S3...")
            audio_path = download_from_s3(s3_client, aws_config['bucket_name'], file_url)
            temp_file = audio_path
        
        if not audio_path:
            print(f"   ⚠️  No audio file available - skipping")
            skip_count += 1
            continue
        
        # Extract features
        print(f"   🔬 Analyzing audio...")
        features = extract_audio_features(audio_path)
        
        # Clean up temp file
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)
        
        if not features:
            error_count += 1
            continue
        
        # Display extracted features
        print(f"   ✨ Extracted features:")
        print(f"      Tempo: {features['tempo']} BPM")
        print(f"      Energy: {features['energy']:.2f}")
        print(f"      Mood: {features['mood']}")
        print(f"      Genre: {features['genre']}")
        
        # Insert to database or generate SQL
        if sql_only:
            print(f"   📝 Generating SQL statement...")
            sql = generate_sql_insert(product_id, features)
            sql_statements.append(sql)
            print(f"   ✅ SQL generated!")
            success_count += 1
        else:
            print(f"   💾 Saving to database...")
            if insert_features_to_db(connection, product_id, features):
                print(f"   ✅ Success!")
                success_count += 1
            else:
                error_count += 1
    
    # Summary
    print(f"\n{'='*70}")
    print(f"📊 PROCESSING COMPLETE")
    print(f"{'='*70}")
    print(f"✅ Successfully processed: {success_count}")
    print(f"⏭️  Skipped (already exists): {skip_count}")
    print(f"❌ Errors: {error_count}")
    print(f"{'='*70}\n")
    
    # Write SQL file if in sql-only mode
    if sql_only and sql_statements:
        sql_file = output_file or '/workspaces/final_year_project/scripts/audio_features.sql'
        with open(sql_file, 'w') as f:
            f.write("-- Auto-generated AudioFeatures INSERT statements\n")
            f.write(f"-- Generated: {datetime.now().isoformat()}\n\n")
            f.write("USE Game_Store_System;\n\n")
            for sql in sql_statements:
                f.write(sql + "\n\n")
        print(f"📄 SQL file written: {sql_file}")
        print(f"\n💡 To execute, run:")
        print(f"   docker exec -i gamestore_services-db-1 mysql -uroot -prootpassword < {sql_file}")
    
    if connection:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description='Extract audio features and populate database')
    parser.add_argument('--local-dir', type=str, help='Directory containing local audio files')
    parser.add_argument('--limit', type=int, help='Limit number of products to process')
    parser.add_argument('--sql-only', action='store_true', help='Generate SQL file without database connection')
    parser.add_argument('--output', type=str, help='Output SQL file path (default: scripts/audio_features.sql)')
    
    args = parser.parse_args()
    
    process_products(local_dir=args.local_dir, limit=args.limit, sql_only=args.sql_only, output_file=args.output)


if __name__ == '__main__':
    main()
