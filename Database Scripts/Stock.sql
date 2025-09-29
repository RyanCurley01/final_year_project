CREATE TABLE Stock (
	StockID INT auto_increment primary key,
	GameID INT,
	Platform ENUM('PS4','XBOX'),
    StockQuantity INT,
    FOREIGN KEY(GameID) REFERENCES Games(GameID)
);

DROP TABLE Stock;

