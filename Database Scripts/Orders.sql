CREATE TABLE Orders (
	-- Unique identifier for each order.
	OrderID INT auto_increment primary key,
    
	CustomerID INT,
	orderDate DATETIME DEFAULT CURRENT_TIMESTAMP,
	TotalAmount decimal(10, 2),
    FOREIGN KEY(CustomerID) REFERENCES Customer_Account(CustomerID)
);

CREATE TABLE Order_Items (
	-- Unique identifier for multiple games per oroder.
	OrderItemID INT auto_increment primary key,
    
	OrderID INT,
    GameID INT,
	orderDate DATETIME DEFAULT CURRENT_TIMESTAMP,
	TotalAmount decimal(10, 2),
    FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
	FOREIGN KEY(GameID) REFERENCES Games(GameID)
);

CREATE TABLE Games (
	-- Unique identifier for each game.
	GameID INT auto_increment primary key,
    
	GameTitle VARCHAR(10),
	Platform ENUM('PS4','XBOX'),
	Price decimal(4, 2),
    StockQuantity INT UNSIGNED
);