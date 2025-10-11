CREATE TABLE Payments (
	PaymentID INT auto_increment primary key,
	OrderID INT,
	ProductID INT,
	CustomerID INT,
	PaymentAmount decimal(10, 2),
	PaymentStatus ENUM('COMPLETED', 'UNCOMPLETED'),
	PaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
	FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
	FOREIGN KEY(CustomerID) REFERENCES Account(AccountID)
);

DROP table Payments;
