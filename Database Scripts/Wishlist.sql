CREATE TABLE GameWishlist (
	WishlistID INT auto_increment primary key,
	CustomerID INT,
	ProductID INT,
	FOREIGN KEY(CustomerID) REFERENCES Account(AccountID),
	FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

DROP TABLE GameWishlist;
