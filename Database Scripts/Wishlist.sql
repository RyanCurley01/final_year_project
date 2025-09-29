CREATE TABLE Wishlist (
	WishlistID INT auto_increment primary key,
	GameTitle VARCHAR(10),
	Platform ENUM('PS4','XBOX')
);