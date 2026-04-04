import boto3
import os
import time
import pymysql

AWS_REGION = "eu-west-1"
AWS_ACCESS_KEY_ID = "AKIA35JZMVQNDQ3HS7X6"
AWS_SECRET_ACCESS_KEY = "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"
BUCKET = "game-and-music-files"

MYSQL_HOST = os.environ.get("MYSQL_HOST", "localhost")
MYSQL_PORT = 3306
MYSQL_USER = "root"
MYSQL_PASSWORD = os.environ.get("MYSQL_ROOT_PASSWORD", "rootpassword")
MYSQL_DB = "Game_Store_System"

print("Connecting to DB...")
db = pymysql.connect(host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER, password=MYSQL_PASSWORD, database=MYSQL_DB)
cursor = db.cursor()
cursor.execute("SET innodb_lock_wait_timeout = 120")

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
        # expected: generated-images/{product_id}/{url_hash}.jpg
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
    chunk_size = 50
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i+chunk_size]
        for attempt in range(3):
            try:
                cursor.executemany(sql, chunk)
                db.commit()
                break
            except pymysql.err.OperationalError as e:
                if e.args[0] == 1205 and attempt < 2:
                    print(f"  Lock timeout on chunk {i//chunk_size + 1}, retrying in 5s...")
                    db.rollback()
                    time.sleep(5)
                else:
                    raise
        print(f"  Inserted chunk {i//chunk_size + 1}/{(len(rows) + chunk_size - 1)//chunk_size} ({min(i+chunk_size, len(rows))}/{len(rows)} rows)")
    
    cursor.execute("SELECT COUNT(*) FROM ImageGeneration")
    final_count = cursor.fetchone()[0]
    print(f"Done! Repopulated {final_count} total rows in ImageGeneration.")
else:
    print("No images found in S3 to populate.")

db.close()
