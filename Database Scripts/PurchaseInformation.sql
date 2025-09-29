CREATE TABLE CustomerSummary (
	CustomerSummaryID INT auto_increment primary key,
	GameTitle VARCHAR(10),
	Platform ENUM('PS4','XBOX'),
	CustomerID INT,
    OrderID INT,
	GameID INT,
	FOREIGN KEY(CustomerID) REFERENCES Customer_Account(CustomerID),
	FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
	FOREIGN KEY(GameID) REFERENCES Games(GameID) 
);

DROP Table CustomerSummary;

CREATE TABLE Sold_Games (
	SoldGamesID INT auto_increment primary key,
	GameTitle VARCHAR(10),
	Platform ENUM('PS4','XBOX'),
	OrderItemID INT,
	FOREIGN KEY(OrderItemID) REFERENCES Order_Items(OrderItemID)
);

SELECT Sold_Games.*, Order_Items.*
FROM Sold_Games
RIGHT JOIN Order_Items ON Sold_Games.OrderItemID = Order_Items.OrderItemID;

CREATE TABLE Purchased_Games (
	PurchasedGamesID INT auto_increment primary key,
	GameTitle VARCHAR(10),
	Platform ENUM('PS4','XBOX'),
	OrderItemID INT,
	FOREIGN KEY(OrderItemID) REFERENCES Order_Items(OrderItemID)
);