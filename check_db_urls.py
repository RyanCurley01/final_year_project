import os
import pymysql
from dotenv import load_dotenv

load_dotenv("audio_service/.env")

try:
    conn = pymysql.connect(
        host='127.0.0.1',
        port=3306,
        user=os.getenv("DB_USER", "vue_auth"),
        password=os.getenv("DB_PASSWORD", "vue_auth_password"), # guessing from typical setup, will check .env if fails
        database=os.getenv("DB_NAME", "gamestore")
    )
    with conn.cursor() as cursor:
        cursor.execute("SELECT product_id, image_url, source FROM ImageGeneration LIMIT 5;")
        for row in cursor.fetchall():
            print(row)
except Exception as e:
    print(f"Failed: {e}")
    # let's print the env to see what it is
    print(f"DB_USER={os.getenv('DB_USER')} DB_NAME={os.getenv('DB_NAME')}")
