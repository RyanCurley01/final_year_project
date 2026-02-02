
import os
import sys
from database import get_db_connection

def check_counts():
    try:
        with get_db_connection() as conn:
            if not conn:
                print("Failed to connect to DB")
                return
                
            with conn.cursor() as cursor:
                # Check AudioFeatures
                cursor.execute("SELECT COUNT(*) as count FROM AudioFeatures")
                total_features = cursor.fetchone()['count']
                
                cursor.execute("SELECT COUNT(*) as count FROM AudioFeatures WHERE ProductID > 0")
                pos_features = cursor.fetchone()['count']
                
                cursor.execute("SELECT COUNT(*) as count FROM AudioFeatures WHERE ProductID < 0")
                neg_features = cursor.fetchone()['count']
                
                print(f"AudioFeatures Total: {total_features}")
                print(f"  Positive IDs (Library): {pos_features}")
                print(f"  Negative IDs (Artist):  {neg_features}")
                
                # Check Products
                cursor.execute("SELECT COUNT(*) as count FROM Products")
                total_products = cursor.fetchone()['count']
                print(f"Products Total: {total_products}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_counts()
