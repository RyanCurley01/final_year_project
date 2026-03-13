import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

try:
    conn = pymysql.connect(
        host="gamestore_services-db-1",
        port=3306,
        user=os.getenv("MYSQL_USER", "gamestore_user"),
        password=os.getenv("MYSQL_PASSWORD", "gamestore_pass"),
        database=os.getenv("MYSQL_DATABASE", "Game_Store_System"),
        cursorclass=pymysql.cursors.DictCursor
    )
    with conn.cursor() as cursor:
        cursor.execute("SELECT ProductID, COUNT(*) as count, Provider FROM ImageGeneration GROUP BY ProductID, Provider ORDER BY ProductID")
        records = cursor.fetchall()
        print("ImageGeneration counts by ProductID:")
        for r in records:
            print(f"ProductID: {r['ProductID']}, Provider: {r['Provider']}, Count: {r['count']}")
            
        print("\nTotal distinct ProductIDs in ImageGeneration:", len(set([str(r['ProductID']) for r in records])))
    conn.close()
except Exception as e:
    print(f"Error connecting using internal docker name: {e}")
    
    # Try the external exposed port in case we're outside the docker network but on the same machine
    try:
        conn = pymysql.connect(
            host="127.0.0.1",
            port=3306,
            user=os.getenv("MYSQL_USER", "gamestore_user"),
            password=os.getenv("MYSQL_PASSWORD", "gamestore_pass"),
            database=os.getenv("MYSQL_DATABASE", "Game_Store_System"),
            cursorclass=pymysql.cursors.DictCursor
        )
        with conn.cursor() as cursor:
            cursor.execute("SELECT ProductID, COUNT(*) as count, Provider FROM ImageGeneration GROUP BY ProductID, Provider ORDER BY ProductID")
            records = cursor.fetchall()
            print("ImageGeneration counts by ProductID:")
            for r in records:
                print(f"ProductID: {r['ProductID']}, Provider: {r['Provider']}, Count: {r['count']}")
                
            print("\nTotal distinct ProductIDs in ImageGeneration:", len(set([str(r['ProductID']) for r in records])))
        conn.close()
    except Exception as e2:
        print(f"Error connecting using localhost: {e2}")

