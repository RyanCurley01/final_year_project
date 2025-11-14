CREATE TABLE Orders (
	-- Unique identifier for each order.
	OrderID INT auto_increment primary key,
    
	AccountID INT,
	orderDate DATETIME DEFAULT CURRENT_TIMESTAMP,
	TotalAmount decimal(10, 2),
    FOREIGN KEY(AccountID) REFERENCES Account(AccountID)
);

DROP table Orders;

CREATE TABLE Order_Items (
	-- Unique identifier for multiple games per oroder.
	OrderItemID INT auto_increment primary key,
    
	OrderID INT,
    ProductID INT,
	Quantity INT,
	UnitPrice decimal(10, 2),
    FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
	FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

DROP table Order_Items;

CREATE TABLE Products (
	-- Unique identifier for each game.
	ProductID INT auto_increment primary key,
    
	GameTitle VARCHAR(10),
	AlbumTitle VARCHAR(10),
	Platform VARCHAR(10),
	GamePrice decimal(4, 2),
	AlbumPrice decimal(4, 2),
	artist VARCHAR(7),
    genre VARCHAR(20),
    file_url VARCHAR(255),
    preview_url VARCHAR(255),
    StockQuantity INT UNSIGNED
);

DROP table Products;

