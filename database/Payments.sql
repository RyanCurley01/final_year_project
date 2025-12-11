CREATE TABLE Payments (
	PaymentID INT auto_increment primary key,
	OrderID INT,
	ProductID INT,
	AccountID INT,
	PaymentAmount decimal(10, 2),
	PaymentStatus ENUM('COMPLETED', 'UNCOMPLETED', 'PENDING') DEFAULT 'PENDING',
	PaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP,
	PayPalOrderID VARCHAR(255) UNIQUE,
	FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
	FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
	FOREIGN KEY(AccountID) REFERENCES Account(AccountID)
);

DROP table Payments;
