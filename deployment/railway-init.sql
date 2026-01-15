-- Railway Database Initialization
-- Adapted from init-database.sh for Railway MySQL

-- Use the railway database (Railway's default)
USE railway;

-- DROP existing tables to ensure idempotent initialization
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS UserInteractions, AudioFeatures, UserRecommendations, GameWishlist, Purchased_Products, Sold_Products, CustomerSummary, Payments, Order_Items, Orders, Stock, Products, Accounts;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- CREATE TABLES
-- ============================================

-- Account Table
CREATE TABLE IF NOT EXISTS Accounts (
    AccountID BIGINT AUTO_INCREMENT PRIMARY KEY,
    AccountName VARCHAR(255) NOT NULL,
    AccountPhoneNumber VARCHAR(255),
    AccountEmailAddress VARCHAR(255) NOT NULL,
    AccountPassword VARCHAR(255) NOT NULL,
    AccountType VARCHAR(255) NOT NULL
);

-- Products Table (must be created before Orders, Stock, etc.)
CREATE TABLE IF NOT EXISTS Products (
    ProductID INT AUTO_INCREMENT PRIMARY KEY,
    GameTitle VARCHAR(255),
    AlbumTitle VARCHAR(255),
    Platform VARCHAR(50),
    GamePrice DECIMAL(10, 2),
    AlbumPrice DECIMAL(10, 2),
    albumCoverImageUrl VARCHAR(512),
    gameCoverImageUrl VARCHAR(512),
    file_url VARCHAR(512),
    preview_url VARCHAR(512),
    StockQuantity INT UNSIGNED DEFAULT 0
);

-- Orders Table
CREATE TABLE IF NOT EXISTS Orders (
    OrderID INT AUTO_INCREMENT PRIMARY KEY,
    AccountID BIGINT,
    orderDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    TotalAmount DECIMAL(10, 2),
    FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID)
);

-- Order_Items Table
CREATE TABLE IF NOT EXISTS Order_Items (
    OrderItemID INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT,
    ProductID INT,
    Quantity INT,
    UnitPrice DECIMAL(10, 2),
    FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

-- Payments Table
CREATE TABLE IF NOT EXISTS Payments (
    PaymentID INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT,
    ProductID INT,
    AccountID BIGINT,
    PaymentAmount DECIMAL(10, 2),
    PaymentStatus ENUM('COMPLETED', 'UNCOMPLETED', 'PENDING') DEFAULT 'PENDING',
    PaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP,
    PayPalOrderID VARCHAR(255) UNIQUE
);

-- CustomerSummary Table
CREATE TABLE IF NOT EXISTS CustomerSummary (
    CustomerSummaryID BIGINT AUTO_INCREMENT PRIMARY KEY,
    AccountID BIGINT NOT NULL,
    ProductID INT NOT NULL,
    OrderID INT NOT NULL,
    FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
    FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

-- Sold_Products Table
CREATE TABLE IF NOT EXISTS Sold_Products (
    SoldProductsID INT AUTO_INCREMENT PRIMARY KEY,
    OrderItemID INT,
    ProductID INT,
    FOREIGN KEY(OrderItemID) REFERENCES Order_Items(OrderItemID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

-- Purchased_Products Table
CREATE TABLE IF NOT EXISTS Purchased_Products (
    PurchasedProductsID INT AUTO_INCREMENT PRIMARY KEY,
    OrderItemID INT,
    ProductID INT,
    FOREIGN KEY(OrderItemID) REFERENCES Order_Items(OrderItemID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

-- Stock Table
CREATE TABLE IF NOT EXISTS Stock (
    StockID INT AUTO_INCREMENT PRIMARY KEY,
    StockQuantity INT,
    ProductID INT,
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

-- GameWishlist Table
CREATE TABLE IF NOT EXISTS GameWishlist (
    WishlistID INT AUTO_INCREMENT PRIMARY KEY,
    AccountID BIGINT,
    ProductID INT,
    FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
);

-- ============================================
-- AUDIO RECOMMENDATION TABLES
-- ============================================

-- AudioFeatures: Store extracted audio features for music products
CREATE TABLE IF NOT EXISTS AudioFeatures (
    FeatureID INT AUTO_INCREMENT PRIMARY KEY,
    ProductID INT NOT NULL,
    Tempo FLOAT,
    Energy FLOAT,
    Danceability FLOAT,
    Valence FLOAT,
    Acousticness FLOAT,
    Instrumentalness FLOAT,
    Loudness FLOAT,
    Speechiness FLOAT,
    Genre VARCHAR(100),
    Mood VARCHAR(100),
    Key_Signature VARCHAR(10),
    TimeSignature VARCHAR(10),
    Duration INT,
    SpectralCentroid FLOAT,
    SpectralRolloff FLOAT,
    ZeroCrossingRate FLOAT,
    MfccMean TEXT,
    ChromaMean TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
    UNIQUE KEY unique_product_features (ProductID),
    INDEX idx_tempo (Tempo),
    INDEX idx_energy (Energy),
    INDEX idx_valence (Valence),
    INDEX idx_mood (Mood),
    INDEX idx_genre (Genre)
);

-- UserInteractions: Track all user interactions with products
CREATE TABLE IF NOT EXISTS UserInteractions (
    InteractionID BIGINT AUTO_INCREMENT PRIMARY KEY,
    AccountID BIGINT NOT NULL,
    ProductID INT NOT NULL,
    InteractionType ENUM('play', 'preview', 'pause', 'purchase', 'wishlist', 'view', 'click') NOT NULL,
    InteractionTimestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    DurationSeconds INT,
    CompletionPercentage FLOAT,
    EngagementScore FLOAT,
    DeviceType VARCHAR(50),
    SessionID VARCHAR(255),
    FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
    INDEX idx_account_product (AccountID, ProductID),
    INDEX idx_interaction_type (InteractionType),
    INDEX idx_timestamp (InteractionTimestamp)
);

-- UserRecommendations: Store personalized recommendations for users
CREATE TABLE IF NOT EXISTS UserRecommendations (
    RecommendationID BIGINT AUTO_INCREMENT PRIMARY KEY,
    AccountID BIGINT NOT NULL,
    ProductID INT NOT NULL,
    RecommendationScore FLOAT NOT NULL,
    RecommendationType VARCHAR(50),
    ReasonCode VARCHAR(255),
    GeneratedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt TIMESTAMP,
    WasShown BOOLEAN DEFAULT FALSE,
    WasClicked BOOLEAN DEFAULT FALSE,
    WasPurchased BOOLEAN DEFAULT FALSE,
    FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
    INDEX idx_account_score (AccountID, RecommendationScore DESC),
    INDEX idx_generated_at (GeneratedAt),
    INDEX idx_recommendation_type (RecommendationType)
);

-- ============================================
-- INSERT DUMMY DATA
-- ============================================

-- Insert Accounts (Managers, Employees, Customers)
-- All passwords are BCrypt hashed version of 'password'
INSERT INTO Accounts (AccountName, AccountPhoneNumber, AccountEmailAddress, AccountPassword, AccountType) VALUES
('John Smith', '5551234567', 'john.smith@store.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Manager'),
('Sarah Johnson', '5552345678', 'sarah.j@store.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Employee'),
('Mike Wilson', '5553456789', 'mike.w@store.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Employee'),
('Alice Brown', '5554567890', 'alice.b@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer'),
('Bob Davis', '5555678901', 'bob.d@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer'),
('Carol White', '5556789012', 'carol.w@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer'),
('David Lee', '5557890123', 'david.l@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer'),
('Emma Garcia', '5558901234', 'emma.g@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer'),
('Frank Martinez', '5559012345', 'frank.m@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer'),
('Grace Taylor', '5550123456', 'grace.t@gmail.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'Customer');

-- Insert Products (Games and Music Albums)
INSERT INTO Products (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, albumCoverImageUrl, gameCoverImageUrl, file_url, preview_url, StockQuantity) VALUES
-- Games
('Jimmy Jungle', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Cover%20Images/Jimmy%20Jungle%20Cover%20Image.png', 'https://jimmywheezer.itch.io/jimmy-jungle', NULL, 100),
('Midnight Haunt', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Cover%20Images/Midnight%20Haunt%20Cover%20Image.png', 'https://jimmywheezer.itch.io/midnight-haunt', NULL, 100),
('Protectors', NULL, 'PC', 5.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Cover%20Images/Protectors%20Cover%20Image.png', 'https://jimmywheezer.itch.io/protectors', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors%20video%20game%20trailer.mp4', 100),
('Red Hood', NULL, 'PC', 1.50, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Cover%20Images/Red%20Hood%20Cover%20Image.png', 'https://jimmywheezer.itch.io/red-hood', NULL, 100),

-- Music Albums
(NULL, 'Selected Electronic Works', NULL, NULL, 5.00, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Selected_Electronic_Works%20-%20Album.zip', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Selected_Electronic_Works%20-%20Album.zip', 200),

-- Individual Songs
(NULL, 'Alien Acid', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Acid.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Acid.wav', 200),
(NULL, 'Alien Action', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Action.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Action.wav', 200),
(NULL, 'Alien Amen Break Beat', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav', 200),
(NULL, 'Alien Amp Up', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amp%20Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amp%20Up.wav', 200),
(NULL, 'Alien Bars', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Bars.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Bars.wav', 200),
(NULL, 'Alien Business', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Business.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Business.wav', 200),
(NULL, 'Alien Chilling', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Chilling.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Chilling.wav', 200),
(NULL, 'Alien Essence', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Essence.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Essence.wav', 200),
(NULL, 'Alien Euphoria', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Euphoria.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Euphoria.wav', 200),
(NULL, 'Alien Feels', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Feels.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Feels.wav', 200),
(NULL, 'Alien Flow State', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Flow%20State.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Flow%20State.wav', 200),
(NULL, 'Alien Grind', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Grind.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Grind.wav', 200),
(NULL, 'Alien Harmony', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Harmony.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Harmony.wav', 200),
(NULL, 'Alien Hyperness', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Hyperness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Hyperness.wav', 200),
(NULL, 'Alien Joy', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Joy.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Joy.wav', 200),
(NULL, 'Alien Memories', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Memories.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Memories.wav', 200),
(NULL, 'Alien Mode', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Mode.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Mode.wav', 200),
(NULL, 'Alien Nature', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Nature.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Nature.wav', 200),
(NULL, 'Alien Project Meeting', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Project%20Meeting.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Project%20Meeting.wav', 200),
(NULL, 'Alien Ragebait', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Ragebait.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Ragebait.wav', 200),
(NULL, 'Alien Realm', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Realm.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Realm.wav', 200),
(NULL, 'Alien Sense', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Sense.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Sense.wav', 200),
(NULL, 'Alien Singing', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Singing.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Singing.wav', 200),
(NULL, 'Alien Soul', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Soul.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Soul.wav', 200),
(NULL, 'Alien Translation', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Translation.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Translation.wav', 200),
(NULL, 'Alien Turn Up', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Turn%20Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Turn%20Up.wav', 200),
(NULL, 'Alien Upgrade', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Upgrade.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Upgrade.wav', 200),
(NULL, 'Alien Utopia', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Utopia.wav', 200),
(NULL, 'Alien Wonder', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Wonder.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Wonder.wav', 200),
(NULL, 'Breakcore Bear Hug', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav', 200),
(NULL, 'Drunk House', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav', 200),
(NULL, 'Extraterrestrial Rave', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial%20Rave.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial%20Rave.wav', 200),
(NULL, 'Green Bear', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20Bear.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20Bear.wav', 200),
(NULL, 'Green God', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20God.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20God.wav', 200),
(NULL, 'Intergalactic Rave', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic%20Rave.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic%20Rave.wav', 200),
(NULL, 'Soft Chaos', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav', 200),
(NULL, 'Ted Chilling', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav', 200),
(NULL, 'Teddy Emotion', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy%20Emotion.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy%20Emotion.wav', 200),
(NULL, 'Teds Awakening', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 200),
(NULL, 'Teds Beautiful Anger', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 200),
(NULL, 'Teds Chillness', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 200),
(NULL, 'Teds Deepness', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 200),
(NULL, 'Teds Dream', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 200),
(NULL, 'Teds Energy', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 200),
(NULL, 'Teds Green Machine', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 200),
(NULL, 'Teds Rush Up', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 200),
(NULL, 'Teds Utopia', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 200);

-- Insert Stock entries 
INSERT INTO Stock (StockQuantity, ProductID) VALUES
(100, 1), (100, 2), (100, 3), (100, 4), (200, 5),
(200, 6), (200, 7), (200, 8), (200, 9), (200, 10),
(200, 11), (200, 12), (200, 13), (200, 14), (200, 15),
(200, 16), (200, 17), (200, 18), (200, 19), (200, 20),
(200, 21), (200, 22), (200, 23), (200, 24), (200, 25),
(200, 26), (200, 27), (200, 28), (200, 29), (200, 30),
(200, 31), (200, 32), (200, 33), (200, 34), (200, 35),
(200, 36), (200, 37), (200, 38), (200, 39), (200, 40),
(200, 41), (200, 42), (200, 43), (200, 44), (200, 45),
(200, 46), (200, 47), (200, 48), (200, 49), (200, 50),
(200, 51), (200, 52);

-- Insert Orders
INSERT INTO Orders (AccountID, orderDate, TotalAmount) VALUES
(4, '2025-10-01 10:30:00', 4.00),
(5, '2025-10-02 14:15:00', 7.00),
(6, '2025-10-03 16:45:00', 3.50),
(7, '2025-10-05 11:20:00', 10.00),
(8, '2025-10-07 09:00:00', 5.00);

-- Insert Order_Items
INSERT INTO Order_Items (OrderID, ProductID, Quantity, UnitPrice) VALUES
(1, 1, 2, 2.00),
(2, 2, 2, 2.00),
(2, 3, 1, 5.00),
(2, 1, 1, 2.00),
(3, 4, 1, 1.50),
(3, 1, 1, 2.00),
(4, 3, 2, 5.00),
(5, 5, 1, 5.00);

-- Insert CustomerSummary
INSERT INTO CustomerSummary (AccountID, ProductID, OrderID) VALUES
(4, 1, 1), (5, 2, 2), (5, 3, 2), (5, 1, 2),
(6, 4, 3), (6, 1, 3), (7, 3, 4), (8, 5, 5);

-- Insert Sold_Products
INSERT INTO Sold_Products (OrderItemID, ProductID) VALUES
(1, 1), (2, 2), (3, 3), (4, 1), (5, 4), (6, 1), (7, 3), (8, 5);

-- Insert Purchased_Products
INSERT INTO Purchased_Products (OrderItemID, ProductID) VALUES
(1, 1), (2, 2), (3, 3), (4, 1), (5, 4), (6, 1), (7, 3), (8, 5);

-- Insert GameWishlist
INSERT INTO GameWishlist (AccountID, ProductID) VALUES
(4, 2), (4, 3), (5, 1), (6, 3), (7, 4), (8, 5), (9, 3), (10, 2);

-- Insert AudioFeatures for music products
INSERT INTO AudioFeatures (ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, Genre, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean) VALUES
(6, 117.45, 0.168, 1.0, 0.584, 1.0, 0.874, -69.04, 0.126, 'Pop', 'Neutral', 'C', '4/4', 30, 1722.19, 3584.83, 0.0632, '[]', '[]'),
(7, 80.75, 0.318, 1.0, 0.464, 1.0, 0.928, -56.39, 0.072, 'Ambient', 'Neutral', 'G', '4/4', 30, 1121.95, 2261.08, 0.0359, '[]', '[]'),
(8, 0.0, 0.1, 0.147, 0.168, 1.0, 0.927, -77.18, 0.073, 'Ambient', 'Calm', 'F#', '4/4', 30, 427.85, 544.56, 0.0367, '[]', '[]'),
(9, 136.0, 0.21, 1.0, 0.843, 0.999, 0.672, -58.5, 0.328, 'Pop', 'Uplifting', 'A#', '4/4', 30, 2529.68, 5621.21, 0.1638, '[]', '[]'),
(10, 80.75, 0.187, 1.0, 0.762, 0.999, 0.802, -64.71, 0.198, 'Ambient', 'Uplifting', 'F', '4/4', 30, 2291.16, 4872.53, 0.099, '[]', '[]'),
(11, 152.0, 0.159, 0.745, 0.318, 1.0, 0.889, -66.97, 0.111, 'Pop', 'Calm', 'A', '4/4', 30, 847.88, 1581.54, 0.0555, '[]', '[]'),
(12, 92.29, 0.236, 1.0, 0.739, 0.999, 0.863, -59.6, 0.137, 'Ambient', 'Uplifting', 'B', '4/4', 30, 2148.9, 5034.32, 0.0687, '[]', '[]'),
(13, 161.5, 0.193, 1.0, 0.768, 0.999, 0.81, -65.08, 0.19, 'Pop', 'Uplifting', 'G', '4/4', 30, 2303.12, 4652.55, 0.0952, '[]', '[]'),
(14, 136.0, 0.182, 1.0, 0.488, 1.0, 0.938, -70.85, 0.062, 'Pop', 'Neutral', 'A', '4/4', 30, 1385.08, 3130.71, 0.0311, '[]', '[]'),
(15, 112.35, 0.257, 1.0, 0.553, 1.0, 0.887, -65.53, 0.113, 'Pop', 'Neutral', 'C', '4/4', 30, 1502.17, 3165.63, 0.0565, '[]', '[]'),
(16, 129.2, 0.272, 1.0, 1.0, 0.999, 0.784, -57.63, 0.216, 'Pop', 'Uplifting', 'A#', '4/4', 30, 3146.82, 6556.56, 0.108, '[]', '[]'),
(17, 112.35, 0.14, 1.0, 0.657, 1.0, 0.736, -59.99, 0.264, 'Pop', 'Uplifting', 'G#', '4/4', 30, 2004.54, 3494.78, 0.1319, '[]', '[]'),
(18, 92.29, 0.267, 1.0, 0.679, 0.999, 0.86, -57.42, 0.14, 'Ambient', 'Uplifting', 'A#', '4/4', 30, 1908.07, 4277.34, 0.0701, '[]', '[]'),
(19, 86.13, 0.163, 1.0, 0.945, 0.999, 0.639, -58.19, 0.361, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2931.59, 6334.57, 0.1807, '[]', '[]'),
(20, 129.2, 0.199, 1.0, 0.444, 1.0, 0.928, -69.34, 0.072, 'Pop', 'Neutral', 'C', '4/4', 30, 1214.5, 2459.02, 0.0362, '[]', '[]'),
(21, 161.5, 0.143, 0.601, 0.186, 1.0, 0.931, -76.58, 0.069, 'Pop', 'Calm', 'F', '4/4', 30, 429.12, 532.33, 0.0343, '[]', '[]'),
(22, 129.2, 0.244, 1.0, 0.65, 1.0, 0.839, -62.74, 0.161, 'Pop', 'Uplifting', 'E', '4/4', 30, 1842.72, 3721.17, 0.0805, '[]', '[]'),
(23, 129.2, 0.246, 1.0, 0.563, 1.0, 0.89, -63.1, 0.11, 'Pop', 'Neutral', 'G', '4/4', 30, 1547.24, 3208.03, 0.0548, '[]', '[]'),
(24, 234.91, 0.263, 0.479, 0.555, 1.0, 0.901, -64.98, 0.099, 'Pop', 'Neutral', 'E', '4/4', 30, 1501.55, 3128.68, 0.0496, '[]', '[]'),
(25, 129.2, 0.157, 1.0, 0.759, 0.999, 0.778, -61.78, 0.222, 'Pop', 'Uplifting', 'C', '4/4', 30, 2321.93, 4855.42, 0.1112, '[]', '[]'),
(26, 73.83, 0.183, 0.973, 0.506, 1.0, 0.82, -66.38, 0.18, 'Ambient', 'Neutral', 'D', '4/4', 30, 1443.37, 2549.16, 0.0899, '[]', '[]'),
(27, 161.5, 0.263, 1.0, 0.733, 0.999, 0.706, -58.08, 0.294, 'Pop', 'Uplifting', 'E', '4/4', 30, 2091.32, 4488.33, 0.147, '[]', '[]'),
(28, 92.29, 0.267, 1.0, 0.679, 0.999, 0.86, -57.42, 0.14, 'Ambient', 'Uplifting', 'A#', '4/4', 30, 1907.88, 4277.46, 0.0701, '[]', '[]'),
(29, 103.36, 0.178, 1.0, 0.668, 0.999, 0.835, -65.95, 0.165, 'Pop', 'Uplifting', 'C#', '4/4', 30, 1989.41, 4071.02, 0.0824, '[]', '[]'),
(30, 161.5, 0.161, 1.0, 0.735, 0.999, 0.834, -58.97, 0.166, 'Pop', 'Uplifting', 'A', '4/4', 30, 2235.88, 4691.57, 0.083, '[]', '[]'),
(31, 92.29, 0.207, 1.0, 0.509, 1.0, 0.93, -65.31, 0.07, 'Ambient', 'Neutral', 'G', '4/4', 30, 1421.32, 3156.86, 0.0352, '[]', '[]'),
(32, 161.5, 0.141, 1.0, 0.857, 0.999, 0.78, -61.09, 0.22, 'Pop', 'Uplifting', 'F', '4/4', 30, 2667.46, 5212.79, 0.1099, '[]', '[]'),
(33, 172.27, 0.137, 0.805, 0.61, 1.0, 0.874, -64.91, 0.126, 'Pop', 'Uplifting', 'A#', '4/4', 30, 1849.5, 3946.58, 0.0629, '[]', '[]'),
(34, 95.7, 0.198, 1.0, 0.493, 1.0, 0.87, -63.82, 0.13, 'Ambient', 'Neutral', 'C', '4/4', 30, 1378.91, 2547.81, 0.0648, '[]', '[]'),
(35, 112.35, 0.191, 1.0, 0.891, 0.999, 0.717, -52.21, 0.283, 'Pop', 'Uplifting', 'G', '4/4', 30, 2716.79, 5335.83, 0.1414, '[]', '[]'),
(36, 112.35, 0.249, 1.0, 0.451, 1.0, 0.902, -64.9, 0.098, 'Pop', 'Neutral', 'F#', '4/4', 30, 1172.53, 2377.87, 0.0488, '[]', '[]'),
(37, 60.09, 0.096, 0.742, 0.74, 0.999, 0.804, -58.33, 0.196, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2338.57, 4998.79, 0.0981, '[]', '[]'),
(38, 92.29, 0.314, 1.0, 0.832, 0.999, 0.839, -58.19, 0.161, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2353.98, 5312.02, 0.0807, '[]', '[]'),
(39, 123.05, 0.235, 0.958, 0.263, 1.0, 0.96, -73.74, 0.04, 'Pop', 'Calm', 'A#', '4/4', 30, 564.45, 920.97, 0.0201, '[]', '[]'),
(40, 117.45, 0.113, 1.0, 0.877, 0.999, 0.84, -65.66, 0.16, 'Pop', 'Uplifting', 'C', '4/4', 30, 2772.4, 5332.76, 0.0798, '[]', '[]'),
(41, 112.35, 0.314, 1.0, 1.0, 0.999, 0.653, -49.5, 0.347, 'Pop', 'Uplifting', 'C', '4/4', 30, 3802.65, 7300.53, 0.1735, '[]', '[]'),
(42, 112.35, 0.181, 1.0, 0.584, 1.0, 0.876, -63.42, 0.124, 'Pop', 'Neutral', 'A', '4/4', 30, 1704.25, 3612.22, 0.0621, '[]', '[]'),
(43, 117.45, 0.212, 1.0, 0.65, 1.0, 0.858, -66.77, 0.142, 'Pop', 'Uplifting', 'C', '4/4', 30, 1882.64, 3912.38, 0.071, '[]', '[]'),
(44, 129.2, 0.199, 1.0, 0.526, 1.0, 0.885, -68.73, 0.115, 'Pop', 'Neutral', 'D', '4/4', 30, 1486.79, 2944.74, 0.0573, '[]', '[]'),
(45, 143.55, 0.423, 1.0, 0.721, 1.0, 0.846, -59.63, 0.154, 'Pop', 'Uplifting', 'C', '4/4', 30, 1841.02, 3447.75, 0.077, '[]', '[]'),
(46, 123.05, 0.183, 0.953, 0.256, 1.0, 0.94, -70.1, 0.06, 'Pop', 'Calm', 'A#', '4/4', 30, 609.73, 1061.64, 0.0299, '[]', '[]'),
(47, 172.27, 0.232, 1.0, 0.817, 0.999, 0.765, -60.53, 0.235, 'Pop', 'Uplifting', 'E', '4/4', 30, 2413.98, 5027.39, 0.1173, '[]', '[]'),
(48, 152.0, 0.204, 1.0, 0.538, 1.0, 0.901, -64.92, 0.099, 'Pop', 'Neutral', 'A#', '4/4', 30, 1520.3, 3478.45, 0.0495, '[]', '[]'),
(49, 152.0, 0.264, 1.0, 0.792, 0.999, 0.791, -67.07, 0.209, 'Pop', 'Uplifting', 'A', '4/4', 30, 2288.0, 4430.66, 0.1047, '[]', '[]'),
(50, 152.0, 0.258, 1.0, 0.879, 0.999, 0.722, -67.27, 0.278, 'Pop', 'Uplifting', 'A', '4/4', 30, 2586.07, 4570.36, 0.1391, '[]', '[]'),
(51, 95.7, 0.2, 1.0, 0.41, 1.0, 0.863, -64.95, 0.137, 'Ambient', 'Neutral', 'C', '4/4', 30, 1099.42, 2375.89, 0.0687, '[]', '[]'),
(52, 152.0, 0.173, 1.0, 0.641, 0.999, 0.886, -66.67, 0.114, 'Pop', 'Uplifting', 'G', '4/4', 30, 1906.83, 4123.88, 0.0571, '[]', '[]');

-- Done!
SELECT 'Database initialization complete!' as Status;
SELECT COUNT(*) as AccountCount FROM Accounts;
SELECT COUNT(*) as ProductCount FROM Products;
SELECT COUNT(*) as AudioFeaturesCount FROM AudioFeatures;
