import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv('.env.docker')
if not os.getenv('AWS_ACCESS_KEY_ID'):
    load_dotenv()

DB_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_ROOT_PASSWORD', os.getenv('DB_PASSWORD')),
    'database': os.getenv('MYSQL_DATABASE', 'Game_Store_System')
}

try:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM Products WHERE AlbumTitle IS NOT NULL")
    count = cursor.fetchone()[0]
    print(f"Songs in database: {count}")
    
    if count > 0:
        cursor.execute("SELECT AlbumTitle FROM Products WHERE AlbumTitle IS NOT NULL LIMIT 5")
        print("Sample songs:")
        for row in cursor.fetchall():
            print(f"- {row[0]}")
            
    cursor.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
