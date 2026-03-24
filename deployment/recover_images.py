import boto3
import pymysql

AWS_REGION = "eu-west-1"
AWS_ACCESS_KEY_ID = "AKIA35JZMVQNDQ3HS7X6"
AWS_SECRET_ACCESS_KEY = "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"
BUCKET = "game-and-music-files"

MYSQL_HOST = "gamestore_services-db-1"
MYSQL_PORT = 3306
MYSQL_USER = "root"
MYSQL_PASSWORD = "rootpassword"
MYSQL_DB = "Game_Store_System"

print("Connecting to DB...")
db = pymysql.connect(host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER, password=MYSQL_PASSWORD, database=MYSQL_DB)
cursor = db.cursor()

print("Connecting to S3...")
s3 = boto3.client("s3", region_name=AWS_REGION, aws_access_key_id=AWS_ACCESS_KEY_ID, aws_secret_access_key=AWS_SECRET_ACCESS_KEY)

prefix = "generated-images"
paginator = s3.get_paginator('list_objects_v2')
pages = paginator.paginate(Bucket=BUCKET, Prefix=prefix)

rows = []
for page in pages:
    if 'Contents' not in page: continue
    for obj in page['Contents']:
        key = obj['Key']
        parts = key.split('/')
        if len(parts) >= 3:
            try:
                product_id = int(parts[1])
                filename = parts[-1]
                url_hash = filename.split('.')[0]
                size = obj['Size']
                url = f"https://{BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
                
                rows.append((
                    product_id, 's3', '', url, key, 'image/jpeg', size, url, url_hash, 1980, 1280, None
                ))
            except ValueError:
                pass

print(f"Found {len(rows)} image pool objects in S3 bucket.")

if rows:
    sql = """
    INSERT IGNORE INTO ImageGeneration 
    (ProductID, Provider, KeywordTag, SourceUrl, StorageKey, ContentType, ByteSize, ImageUrl, UrlHash, Width, Height, LockId)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    chunk_size = 500
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i+chunk_size]
        cursor.executemany(sql, chunk)
        db.commit()
    
    cursor.execute("SELECT COUNT(*) FROM ImageGeneration")
    final_count = cursor.fetchone()[0]
    print(f"Done! Repopulated {final_count} total rows in ImageGeneration.")
else:
    print("No images found in S3 to populate.")

db.close()
