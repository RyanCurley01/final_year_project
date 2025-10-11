CREATE TABLE CustomerSummary (
	CustomerSummaryID INT auto_increment primary key,
	GameTitle VARCHAR(10),
    AlbumTitle VARCHAR(10),
    CustomerID INT,
	Platform VARCHAR(10),
	ProductID INT,
	OrderID INT,
	FOREIGN KEY(CustomerID) REFERENCES Customer_Account(CustomerID),
	FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
	FOREIGN KEY(ProductID) REFERENCES Products(ProductID) 
);

DROP Table CustomerSummary;

CREATE TABLE Sold_Products (
	SoldProductsID INT auto_increment primary key,
	GameTitle VARCHAR(10),
	AlbumTitle VARCHAR(10),
	OrderItemID INT,
	FOREIGN KEY(OrderItemID) REFERENCES Order_Items(OrderItemID)
);

DROP Table Sold_Products;

SELECT Sold_Products.*, Order_Items.*
FROM Sold_Productscustomersummary
RIGHT JOIN Order_Items ON Sold_Products.OrderItemID = Order_Items.OrderItemID;

CREATE TABLE Purchased_Products (
	PurchasedProductsID INT auto_increment primary key,
	GameTitle VARCHAR(10),
	AlbumTitle VARCHAR(10),
	Platform VARCHAR(10),
	OrderItemID INT,
	FOREIGN KEY(OrderItemID) REFERENCES Order_Items(OrderItemID)
);

DROP Table Purchased_Products;
