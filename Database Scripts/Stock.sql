CREATE TABLE Stock (
	StockID INT auto_increment primary key,
    StockQuantity INT,
    ProductID INT,
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

DROP TABLE Stock;

