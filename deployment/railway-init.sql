-- Railway Database Initialization
-- Adapted from init-database.sh for Railway MySQL

-- Use the railway database (Railway's default)
USE railway;

-- DROP existing tables to ensure idempotent initialization
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS ImageGeneration, ImageCache, UserInteractions, AudioFeatures, UserRecommendations, Wishlist, Purchased_Products, Sold_Products, CustomerSummary, Payments, Order_Items, Orders, Stock, Products, Accounts;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- CREATE TABLES
-- ============================================

-- Account Table
CREATE TABLE IF NOT EXISTS Accounts (
    AccountID BIGINT AUTO_INCREMENT PRIMARY KEY,
    FirebaseUID VARCHAR(128) UNIQUE,
    AccountName VARCHAR(255) NOT NULL,
    AccountPhoneNumber VARCHAR(255),
    AccountEmailAddress VARCHAR(255) NOT NULL,
    AccountPassword VARCHAR(255) NOT NULL,
    AccountType VARCHAR(255) NOT NULL
);

-- Products Table (must be created before Orders, Stock, etc.)
CREATE TABLE IF NOT EXISTS Products (
    ProductID INT AUTO_INCREMENT PRIMARY KEY,
    AlbumTitle VARCHAR(255),
    AlbumPrice DECIMAL(10, 2),
    albumCoverImageUrl VARCHAR(512),
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

-- Stock Table (binary availability + weekly lifecycle timestamps)
CREATE TABLE IF NOT EXISTS Stock (
    StockID INT AUTO_INCREMENT PRIMARY KEY,
    IsAvailable BOOLEAN NOT NULL DEFAULT 1,
    UnavailableSince DATETIME NULL,
    AvailableSince DATETIME NULL,
    ProductID INT,
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
    UNIQUE KEY idx_stock_product (ProductID),
    INDEX idx_stock_is_available (IsAvailable),
    INDEX idx_stock_unavailable_since (UnavailableSince),
    INDEX idx_stock_available_since (AvailableSince)
);

-- Wishlist Table
CREATE TABLE IF NOT EXISTS Wishlist (
    WishlistID INT AUTO_INCREMENT PRIMARY KEY,
    AccountID BIGINT,
    ProductID INT,
    FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
    UNIQUE KEY uq_account_product (AccountID, ProductID)
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
    GenreCluster VARCHAR(100),
    Mood VARCHAR(100),
    Key_Signature VARCHAR(10),
    TimeSignature VARCHAR(10),
    Duration INT,
    SpectralCentroid FLOAT,
    SpectralRolloff FLOAT,
    ZeroCrossingRate FLOAT,
    SpectralBandwidth FLOAT,
    SpectralContrast TEXT,
    RmsEnergy FLOAT,
    OnsetRate FLOAT,
    HarmonicRatio FLOAT,
    PercussiveRatio FLOAT,
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
    INDEX idx_genre (Genre),
    INDEX idx_genre_cluster (GenreCluster)
);

-- ImageCache: Persist AI-generated image URLs by mood for instant loading
CREATE TABLE IF NOT EXISTS ImageCache (
    ImageID INT AUTO_INCREMENT PRIMARY KEY,
    Mood VARCHAR(50) NOT NULL,
    ImageUrl TEXT NOT NULL,
    ImageUrlLarge TEXT,
    Prompt TEXT,
    Width INT DEFAULT 1024,
    Height INT DEFAULT 1024,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mood (Mood)
);

-- ImageGeneration: Persist per-song image pools to avoid placeholder UI
-- Stores many images per ProductID; URLs are precomputed on service startup.
CREATE TABLE IF NOT EXISTS ImageGeneration (
    ImageGenID BIGINT AUTO_INCREMENT PRIMARY KEY,
    ProductID INT NOT NULL,
    Provider VARCHAR(32) NOT NULL DEFAULT 'loremflickr',
    KeywordTag VARCHAR(64),
    SourceUrl TEXT,
    StorageKey VARCHAR(512),
    ContentType VARCHAR(64),
    ByteSize INT,
    ImageUrl TEXT NOT NULL,
    UrlHash CHAR(32) NOT NULL,
    Width INT DEFAULT 1980,
    Height INT DEFAULT 1280,
    LockId INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ProductID) REFERENCES Products(ProductID) ON DELETE CASCADE,
    UNIQUE KEY uniq_product_hash (ProductID, UrlHash),
    INDEX idx_product (ProductID),
    INDEX idx_provider (Provider),
    INDEX idx_created (CreatedAt)
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

-- Ensure derived purchase tables stay in sync with Order_Items inserts.
DROP TRIGGER IF EXISTS After_Order_Item_Insert;
DELIMITER //
CREATE TRIGGER After_Order_Item_Insert
AFTER INSERT ON Order_Items
FOR EACH ROW
BEGIN
    DECLARE v_AccountID BIGINT;

    INSERT INTO Sold_Products (OrderItemID, ProductID)
    VALUES (NEW.OrderItemID, NEW.ProductID);

    INSERT INTO Purchased_Products (OrderItemID, ProductID)
    VALUES (NEW.OrderItemID, NEW.ProductID);

    SELECT AccountID INTO v_AccountID
    FROM Orders
    WHERE OrderID = NEW.OrderID
    LIMIT 1;

    IF v_AccountID IS NOT NULL THEN
        INSERT INTO CustomerSummary (AccountID, ProductID, OrderID)
        VALUES (v_AccountID, NEW.ProductID, NEW.OrderID);
    END IF;
END //
DELIMITER ;

-- Insert Products (Games and Music Albums)
INSERT INTO `Products` VALUES (1,'Alien Acid',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Acid.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Acid.wav',200);
INSERT INTO `Products` VALUES (2,'Alien Action',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Action.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Action.wav',200);
INSERT INTO `Products` VALUES (3,'Alien Amen Break Beat',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav',200);
INSERT INTO `Products` VALUES (4,'Alien Amp Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amp%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amp%20Up.wav',200);
INSERT INTO `Products` VALUES (5,'Alien Bars',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Bars.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Bars.wav',200);
INSERT INTO `Products` VALUES (6,'Alien Business',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Business.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Business.wav',200);
INSERT INTO `Products` VALUES (7,'Alien Chilling',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Chilling.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Chilling.wav',200);
INSERT INTO `Products` VALUES (8,'Alien Essence',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Essence.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Essence.wav',200);
INSERT INTO `Products` VALUES (9,'Alien Euphoria',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Euphoria.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Euphoria.wav',200);
INSERT INTO `Products` VALUES (10,'Alien Feels',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Feels.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Feels.wav',200);
INSERT INTO `Products` VALUES (11,'Alien Flow State',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Flow%20State.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Flow%20State.wav',200);
INSERT INTO `Products` VALUES (12,'Alien Grind',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Grind.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Grind.wav',200);
INSERT INTO `Products` VALUES (13,'Alien Harmony',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Harmony.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Harmony.wav',200);
INSERT INTO `Products` VALUES (14,'Alien Hyperness',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Hyperness.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Hyperness.wav',200);
INSERT INTO `Products` VALUES (15,'Alien Joy',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Joy.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Joy.wav',200);
INSERT INTO `Products` VALUES (16,'Alien Memories',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Memories.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Memories.wav',200);
INSERT INTO `Products` VALUES (17,'Alien Mode',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Mode.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Mode.wav',200);
INSERT INTO `Products` VALUES (18,'Alien Nature',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Nature.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Nature.wav',200);
INSERT INTO `Products` VALUES (19,'Alien Project Meeting',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Project%20Meeting.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Project%20Meeting.wav',200);
INSERT INTO `Products` VALUES (20,'Alien Ragebait',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Ragebait.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Ragebait.wav',200);
INSERT INTO `Products` VALUES (21,'Alien Realm',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Realm.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Realm.wav',200);
INSERT INTO `Products` VALUES (22,'Alien Sense',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Sense.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Sense.wav',200);
INSERT INTO `Products` VALUES (23,'Alien Singing',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Singing.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Singing.wav',200);
INSERT INTO `Products` VALUES (24,'Alien Soul',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Soul.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Soul.wav',200);
INSERT INTO `Products` VALUES (25,'Alien Translation',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Translation.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Translation.wav',200);
INSERT INTO `Products` VALUES (26,'Alien Turn Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Turn%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Turn%20Up.wav',200);
INSERT INTO `Products` VALUES (27,'Alien Upgrade',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Upgrade.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Upgrade.wav',200);
INSERT INTO `Products` VALUES (28,'Alien Utopia',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Utopia.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Utopia.wav',200);
INSERT INTO `Products` VALUES (29,'Alien Wonder',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Wonder.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Wonder.wav',200);
INSERT INTO `Products` VALUES (30,'Breakcore Bear Hug',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav',200);
INSERT INTO `Products` VALUES (31,'Drunk House',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav',200);
INSERT INTO `Products` VALUES (32,'Extraterrestrial Rave',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial%20Rave.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial%20Rave.wav',200);
INSERT INTO `Products` VALUES (33,'Green Bear',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20Bear.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20Bear.wav',200);
INSERT INTO `Products` VALUES (34,'Green God',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20God.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20God.wav',200);
INSERT INTO `Products` VALUES (35,'Intergalactic Rave',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic%20Rave.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic%20Rave.wav',200);
INSERT INTO `Products` VALUES (36,'Soft Chaos',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav',200);
INSERT INTO `Products` VALUES (37,'Ted Chilling',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav',200);
INSERT INTO `Products` VALUES (38,'Teddy Emotion',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy%20Emotion.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy%20Emotion.wav',200);
INSERT INTO `Products` VALUES (39,'Ted’s Awakening',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Awakening.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Awakening.wav',200);
INSERT INTO `Products` VALUES (40,'Ted’s Beautiful Anger',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Beautiful%20Anger.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Beautiful%20Anger.wav',200);
INSERT INTO `Products` VALUES (41,'Ted’s Chillness',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Chillness.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Chillness.wav',200);
INSERT INTO `Products` VALUES (42,'Ted’s Deepness',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Deepness.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Deepness.wav',200);
INSERT INTO `Products` VALUES (43,'Ted’s Dream',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Dream.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Dream.wav',200);
INSERT INTO `Products` VALUES (44,'Ted’s Energy',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Energy.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Energy.wav',200);
INSERT INTO `Products` VALUES (45,'Ted’s Green Machine',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Green%20Machine.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Green%20Machine.wav',200);
INSERT INTO `Products` VALUES (46,'Ted’s Rush Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Rush%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Rush%20Up.wav',200);
INSERT INTO `Products` VALUES (47,'Ted’s Utopia',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Utopia.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%27s%20Utopia.wav',200);


-- Insert AudioFeatures for music products
INSERT INTO `AudioFeatures` VALUES (738,4,136,0.714,0.19,0.459,1,0.672,-58.5,0.328,'Electronic','Cluster 2','energetic','A#','4/4',30,2529.68,5621.21,0.1638,2577.26,'[16.13828129456584, 11.069588656978425, 13.881570303635579, 14.985187374163875, 16.77589686424007, 16.350613895034744, 49.26851014665856]',0.105157,4.667,0.4119,0.5881,'[-173.56605529785156, 98.32673645019531, 20.514408111572266, 18.889841079711914, 14.777069091796875, 6.647645473480225, 5.771152496337891, 10.658245086669922, 0.14356110990047455, 5.037039756774902, -0.3565864562988281, 9.898202896118164, -3.9117813110351562]','[0.5842545628547668, 0.5410036444664001, 0.5196573734283447, 0.503713071346283, 0.5226868391036987, 0.6135708093643188, 0.5325860381126404, 0.4706481397151947, 0.4980233609676361, 0.5585569143295288, 0.6801507472991943, 0.5890701413154602]','2026-04-05 14:58:39','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (739,2,80.75,1,0.271,0.204,1,0.928,-56.39,0.072,'Electronic','Cluster 2','calm','G','4/4',30,1121.95,2261.08,0.0359,1575.95,'[13.946602283181596, 12.229962616374209, 15.688672096682474, 15.859135620318984, 15.694192014707316, 16.46673918649464, 45.714472256882814]',0.158819,5.1,0.5329,0.4671,'[-160.5883331298828, 154.20309448242188, 6.3192338943481445, 39.80005645751953, 11.498737335205078, 10.888457298278809, 3.7194249629974365, 7.480372905731201, 1.5592849254608154, 9.576579093933105, 3.297532558441162, 2.85922908782959, -2.3978919982910156]','[0.4899482727050781, 0.4097427427768707, 0.37036189436912537, 0.36979860067367554, 0.4186936020851135, 0.47673436999320984, 0.4084568917751312, 0.534656822681427, 0.47800248861312866, 0.4820568859577179, 0.5121039748191833, 0.5257129669189453]','2026-04-05 14:58:47','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (740,1,117.45,0.488,0.23,0.312,1,0.874,-69.04,0.126,'Electronic','Cluster 2','calm','C','4/4',30,1722.19,3584.83,0.0632,1868.09,'[15.66614078052537, 14.313673269991673, 14.750824019807526, 17.250440523986605, 16.25728737138367, 16.738498508646398, 41.37570604237776]',0.084153,5.067,0.5721,0.4279,'[-291.7796630859375, 111.64028930664062, 48.19269943237305, 14.828949928283691, 1.358402132987976, 8.407594680786133, 4.571701526641846, 9.025636672973633, 3.417975902557373, 6.400054931640625, 1.8948384523391724, 1.1143864393234253, -1.3582206964492798]','[0.8696905970573425, 0.5900625586509705, 0.4457494914531708, 0.4092062711715698, 0.42403706908226013, 0.3584103584289551, 0.3536975383758545, 0.47110459208488464, 0.42281708121299744, 0.40945959091186523, 0.45202991366386414, 0.5952064394950867]','2026-04-05 14:58:49','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (741,3,120,0.744,0.189,0.078,1,0.927,-77.18,0.073,'Electronic','Cluster 1','calm','F#','4/4',30,427.85,544.56,0.0367,322.69,'[25.91014263773675, 24.243595444411568, 30.044919690792817, 29.359751032915362, 27.64744018781158, 13.831809977040566, 38.52178082105012]',0.05006,7.333,0.9994,0.0006,'[-498.8492736816406, 157.57118225097656, 76.0373306274414, 8.46163558959961, -19.200679779052734, -23.63567352294922, -28.274227142333984, -36.56103515625, -39.56654739379883, -33.27803421020508, -22.332683563232422, -14.160150527954102, -12.939480781555176]','[0.2521918714046478, 0.19001205265522003, 0.07258238643407822, 0.21958176791667938, 0.05029676482081413, 0.12331210821866989, 0.6893225908279419, 0.47778546810150146, 0.12202895432710648, 0.1776474118232727, 0.5485556721687317, 0.19877539575099945]','2026-04-05 14:58:50','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (742,5,80.75,0.512,0.261,0.416,1,0.802,-64.71,0.198,'Electronic','Cluster 2','calm','F','4/4',30,2291.16,4872.53,0.099,2248.24,'[18.705546561551103, 13.863836290992465, 17.456673969354824, 18.48008038846933, 19.888504314091378, 22.201614905279847, 48.55503538396154]',0.093686,5.033,0.7237,0.2763,'[-224.2651824951172, 85.18619537353516, 1.8011455535888672, 36.73760223388672, 8.387450218200684, 18.134429931640625, 6.105869293212891, 6.5609965324401855, 4.75814962387085, 7.528581619262695, 3.2510831356048584, 5.749767780303955, 3.087707281112671]','[0.3869478404521942, 0.34176206588745117, 0.3896002173423767, 0.43647465109825134, 0.5009134411811829, 0.6020864844322205, 0.44727790355682373, 0.42112448811531067, 0.5123448967933655, 0.45260417461395264, 0.453020304441452, 0.33988597989082336]','2026-04-05 14:59:02','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (743,8,161.5,0.758,0.183,0.418,1,0.81,-65.08,0.19,'Electronic','Cluster 2','calm','G','4/4',30,2303.12,4652.55,0.0952,2103.72,'[18.479701403818634, 18.997625452918093, 24.702572921580146, 25.768554861478204, 20.28203267958105, 18.01973937626888, 44.16740506524957]',0.096575,4.533,0.5293,0.4707,'[-274.0487976074219, 84.15977478027344, 28.312742233276367, -10.254232406616211, -23.26548957824707, -15.990489959716797, -13.9362211227417, 0.6028302311897278, 0.28409135341644287, 7.250712871551514, 1.9116781949996948, 3.503545045852661, 4.716301918029785]','[0.3145711421966553, 0.21121150255203247, 0.28714972734451294, 0.21425139904022217, 0.3558451235294342, 0.35404306650161743, 0.2764364778995514, 0.553981602191925, 0.33949169516563416, 0.3881781995296478, 0.35758474469184875, 0.48471757769584656]','2026-04-05 14:59:18','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (744,6,152,1,0.167,0.154,1,0.889,-66.97,0.111,'Electronic','Cluster 1','calm','A','4/4',30,847.88,1581.54,0.0555,903.16,'[18.914518390549475, 15.87850114979303, 19.15589906561329, 22.854623372736082, 22.718194186722332, 26.540824957112946, 46.326921379902124]',0.079417,2.267,0.9332,0.0668,'[-272.8619689941406, 163.66107177734375, -8.853872299194336, 11.022200584411621, -11.258843421936035, -0.6838850378990173, -1.321034550666809, 6.201972007751465, 6.1769118309021, 5.139103412628174, -2.2383921146392822, 0.010299068875610828, 1.5301882028579712]','[0.1770537793636322, 0.23311617970466614, 0.10511849820613861, 0.14160595834255219, 0.43663322925567627, 0.20520831644535065, 0.07497717440128326, 0.0690610408782959, 0.23357799649238586, 0.5501435399055481, 0.330685555934906, 0.32476523518562317]','2026-04-05 14:59:34','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (745,7,92.29,0.841,0.276,0.39,1,0.863,-59.6,0.137,'Electronic','Cluster 2','calm','B','4/4',30,2148.9,5034.32,0.0687,2555.8,'[17.72356313364088, 13.330468615363527, 17.169725835904625, 15.99580201385674, 15.113581213370235, 15.209835325368658, 46.803002052385416]',0.117766,4.533,0.4892,0.5108,'[-192.7371368408203, 90.75020599365234, 36.50471496582031, 31.312911987304688, 7.3049397468566895, 19.672861099243164, 6.182407855987549, 6.147857666015625, -3.6068320274353027, 4.010048866271973, 0.14933545887470245, 11.057010650634766, 2.7568647861480713]','[0.5351702570915222, 0.46278509497642517, 0.49196040630340576, 0.4662717878818512, 0.5080235600471497, 0.430172324180603, 0.446509450674057, 0.49664023518562317, 0.48366987705230713, 0.5673215985298157, 0.5497402548789978, 0.6479500532150269]','2026-04-05 14:59:58','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (746,10,112.35,0.889,0.205,0.273,1,0.887,-65.53,0.113,'Electronic','Cluster 1','calm','C','4/4',30,1502.17,3165.63,0.0565,1668.63,'[18.69527304921824, 17.619539341830563, 25.759111637743967, 19.400926255924478, 21.747151608211126, 27.581451907825816, 45.60604947786859]',0.12852,4.2,0.7824,0.2176,'[-262.2541809082031, 127.989990234375, 36.87516784667969, 18.66297149658203, 1.87890625, 1.5694677829742432, -1.4080365896224976, -10.532339096069336, -12.458943367004395, -0.9789360761642456, -0.3932969272136688, 4.8248090744018555, 8.377914428710938]','[0.6288644671440125, 0.2211882472038269, 0.12872323393821716, 0.2408715784549713, 0.3778626322746277, 0.1641283482313156, 0.1252022087574005, 0.1214347556233406, 0.15362416207790375, 0.3075670599937439, 0.22155889868736267, 0.24811126291751862]','2026-04-05 14:59:59','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (747,9,136,0.342,0.253,0.251,1,0.938,-70.85,0.062,'Electronic','Cluster 2','sad','A','4/4',30,1385.08,3130.71,0.0311,1817.36,'[23.2357259475278, 17.804448295704894, 21.42686745022047, 20.427642116681184, 19.034549447493156, 18.5171220840463, 47.22866021290685]',0.091179,3.433,0.8751,0.1249,'[-228.78443908691406, 116.61597442626953, 2.2653284072875977, 24.30242156982422, 8.909819602966309, 12.791057586669922, 5.938939094543457, 8.34558391571045, 3.813663959503174, 5.994678020477295, 3.8269357681274414, 5.087463855743408, 3.325073719024658]','[0.4378887414932251, 0.3786922097206116, 0.34861528873443604, 0.3111705482006073, 0.43505772948265076, 0.2890700697898865, 0.3047960698604584, 0.49127283692359924, 0.5314127206802368, 0.652132511138916, 0.49258777499198914, 0.4344289302825928]','2026-04-05 15:00:07','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (748,11,129.2,0.634,0.177,0.571,1,0.784,-57.63,0.216,'Electronic','Cluster 2','energetic','A#','4/4',30,3146.82,6556.56,0.108,2838.27,'[19.091831879191453, 11.673921521099285, 13.411410761442475, 13.033113860944415, 15.318539388269041, 14.718740831955666, 45.15932868724478]',0.136008,7.133,0.6011,0.3989,'[-173.13739013671875, 34.45747756958008, 28.51560401916504, 34.05729675292969, 11.609046936035156, 21.3087158203125, 12.639996528625488, 12.151270866394043, -0.04745180904865265, 9.126514434814453, 1.7712595462799072, 7.550594329833984, 0.2620624303817749]','[0.5958718657493591, 0.6071215867996216, 0.5532501339912415, 0.5172088146209717, 0.5691878795623779, 0.6215564012527466, 0.6377958059310913, 0.6667459607124329, 0.714123010635376, 0.7796725630760193, 0.78364098072052, 0.6435062885284424]','2026-04-05 15:00:15','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (749,15,129.2,0.759,0.198,0.22,1,0.928,-69.34,0.072,'Electronic','Cluster 2','calm','C','4/4',30,1214.5,2459.02,0.0362,1576.13,'[23.8370025763175, 22.24889170408352, 24.447733054516082, 24.422638120800237, 23.852445772689897, 20.418055532980436, 44.784573802768506]',0.099287,3.6,0.2984,0.7016,'[-321.4566955566406, 83.47396087646484, 10.06994342803955, 17.939945220947266, -3.6801888942718506, 8.457157135009766, -0.46799659729003906, -1.729479193687439, -3.538048028945923, -2.9204957485198975, -5.319190979003906, -1.986415982246399, -3.8233866691589355]','[0.6574205160140991, 0.43358665704727173, 0.46574410796165466, 0.31679871678352356, 0.3043428361415863, 0.27727144956588745, 0.3064235746860504, 0.5015268921852112, 0.35467928647994995, 0.3682245910167694, 0.33953672647476196, 0.46972858905792236]','2026-04-05 15:00:42','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (750,14,86.13,0.572,0.209,0.532,1,0.639,-58.19,0.361,'Electronic','Cluster 2','energetic','C','4/4',30,2931.59,6334.57,0.1807,2802.46,'[17.866879023631956, 12.303211560527528, 14.132209705184872, 14.587166481398588, 15.181649447571058, 15.74076997966463, 46.94831411212064]',0.081496,4.533,0.4598,0.5402,'[-190.9525146484375, 67.5693359375, 15.864490509033203, 28.39185905456543, -0.8594547510147095, 11.9025297164917, 3.507998466491699, 9.268799781799316, 1.7546393871307373, 3.0277488231658936, 2.8171935081481934, 2.9029135704040527, -0.6429049372673035]','[0.6105231642723083, 0.6057002544403076, 0.6062937378883362, 0.5997845530509949, 0.6053523421287537, 0.5604987144470215, 0.5152921676635742, 0.545059084892273, 0.5126366019248962, 0.517414927482605, 0.5654284954071045, 0.6069908738136292]','2026-04-05 15:00:46','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (751,13,92.29,0.679,0.241,0.346,1,0.86,-57.42,0.14,'Electronic','Cluster 2','calm','A#','4/4',30,1908.07,4277.34,0.0701,2249.93,'[15.223638502926558, 13.403833052004977, 17.803191843976123, 18.421670289073173, 15.984647997354278, 15.440806886609733, 45.53848476694902]',0.133748,5.533,0.3509,0.6491,'[-138.92984008789062, 125.23304748535156, 24.38108253479004, 13.790332794189453, -6.302807807922363, 0.11525818705558777, -4.646751403808594, 3.3020846843719482, -2.9362921714782715, 2.1210250854492188, -1.0549159049987793, 3.6283419132232666, -2.4360549449920654]','[0.2548246383666992, 0.3047349750995636, 0.4560638666152954, 0.5467240214347839, 0.3741835355758667, 0.473758339881897, 0.3302142322063446, 0.3891015648841858, 0.2891090214252472, 0.3596285879611969, 0.6662790179252625, 0.3345089256763458]','2026-04-05 15:00:55','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (752,17,129.2,0.701,0.183,0.334,1,0.839,-62.74,0.161,'Electronic','Cluster 2','calm','E','4/4',30,1842.72,3721.17,0.0805,1933.08,'[18.17411471485557, 11.914495336582089, 16.595825268866566, 15.3568316448614, 17.27208196068794, 15.907975013528292, 46.71355121929249]',0.12195,5.5,0.6139,0.3861,'[-229.52503967285156, 85.82749938964844, 1.8272905349731445, 40.14368438720703, 18.076255798339844, 16.76407814025879, 3.114091634750366, 18.76078987121582, 11.630099296569824, 9.36582088470459, 7.079768180847168, 13.588312149047852, 3.4006845951080322]','[0.3982434868812561, 0.4371739327907562, 0.5721983313560486, 0.5522677302360535, 0.6101207733154297, 0.5873250365257263, 0.5112078189849854, 0.5765304565429688, 0.5394662022590637, 0.45233485102653503, 0.40852734446525574, 0.37387603521347046]','2026-04-05 15:01:01','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (753,12,112.35,0.47,0.257,0.364,1,0.736,-59.99,0.264,'Electronic','Cluster 2','calm','G#','4/4',30,2004.54,3494.78,0.1319,1741.78,'[15.533540032541362, 11.64298347783705, 16.49374725207459, 14.827278963455448, 17.035417230200792, 23.08236270854751, 48.542813007281524]',0.070087,4.967,0.6449,0.3551,'[-142.93064880371094, 120.18232727050781, -58.5262451171875, 30.326322555541992, 0.7238057851791382, -12.0706205368042, -0.5284595489501953, -14.991064071655273, -4.75360631942749, 6.931060314178467, -4.71026611328125, -1.4554386138916016, -0.5561707019805908]','[0.3904719948768616, 0.3156321346759796, 0.2801608741283417, 0.2788582146167755, 0.27005165815353394, 0.33840078115463257, 0.6471386551856995, 0.6640409231185913, 0.7899214029312134, 0.7332117557525635, 0.5300519466400146, 0.4873392581939697]','2026-04-05 15:01:21','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (754,18,129.2,0.873,0.289,0.281,1,0.89,-63.1,0.11,'Electronic','Cluster 1','calm','G','4/4',30,1547.24,3208.03,0.0548,1923.67,'[21.97858522899594, 20.422772869332107, 24.785104467007752, 25.10753536066809, 24.072161938862234, 21.933268804449078, 49.790134787756166]',0.123017,4.367,0.3977,0.6023,'[-181.6957550048828, 115.22474670410156, -6.62003231048584, 17.245302200317383, -6.895037651062012, -1.3102341890335083, -7.087146282196045, -2.2928571701049805, -9.346034049987793, 0.5336928367614746, -7.27768087387085, -2.950411558151245, -11.221529960632324]','[0.24072995781898499, 0.17559874057769775, 0.2712497413158417, 0.24079744517803192, 0.5082387924194336, 0.22934827208518982, 0.22546249628067017, 0.5189749002456665, 0.2869715392589569, 0.38268882036209106, 0.25323450565338135, 0.44413262605667114]','2026-04-05 15:01:22','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (755,16,161.5,0.958,0.086,0.078,1,0.931,-76.58,0.069,'Electronic','Cluster 1','calm','F','4/4',30,429.12,532.33,0.0343,319.63,'[31.749551164737, 32.709794950304506, 35.113590792286736, 33.1578923267801, 30.3330575139508, 22.694751910338187, 38.38104291103939]',0.07136,2.8,0.9945,0.0055,'[-467.0399475097656, 164.8089141845703, 49.701759338378906, -11.538522720336914, -23.373971939086914, -23.43776512145996, -28.623035430908203, -33.32231521606445, -31.916704177856445, -29.92522430419922, -29.254810333251953, -27.15540885925293, -21.705883026123047]','[0.3011217415332794, 0.13237810134887695, 0.19154198467731476, 0.15453779697418213, 0.43265676498413086, 0.44874078035354614, 0.18801581859588623, 0.4219789206981659, 0.18528275191783905, 0.3935926556587219, 0.08183499425649643, 0.09568076580762863]','2026-04-05 15:01:22','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (756,20,129.2,0.574,0.194,0.421,1,0.778,-61.78,0.222,'Electronic','Cluster 2','calm','C','4/4',30,2321.93,4855.42,0.1112,2187.88,'[14.803325226778863, 10.655229888455612, 13.774427691687317, 16.1854110167561, 16.013365581725694, 15.517641087246659, 44.75158513124717]',0.078437,4.467,0.4142,0.5858,'[-230.03004455566406, 101.03678131103516, 37.38475799560547, 12.480850219726562, -3.4072492122650146, 6.950671672821045, -1.5474573373794556, 6.9413065910339355, -1.1668068170547485, 4.92484712600708, -0.19639846682548523, 5.918920516967773, 1.9171746969223022]','[0.6036909222602844, 0.5917720198631287, 0.5428407788276672, 0.5378152132034302, 0.5542937517166138, 0.5524892210960388, 0.5465307831764221, 0.5285900235176086, 0.5022815465927124, 0.5103784203529358, 0.5463089346885681, 0.5640500783920288]','2026-04-05 15:01:38','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (757,21,73.83,0.696,0.144,0.262,1,0.82,-66.38,0.18,'Electronic','Cluster 2','calm','D','4/4',30,1443.37,2549.16,0.0899,1669.21,'[16.155563179006396, 13.289565506214847, 21.766423761216487, 17.37827184519235, 17.707115963592464, 18.79576687976345, 45.98899004012004]',0.091395,2.833,0.5421,0.4579,'[-242.52249145507812, 148.96246337890625, -2.1132805347442627, 7.093379020690918, -2.065094470977783, -0.0870782732963562, -1.4206916093826294, -2.2283856868743896, -2.05564284324646, 10.666793823242188, 8.658056259155273, 11.549273490905762, 3.4565625190734863]','[0.4983883202075958, 0.3290005028247833, 0.5850901007652283, 0.3079705536365509, 0.4576011300086975, 0.24514640867710114, 0.1975816786289215, 0.3412894010543823, 0.20811687409877777, 0.18828809261322021, 0.19417555630207062, 0.2652498781681061]','2026-04-05 15:01:43','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (758,19,234.91,0.851,0.167,0.272,1,0.901,-64.98,0.099,'Electronic','Cluster 2','calm','E','4/4',30,1501.55,3128.68,0.0496,1879.76,'[22.766190864401203, 15.532182144045356, 18.417988738421, 18.35540796376045, 18.480948534970295, 21.05668839643389, 48.37025220486282]',0.131277,1.4,0.9414,0.0586,'[-225.29017639160156, 103.07921600341797, -12.360396385192871, 48.59523010253906, 5.550570487976074, 10.617121696472168, 10.418973922729492, 1.0992306470870972, -2.411526679992676, 5.0084004402160645, 0.6325653195381165, 3.7127039432525635, -1.4993103742599487]','[0.34424859285354614, 0.3155418336391449, 0.383274644613266, 0.3899000287055969, 0.4662596583366394, 0.42539793252944946, 0.3781391978263855, 0.4422891438007355, 0.36465439200401306, 0.37306544184684753, 0.38901185989379883, 0.4251267611980438]','2026-04-05 15:02:10','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (759,22,161.5,0.62,0.205,0.379,1,0.706,-58.08,0.294,'Electronic','Cluster 2','calm','E','4/4',30,2091.32,4488.33,0.147,2304.88,'[16.786369235907728, 11.174520737470504, 15.611365721717673, 13.733453593930678, 15.114732506292523, 16.12805925543186, 46.9985364104308]',0.131472,5.433,0.2419,0.7581,'[-166.0731964111328, 90.38202667236328, 1.6462253332138062, 43.3494873046875, 2.2906692028045654, 10.640787124633789, -1.549059271812439, 2.4666128158569336, -4.333460330963135, 1.579591155052185, -0.09253109246492386, 4.702509880065918, -2.613163709640503]','[0.5412710905075073, 0.5273582339286804, 0.5739275813102722, 0.5751316547393799, 0.5975916981697083, 0.544954776763916, 0.48581168055534363, 0.4144611060619354, 0.469478964805603, 0.5752703547477722, 0.5607941150665283, 0.5502389073371887]','2026-04-05 15:02:23','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (760,24,103.36,0.418,0.174,0.361,1,0.835,-65.95,0.165,'Electronic','Cluster 2','sad','C#','4/4',30,1989.41,4071.02,0.0824,2122.98,'[16.252206837787, 13.427541216412738, 17.874464272303157, 16.708670110567795, 18.483316931972574, 17.89327692076723, 48.42838244988462]',0.089073,4.533,0.5051,0.4949,'[-225.74314880371094, 98.8675537109375, 18.74367332458496, 10.258077621459961, 0.6093793511390686, 1.7460776567459106, -6.825586795806885, -1.959046721458435, -4.9704060554504395, -0.5223786234855652, -0.7313708662986755, 1.604599118232727, -3.6765477657318115]','[0.43157482147216797, 0.48110857605934143, 0.4554288983345032, 0.43230190873146057, 0.40751558542251587, 0.4146325886249542, 0.40717610716819763, 0.4492172300815582, 0.4064130187034607, 0.4685404300689697, 0.43919387459754944, 0.3827185034751892]','2026-04-05 15:02:31','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (761,23,92.29,0.679,0.241,0.346,1,0.86,-57.42,0.14,'Electronic','Cluster 2','calm','A#','4/4',30,1907.88,4277.46,0.0701,2249.84,'[15.196817855518953, 13.404208110492494, 17.748140581114637, 18.448514859363943, 16.00808795368092, 15.443258688415408, 45.53407107336524]',0.133744,5.533,0.3509,0.6491,'[-138.93121337890625, 125.22777557373047, 24.388532638549805, 13.802616119384766, -6.3085198402404785, 0.11406289786100388, -4.661259174346924, 3.323747396469116, -2.951113700866699, 2.109877347946167, -1.0496327877044678, 3.645723342895508, -2.4496374130249023]','[0.25486302375793457, 0.3046948313713074, 0.45605507493019104, 0.5465919375419617, 0.3741709589958191, 0.47376933693885803, 0.3303375542163849, 0.3891395330429077, 0.28909602761268616, 0.359598308801651, 0.6662948131561279, 0.33458366990089417]','2026-04-05 15:02:31','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (762,25,161.5,0.707,0.173,0.406,1,0.834,-58.97,0.166,'Electronic','Cluster 2','calm','A','4/4',30,2235.88,4691.57,0.083,2374.59,'[15.75661726716792, 13.177093723887142, 17.084431765175722, 15.703984167085485, 15.690527917260171, 16.519021691211297, 46.55860504206958]',0.080359,4.8,0.3036,0.6964,'[-227.58119201660156, 88.05905151367188, 20.057432174682617, 26.69036293029785, 5.110052108764648, 5.863609313964844, -0.7672248482704163, 3.8998475074768066, -6.461249828338623, -1.0759804248809814, -4.444858074188232, -1.059238076210022, -6.027135372161865]','[0.49975284934043884, 0.46023795008659363, 0.5243709087371826, 0.4820462167263031, 0.43907955288887024, 0.46005362272262573, 0.44444161653518677, 0.5025918483734131, 0.47112342715263367, 0.5443638563156128, 0.4926835298538208, 0.43022841215133667]','2026-04-05 15:02:41','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (763,28,172.27,0.561,0.262,0.336,1,0.874,-64.91,0.126,'Electronic','Cluster 1','calm','A#','4/4',30,1849.5,3946.58,0.0629,2084.83,'[24.95206813478288, 21.356691680009426, 24.365987236655602, 23.51913461298861, 23.71564913669836, 22.192681982383448, 49.050326062533294]',0.068338,3.3,0.8843,0.1157,'[-235.661376953125, 104.2260513305664, -1.7475314140319824, 16.74005126953125, -3.086660385131836, 1.3579883575439453, -14.800631523132324, -8.322338104248047, -12.923497200012207, -13.343825340270996, -11.013127326965332, -12.749248504638672, -11.544975280761719]','[0.3338605463504791, 0.227630615234375, 0.28221920132637024, 0.3234154284000397, 0.19356444478034973, 0.3703901469707489, 0.23077118396759033, 0.32044050097465515, 0.1785365343093872, 0.19921952486038208, 0.4599723815917969, 0.2788541316986084]','2026-04-05 15:02:57','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (764,27,161.5,0.668,0.238,0.484,1,0.78,-61.09,0.22,'Electronic','Cluster 1','energetic','F','4/4',30,2667.46,5212.79,0.1099,2386.06,'[20.428329032905324, 19.019988353254895, 24.22239095477798, 24.63481999553846, 23.67216686273106, 18.68161823364795, 45.853051993961586]',0.070536,4.6,0.9347,0.0653,'[-238.71932983398438, 100.74251556396484, 30.2479190826416, -10.550792694091797, 5.928128719329834, 8.20437240600586, -18.049846649169922, -5.444216251373291, -16.081653594970703, -9.924089431762695, -16.338537216186523, -6.122375011444092, -3.8855621814727783]','[0.3255111575126648, 0.1552526205778122, 0.23430858552455902, 0.11970798671245575, 0.31193551421165466, 0.7382984161376953, 0.2856314480304718, 0.17444707453250885, 0.09705385565757751, 0.09752320498228073, 0.31410452723503113, 0.17640192806720734]','2026-04-05 15:02:58','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (765,26,92.29,0.772,0.122,0.258,1,0.93,-65.31,0.07,'Electronic','Cluster 2','calm','G','4/4',30,1421.32,3156.86,0.0352,1724.97,'[23.601465858622692, 14.821965487660892, 14.843581371787147, 13.973712828083869, 17.175843783372212, 16.28130741498253, 45.29545459606505]',0.103704,3,0.5581,0.4419,'[-271.5086669921875, 109.86163330078125, 9.930145263671875, 39.70039749145508, 14.661646842956543, 23.213451385498047, 8.918110847473145, 11.354644775390625, -1.013602375984192, 2.0665488243103027, 0.10183574259281158, 2.1761035919189453, 1.3367999792099]','[0.2500383257865906, 0.2767792344093323, 0.3448827266693115, 0.3383305072784424, 0.36670053005218506, 0.45093750953674316, 0.7205297350883484, 0.8620312809944153, 0.7329985499382019, 0.5163260698318481, 0.3295186161994934, 0.2559756934642792]','2026-04-05 15:03:03','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (766,29,95.7,0.765,0.19,0.25,1,0.87,-63.82,0.13,'Electronic','Cluster 1','calm','C','4/4',30,1378.91,2547.81,0.0648,1382.07,'[17.863196618145654, 19.154485655888337, 21.44494844823984, 20.572987935030735, 19.558708865033736, 18.734041021044014, 44.65974135874672]',0.098978,3.367,0.5525,0.4475,'[-267.4826965332031, 140.6433563232422, 17.76319694519043, 19.929378509521484, 5.183872699737549, 0.5665740370750427, -2.9422571659088135, -0.6028041839599609, -7.536318778991699, -4.591829299926758, -8.156452178955078, -3.0622804164886475, -1.9345676898956299]','[0.47165748476982117, 0.3342323899269104, 0.4507347643375397, 0.31773650646209717, 0.409074991941452, 0.3314514756202698, 0.3101437985897064, 0.41882559657096863, 0.2694501280784607, 0.2293778955936432, 0.201775923371315, 0.317092627286911]','2026-04-05 15:03:29','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (767,30,112.35,0.824,0.201,0.493,1,0.717,-52.21,0.283,'Electronic','Cluster 2','energetic','G','4/4',30,2716.79,5335.83,0.1414,2414.02,'[16.45029694174182, 12.129757507230332, 13.574747175998507, 14.090885239146957, 15.456486272670492, 15.795903355830186, 49.65376268720939]',0.095573,2.6,0.5177,0.4823,'[-157.4423370361328, 59.0897216796875, -10.761137962341309, 32.187744140625, -9.719480514526367, 17.09938621520996, 1.8488966226577759, 13.038954734802246, 3.982470989227295, 9.975820541381836, 2.073711633682251, 6.32275915145874, 2.696228504180908]','[0.5810216665267944, 0.60750812292099, 0.5920849442481995, 0.5662544965744019, 0.6154308319091797, 0.6413846611976624, 0.616187334060669, 0.6824856400489807, 0.6780519485473633, 0.6170716285705566, 0.5783922076225281, 0.5366066098213196]','2026-04-05 15:03:35','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (768,32,60.09,0.838,0.28,0.424,1,0.804,-58.33,0.196,'Electronic','Cluster 1','calm','C','4/4',30,2338.57,4998.79,0.0981,2399.07,'[27.54438589736917, 19.978921054755737, 24.0942976122478, 24.146156841805766, 23.994892649144628, 21.33170485850623, 49.10137559768532]',0.048161,3.633,0.9836,0.0164,'[-266.7823791503906, 114.87069702148438, 23.192827224731445, -29.746196746826172, -30.627727508544922, 26.4716739654541, -30.212554931640625, 2.2564938068389893, -17.970626831054688, -12.4765625, -6.365811824798584, -15.352507591247559, -0.18143831193447113]','[0.4170452356338501, 0.17708748579025269, 0.2740311622619629, 0.09333799034357071, 0.2239788919687271, 0.22711443901062012, 0.15468746423721313, 0.3163442611694336, 0.16576965153217316, 0.4053024351596832, 0.1141757071018219, 0.1964331418275833]','2026-04-05 15:03:37','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (769,31,112.35,0.821,0.183,0.213,1,0.902,-64.9,0.098,'Electronic','Cluster 1','calm','F#','4/4',30,1172.53,2377.87,0.0488,1494.31,'[22.354336722214075, 16.843478025535912, 24.65435345029047, 21.411437804131275, 22.427934853028233, 24.103808165276295, 54.96982413097605]',0.124404,4.933,0.8041,0.1959,'[-194.89620971679688, 142.08766174316406, -11.67041015625, 27.776750564575195, 8.415875434875488, 0.22444573044776917, -15.918803215026855, -6.244618892669678, -23.637779235839844, -16.31099510192871, -18.052539825439453, -10.575477600097656, -9.886528015136719]','[0.3196992874145508, 0.2535199224948883, 0.15870709717273712, 0.299234539270401, 0.22510819137096405, 0.2613258957862854, 0.7052720785140991, 0.49367427825927734, 0.31711581349372864, 0.33802586793899536, 0.5660445690155029, 0.3980415165424347]','2026-04-05 15:03:47','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (770,35,117.45,0.725,0.246,0.503,1,0.84,-65.66,0.16,'Electronic','Cluster 1','energetic','C','4/4',30,2772.4,5332.76,0.0798,2515.22,'[21.59140023336732, 22.891808596083713, 31.38145197086136, 31.37370997953353, 22.182538142772422, 21.535205670501647, 49.020642147239265]',0.056547,3.7,0.9914,0.0086,'[-352.236572265625, 57.73606872558594, 56.82722854614258, -6.987407684326172, -52.6755256652832, -4.893746852874756, -46.685340881347656, -8.978118896484375, -25.231447219848633, -14.852683067321777, -2.382296323776245, -9.081104278564453, 4.606204032897949]','[0.3517311215400696, 0.12139472365379333, 0.19583448767662048, 0.059997450560331345, 0.15997885167598724, 0.2279561460018158, 0.11724714189767838, 0.2472706139087677, 0.12536990642547607, 0.343375563621521, 0.0778290331363678, 0.08090966939926147]','2026-04-05 15:04:05','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (771,33,92.29,0.85,0.239,0.427,1,0.839,-58.19,0.161,'Electronic','Cluster 2','calm','C','4/4',30,2353.98,5312.02,0.0807,2570.43,'[15.992149226994355, 18.311918647046735, 24.214705558757466, 23.143462603119996, 19.911602321721272, 16.355225711071302, 46.03111402788268]',0.156828,5.9,0.2341,0.7659,'[-160.01153564453125, 82.46275329589844, 21.512065887451172, 0.7471680045127869, -9.585064888000488, -0.09471891075372696, -9.580475807189941, -2.216367244720459, -11.572237968444824, -1.5536783933639526, -8.768304824829102, 0.6265640258789062, -0.5768994688987732]','[0.6300707459449768, 0.3030671775341034, 0.37361687421798706, 0.18893969058990479, 0.19507606327533722, 0.27690282464027405, 0.180027574300766, 0.2695574164390564, 0.24370361864566803, 0.4117682874202728, 0.27324363589286804, 0.2910895049571991]','2026-04-05 15:04:11','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (772,36,112.35,0.773,0.179,0.69,1,0.653,-49.5,0.347,'Dance','Cluster 0','energetic','C','4/4',30,3802.65,7300.53,0.1735,2938.62,'[18.28227263253056, 14.29490801918261, 16.145562269926632, 15.342856934101125, 14.826913517386409, 14.535318787610414, 44.6557909599611]',0.156832,7.667,0.4478,0.5522,'[-76.34330749511719, 32.40485763549805, 13.599586486816406, 21.95585823059082, -6.032222747802734, 4.243138313293457, -3.4958455562591553, 7.5853095054626465, -0.2751673758029938, 3.300969362258911, -2.3368136882781982, 2.8297924995422363, -0.551568865776062]','[0.6750799417495728, 0.6143838763237, 0.6080953478813171, 0.49047189950942993, 0.5373258590698242, 0.4195995032787323, 0.40791451930999756, 0.4599479138851166, 0.46235382556915283, 0.5038087368011475, 0.46575620770454407, 0.5825895667076111]','2026-04-05 15:04:29','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (773,38,117.45,0.657,0.219,0.342,1,0.858,-66.77,0.142,'Electronic','Cluster 2','calm','C','4/4',30,1882.64,3912.38,0.071,1950.72,'[19.31318673916085, 18.304473512663634, 21.309472429439534, 20.508570540134606, 20.23171768864869, 19.87467770005538, 44.60024197374368]',0.106169,3.267,0.2882,0.7118,'[-259.2496032714844, 115.18919372558594, 48.20033645629883, 10.076486587524414, -0.44933435320854187, 1.4229696989059448, -5.363617420196533, -3.8235883712768555, -9.083014488220215, -0.652114748954773, -4.006403923034668, -3.3024051189422607, -7.933320999145508]','[0.5106341242790222, 0.3068523406982422, 0.24305467307567596, 0.23844581842422485, 0.24868661165237427, 0.3123791217803955, 0.2634906470775604, 0.3120751678943634, 0.45827510952949524, 0.33673417568206787, 0.2709812521934509, 0.31030693650245667]','2026-04-05 15:04:30','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (774,37,112.35,0.798,0.191,0.309,1,0.876,-63.42,0.124,'Electronic','Cluster 2','calm','A','4/4',30,1704.25,3612.22,0.0621,1761.88,'[16.143983127932128, 12.642613392251036, 14.403170934224661, 16.153654156199135, 20.147408496372904, 16.971256006559738, 41.2825091011999]',0.090284,3.833,0.5556,0.4444,'[-249.3046112060547, 118.12415313720703, 29.1572322845459, 11.355780601501465, 4.455151557922363, 13.427360534667969, 13.974187850952148, 8.535768508911133, -0.5622357130050659, 4.611128807067871, 6.649289131164551, 7.747580528259277, 2.2355141639709473]','[0.5889639258384705, 0.49288633465766907, 0.4897470772266388, 0.505031168460846, 0.5920229554176331, 0.5210940837860107, 0.48886042833328247, 0.5435884594917297, 0.6154492497444153, 0.7461036443710327, 0.6427518129348755, 0.5908902287483215]','2026-04-05 15:05:08','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (775,40,143.55,0.85,0.19,0.334,1,0.846,-59.63,0.154,'Electronic','Cluster 2','calm','C','4/4',30,1841.02,3447.75,0.077,1918.86,'[18.885714279358027, 12.878368361805833, 13.462420437272913, 13.557585157421041, 17.724891742513954, 15.7132257855765, 46.718642672584224]',0.211284,2.533,0.8621,0.1379,'[-109.48234558105469, 94.95707702636719, -31.701160430908203, 27.3882999420166, 25.930099487304688, 21.846858978271484, -1.455260992050171, 19.848285675048828, 15.284566879272461, 10.927695274353027, 1.1326583623886108, 7.876308917999268, 8.812941551208496]','[0.8685998320579529, 0.6449216604232788, 0.4722902774810791, 0.37390923500061035, 0.3170570135116577, 0.30577388405799866, 0.3184095025062561, 0.3897402286529541, 0.4344501197338104, 0.5074830651283264, 0.5909215211868286, 0.7950335741043091]','2026-04-05 15:05:19','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (776,39,129.2,0.752,0.257,0.27,1,0.885,-68.73,0.115,'Electronic','Cluster 1','calm','D','4/4',30,1486.79,2944.74,0.0573,1622.28,'[23.382118213662274, 20.96155082431434, 30.847015162396055, 29.460297339627154, 28.835791045829314, 25.290315280801245, 48.58845590497144]',0.099465,3.533,0.3005,0.6995,'[-307.00274658203125, 88.12306213378906, -10.555253028869629, 8.402239799499512, -3.384913444519043, -2.1838138103485107, -1.897255539894104, -3.946942090988159, -5.556814670562744, 1.9488568305969238, 2.1084446907043457, 12.85062026977539, 10.084400177001953]','[0.21029183268547058, 0.26431185007095337, 0.5670540928840637, 0.2642612159252167, 0.3853599429130554, 0.14941829442977905, 0.10864720493555069, 0.13519157469272614, 0.22600652277469635, 0.46017536520957947, 0.2332116961479187, 0.20703651010990143]','2026-04-05 15:05:19','2026-04-09 20:34:35');
INSERT INTO `AudioFeatures` VALUES (777,34,123.05,0.575,0.252,0.102,1,0.96,-73.74,0.04,'Electronic','Cluster 2','calm','A#','4/4',30,564.45,920.97,0.0201,1021.58,'[23.67545823931193, 14.836917314301731, 17.800229960059646, 14.699580115583702, 21.760341508614452, 21.05851008590807, 49.0032714527009]',0.117461,1.967,0.9576,0.0424,'[-283.7353210449219, 170.39903259277344, 31.53995132446289, 14.545334815979004, 10.365283012390137, 16.007051467895508, 10.928388595581055, -5.628076553344727, -4.682980537414551, 8.59101390838623, 3.533684492111206, -1.287199854850769, 1.0956929922103882]','[0.521050751209259, 0.5079584717750549, 0.45228561758995056, 0.41227397322654724, 0.41318222880363464, 0.5296165347099304, 0.4692016839981079, 0.4791538119316101, 0.40650674700737, 0.4733368456363678, 0.662922739982605, 0.5293145775794983]','2026-04-05 15:05:20','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (778,42,172.27,0.604,0.177,0.438,1,0.765,-60.53,0.235,'Electronic','Cluster 2','calm','E','4/4',30,2413.98,5027.39,0.1173,2309.19,'[16.1557221319467, 17.634919290833842, 20.266719134122592, 20.19174030284854, 20.385296042443542, 19.942148317952228, 46.43486208643919]',0.115793,4.733,0.6668,0.3332,'[-171.49830627441406, 75.40416717529297, 4.283688545227051, 21.175676345825195, -3.938417673110962, 6.120541095733643, -3.779733657836914, 2.7552988529205322, -4.5674333572387695, 0.5475162267684937, -5.04701566696167, 1.4085426330566406, -4.220250606536865]','[0.3692547380924225, 0.3311227262020111, 0.39772939682006836, 0.302167683839798, 0.6014439463615417, 0.36666029691696167, 0.24915821850299835, 0.30020642280578613, 0.2847345471382141, 0.30517128109931946, 0.22053262591362, 0.29506292939186096]','2026-04-05 15:05:52','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (779,44,152,0.679,0.26,0.415,1,0.791,-67.07,0.209,'Dance','Cluster 2','calm','A','4/4',30,2288,4430.66,0.1047,2178.49,'[21.621655856833133, 12.753493188273348, 15.714640283735337, 24.243221164507066, 19.727292929021615, 17.606648101941335, 43.77543417289928]',0.131757,4.033,0.2529,0.7471,'[-286.66632080078125, 38.71942138671875, 18.527908325195312, 19.841176986694336, 1.9276294708251953, 21.241323471069336, 16.509519577026367, 18.771133422851562, 5.2492995262146, 5.153302192687988, 4.007015228271484, 9.117925643920898, 3.771967649459839]','[0.5157134532928467, 0.3919721841812134, 0.523232638835907, 0.3934495449066162, 0.4416239261627197, 0.3470115661621094, 0.33438584208488464, 0.40570327639579773, 0.4796052873134613, 0.5679228901863098, 0.4720793068408966, 0.46161314845085144]','2026-04-05 15:06:03','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (780,43,152,0.581,0.173,0.276,1,0.901,-64.92,0.099,'Dance','Cluster 2','calm','A#','4/4',30,1520.3,3478.45,0.0495,1977.77,'[20.587752830075715, 14.28552717607973, 18.08158337176543, 14.384396276553344, 20.281875936608326, 18.425301343925298, 47.11972097015882]',0.101838,2.533,0.2722,0.7278,'[-240.7470703125, 121.95928955078125, 37.98905944824219, 18.72100257873535, 8.451419830322266, 15.08006477355957, 2.29850697517395, -5.420319557189941, -10.024087905883789, 3.6150128841400146, -1.5767208337783813, -2.5911104679107666, -3.30161190032959]','[0.49419692158699036, 0.5047646164894104, 0.4430842995643616, 0.3806976079940796, 0.3702503740787506, 0.5254553556442261, 0.46430784463882446, 0.4758014380931854, 0.3455214202404022, 0.4249054193496704, 0.6670570373535156, 0.5070172548294067]','2026-04-05 15:06:17','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (781,41,123.05,0.709,0.229,0.111,1,0.94,-70.1,0.06,'Electronic','Cluster 2','calm','A#','4/4',30,609.73,1061.64,0.0299,895.82,'[17.83391234279778, 13.221413259513804, 17.741302270961167, 14.082694847105515, 20.957810112022933, 21.198303057912604, 48.314309468813484]',0.091432,2.867,0.7109,0.2891,'[-272.4412841796875, 204.6283416748047, 12.907596588134766, 12.979703903198242, 10.926217079162598, 12.283960342407227, 6.128424167633057, -11.936955451965332, -15.20096206665039, 3.0426549911499023, -0.42271703481674194, -7.194949626922607, -0.6042981147766113]','[0.28205910325050354, 0.36866435408592224, 0.39649221301078796, 0.40877729654312134, 0.4186513423919678, 0.63428795337677, 0.4363144338130951, 0.4616107642650604, 0.32129207253456116, 0.39297136664390564, 0.7107682228088379, 0.3531145453453064]','2026-04-05 15:06:23','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (782,46,95.7,0.928,0.169,0.199,1,0.863,-64.95,0.137,'Electronic','Cluster 2','calm','C','4/4',30,1099.42,2375.89,0.0687,1366.18,'[15.0563490508849, 13.432992858274412, 17.581845603698007, 14.747066047704605, 16.42163635387696, 17.908454250751486, 48.41070029120076]',0.100147,4.233,0.7624,0.2376,'[-237.49085998535156, 160.451416015625, -1.541104793548584, 42.720943450927734, -0.056725092232227325, 10.997356414794922, -1.6006414890289307, 2.5700948238372803, -0.4858872592449188, 3.060793399810791, 3.8757903575897217, 4.658009052276611, 1.5896403789520264]','[0.6485422849655151, 0.48947975039482117, 0.5955979824066162, 0.450274258852005, 0.4057048261165619, 0.49986234307289124, 0.33034461736679077, 0.32214871048927307, 0.33584949374198914, 0.46725326776504517, 0.41753166913986206, 0.44607803225517273]','2026-04-05 15:06:28','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (783,45,152,0.632,0.252,0.469,1,0.722,-67.27,0.278,'Electronic','Cluster 2','energetic','A','4/4',30,2586.07,4570.36,0.1391,2162.17,'[19.248807643529105, 11.552649926996697, 13.13684903454655, 21.969798827374138, 17.081619437901573, 16.331216062515928, 43.7388921981018]',0.128824,4,0.1576,0.8424,'[-272.3420104980469, 61.48999786376953, 21.200119018554688, 11.606897354125977, 3.3056609630584717, 12.312471389770508, 7.136586666107178, 10.060386657714844, 1.9929159879684448, 5.445714473724365, 1.6913377046585083, 6.769577980041504, 2.805314302444458]','[0.5814852118492126, 0.47137758135795593, 0.5605792999267578, 0.4390503466129303, 0.45628681778907776, 0.3846088945865631, 0.34819021821022034, 0.4313164949417114, 0.5147926211357117, 0.5880630016326904, 0.5393431186676025, 0.5465788841247559]','2026-04-05 15:06:30','2026-04-10 12:33:40');
INSERT INTO `AudioFeatures` VALUES (784,47,152,0.517,0.287,0.346,1,0.886,-66.67,0.114,'Electronic','Cluster 1','calm','G','4/4',30,1906.83,4123.88,0.0571,2231.61,'[18.679345023823608, 20.30057997787148, 27.69303618192685, 22.63588597745949, 19.13242057701488, 15.237439652197748, 45.71105293143081]',0.086358,5.9,0.5596,0.4404,'[-282.92376708984375, 78.4372787475586, 42.36942672729492, 25.68995475769043, -1.2356219291687012, 2.3052494525909424, -4.264463901519775, -2.8364341259002686, -9.858209609985352, -3.923866033554077, -8.017931938171387, 2.1730828285217285, -2.044839382171631]','[0.32521435618400574, 0.19111093878746033, 0.23747171461582184, 0.2824883759021759, 0.21076101064682007, 0.1537773609161377, 0.15599791705608368, 0.3458544909954071, 0.21613828837871552, 0.30216553807258606, 0.3195885121822357, 0.22682657837867737]','2026-04-05 15:06:38','2026-04-10 12:33:40');

-- Done!
SELECT 'Database initialization complete!' as Status;
SELECT COUNT(*) as AccountCount FROM Accounts;
SELECT COUNT(*) as ProductCount FROM Products;
SELECT COUNT(*) as AudioFeaturesCount FROM AudioFeatures;
