CREATE TABLE Stock (
	StockID INT auto_increment primary key,
	GameTitle VARCHAR(10),
    AlbumTitle VARCHAR(10),
    StockQuantity INT,
    ProductID INT,
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

DROP TABLE Stock;

