CREATE TABLE GameWishlist (
	WishlistID INT auto_increment primary key,
	AccountID INT,
	ProductID INT,
	FOREIGN KEY(AccountID) REFERENCES Account(AccountID),
	FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

DROP TABLE GameWishlist;
