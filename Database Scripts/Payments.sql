CREATE TABLE Payments (
	PaymentID INT auto_increment primary key,
	GameCost decimal(10, 2),
	AlbumCost decimal(10, 2),
	OrderID INT,
	GameTitle VARCHAR(10),
	AlbumTitle VARCHAR(10),
    GamePaymentStatus ENUM('COMPLETED, UNCOMPLETED'),
    AlbumPaymentStatus ENUM('COMPLETED, UNCOMPLETED'),
	GamePaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP,
	AlbumPaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP table Payments;
