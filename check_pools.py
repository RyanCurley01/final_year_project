import pymysql

db = pymysql.connect(host="gamestore_services-db-1", port=3306, user="root", password="rootpassword", database="Game_Store_System")
cursor = db.cursor()

cursor.execute("""
    SELECT p.ProductID, p.ProductName, COUNT(i.ImageGenID) as PoolSize
    FROM Products p
    LEFT JOIN ImageGeneration i ON p.ProductID = i.ProductID
    GROUP BY p.ProductID, p.ProductName
    ORDER BY p.ProductID;
""")

results = cursor.fetchall()
for row in results:
    print(f"Product {row[0]} ({row[1]}): {row[2]} images")
db.close()
