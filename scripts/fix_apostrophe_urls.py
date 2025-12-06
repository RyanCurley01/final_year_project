#!/usr/bin/env python3
"""
Fix URLs in the database that contain apostrophes and other special characters
by properly URL-encoding them.
"""

import mysql.connector
from urllib.parse import quote, urlparse

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'rootpassword',
    'database': 'Game_Store_System'
}

def fix_file_urls():
    """Update file_url fields to properly URL-encode special characters"""
    try:
        # Connect to database
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Get all products with file URLs
        cursor.execute("SELECT ProductId, file_url FROM Products WHERE file_url IS NOT NULL AND file_url != ''")
        products = cursor.fetchall()
        
        print(f"Found {len(products)} products with file URLs")
        print("\nChecking for URLs that need encoding...\n")
        
        updated_count = 0
        for product_id, file_url in products:
            # Parse the URL to get the base and the filename
            if "amazonaws.com/" in file_url:
                # Split URL into base and filename
                parts = file_url.rsplit('/', 1)
                if len(parts) == 2:
                    base_url, filename = parts
                    
                    # Check if filename contains special characters that need encoding
                    if "'" in filename or " " in filename or any(ord(c) > 127 for c in filename):
                        # URL encode the filename
                        encoded_filename = quote(filename, safe='')
                        new_url = f"{base_url}/{encoded_filename}"
                        
                        # Update in database
                        update_query = "UPDATE Products SET file_url = %s WHERE ProductId = %s"
                        cursor.execute(update_query, (new_url, product_id))
                        
                        print(f"✓ Updated Product {product_id}:")
                        print(f"  Old: {file_url}")
                        print(f"  New: {new_url}\n")
                        
                        updated_count += 1
        
        # Commit changes
        conn.commit()
        
        print(f"\n✅ Successfully updated {updated_count} URLs")
        
        # Close connection
        cursor.close()
        conn.close()
        
        return updated_count
        
    except mysql.connector.Error as e:
        print(f"❌ Database error: {e}")
        return 0

if __name__ == "__main__":
    try:
        print("========================================")
        print("🔧 Fixing URL Encoding in Database")
        print("========================================\n")
        
        count = fix_file_urls()
        
        if count > 0:
            print("\n✨ URL encoding fix completed successfully!")
        else:
            print("\n✨ No URLs needed updating!")
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
