#!/bin/bash
set -e

echo "Initializing Game Store Database..."

# SQL commands to execute
SQL_COMMANDS=$(cat <<'EOSQL'
CREATE DATABASE IF NOT EXISTS Game_Store_System;
USE Game_Store_System;

    -- DROP existing tables to ensure idempotent initialization
    SET FOREIGN_KEY_CHECKS = 0;
    DROP TABLE IF EXISTS RealTimeRecommendations, ImageGeneration, ImageCache, UserInteractions, AudioFeatures, UserRecommendations, Wishlist, Purchased_Products, Sold_Products, CustomerSummary, Payments, Order_Items, Orders, Stock, Products, Accounts;
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
        albumCoverImageUrl VARCHAR(255),
        file_url VARCHAR(255),
        preview_url VARCHAR(255)
    ) AUTO_INCREMENT = 5;

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
        Tempo FLOAT,                    -- Beats per minute
        Energy FLOAT,                   -- Energy level 0-1
        Danceability FLOAT,             -- How danceable 0-1
        Valence FLOAT,                  -- Musical positiveness 0-1
        Acousticness FLOAT,             -- Confidence of acoustic 0-1
        Instrumentalness FLOAT,         -- Predicts no vocals 0-1
        Loudness FLOAT,                 -- Overall loudness in dB
        Speechiness FLOAT,              -- Presence of spoken words 0-1
        Genre VARCHAR(100),             -- Actual genre of the song (e.g. Pop, Country, IDM, Electronic)
        GenreCluster VARCHAR(100),      -- ML cluster assignment (e.g. Cluster 0, Cluster 1)
        Mood VARCHAR(100),              -- Detected mood (happy, sad, energetic, calm)
        Key_Signature VARCHAR(10),      -- Musical key (C, D, E, etc.)
        TimeSignature VARCHAR(10),      -- Time signature (4/4, 3/4, etc.)
        Duration INT,                   -- Duration in seconds
        SpectralCentroid FLOAT,         -- Brightness of sound
        SpectralRolloff FLOAT,          -- Shape of signal
        ZeroCrossingRate FLOAT,         -- Noisiness indicator
        SpectralBandwidth FLOAT,        -- Width of spectral content
        SpectralContrast TEXT,          -- JSON array of 7 spectral contrast band means
        RmsEnergy FLOAT,               -- Raw RMS energy value
        OnsetRate FLOAT,               -- Onsets per second (rhythm complexity)
        HarmonicRatio FLOAT,           -- Harmonic to total energy ratio 0-1
        PercussiveRatio FLOAT,         -- Percussive to total energy ratio 0-1
        MfccMean TEXT,                  -- JSON array of 13 MFCC means
        ChromaMean TEXT,                -- JSON array of 12 chroma features
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
        DurationSeconds INT,            -- How long they listened/viewed
        CompletionPercentage FLOAT,     -- What % of preview they watched (0-100)
        EngagementScore FLOAT,          -- Calculated engagement score
        DeviceType VARCHAR(50),         -- mobile, desktop, tablet
        SessionID VARCHAR(255),         -- To track session-based behavior
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
    END//
    DELIMITER ;

    -- Insert Products (Games and Music Albums)
    -- Note: albumCoverImageUrl for music uses the cloud animation video from S3
    INSERT INTO `Products` VALUES (1,'Alien Acid',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Acid.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Acid.wav');
    INSERT INTO `Products` VALUES (2,'Alien Action',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Action.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Action.wav');
    INSERT INTO `Products` VALUES (3,'Alien Amen Break Beat',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav');
    INSERT INTO `Products` VALUES (4,'Alien Amp Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amp%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amp%20Up.wav');
    INSERT INTO `Products` VALUES (5,'Alien Bars',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Bars.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Bars.wav');
    INSERT INTO `Products` VALUES (6,'Alien Business',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Business.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Business.wav');
    INSERT INTO `Products` VALUES (7,'Alien Chilling',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Chilling.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Chilling.wav');
    INSERT INTO `Products` VALUES (8,'Alien Essence',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Essence.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Essence.wav');
    INSERT INTO `Products` VALUES (9,'Alien Euphoria',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Euphoria.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Euphoria.wav');
    INSERT INTO `Products` VALUES (10,'Alien Feels',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Feels.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Feels.wav');
    INSERT INTO `Products` VALUES (11,'Alien Flow State',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Flow%20State.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Flow%20State.wav');
    INSERT INTO `Products` VALUES (12,'Alien Grind',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Grind.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Grind.wav');
    INSERT INTO `Products` VALUES (13,'Alien Harmony',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Harmony.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Harmony.wav');
    INSERT INTO `Products` VALUES (14,'Alien Hyperness',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Hyperness.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Hyperness.wav');
    INSERT INTO `Products` VALUES (15,'Alien Joy',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Joy.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Joy.wav');
    INSERT INTO `Products` VALUES (16,'Alien Memories',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Memories.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Memories.wav');
    INSERT INTO `Products` VALUES (17,'Alien Mode',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Mode.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Mode.wav');
    INSERT INTO `Products` VALUES (18,'Alien Nature',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Nature.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Nature.wav');
    INSERT INTO `Products` VALUES (19,'Alien Project Meeting',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Project%20Meeting.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Project%20Meeting.wav');
    INSERT INTO `Products` VALUES (20,'Alien Ragebait',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Ragebait.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Ragebait.wav');
    INSERT INTO `Products` VALUES (21,'Alien Realm',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Realm.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Realm.wav');
    INSERT INTO `Products` VALUES (22,'Alien Sense',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Sense.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Sense.wav');
    INSERT INTO `Products` VALUES (23,'Alien Singing',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Singing.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Singing.wav');
    INSERT INTO `Products` VALUES (24,'Alien Soul',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Soul.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Soul.wav');
    INSERT INTO `Products` VALUES (25,'Alien Translation',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Translation.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Translation.wav');
    INSERT INTO `Products` VALUES (26,'Alien Turn Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Turn%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Turn%20Up.wav');
    INSERT INTO `Products` VALUES (27,'Alien Upgrade',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Upgrade.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Upgrade.wav');
    INSERT INTO `Products` VALUES (28,'Alien Utopia',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Utopia.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Utopia.wav');
    INSERT INTO `Products` VALUES (29,'Alien Wonder',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Wonder.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Wonder.wav');
    INSERT INTO `Products` VALUES (30,'Breakcore Bear Hug',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav');
    INSERT INTO `Products` VALUES (31,'Drunk House',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav');
    INSERT INTO `Products` VALUES (32,'Extraterrestrial Rave',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial%20Rave.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial%20Rave.wav');
    INSERT INTO `Products` VALUES (33,'Green Bear',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20Bear.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20Bear.wav');
    INSERT INTO `Products` VALUES (34,'Green God',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20God.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green%20God.wav');
    INSERT INTO `Products` VALUES (35,'Intergalactic Rave',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic%20Rave.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic%20Rave.wav');
    INSERT INTO `Products` VALUES (36,'Soft Chaos',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav');
    INSERT INTO `Products` VALUES (37,'Ted Chilling',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav');
    INSERT INTO `Products` VALUES (38,'Teddy Emotion',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy%20Emotion.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy%20Emotion.wav');
    INSERT INTO `Products` VALUES (39,'Ted’s Awakening',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav');
    INSERT INTO `Products` VALUES (40,'Ted’s Beautiful Anger',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav');
    INSERT INTO `Products` VALUES (41,'Ted’s Chillness',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav');
    INSERT INTO `Products` VALUES (42,'Ted’s Deepness',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav');
    INSERT INTO `Products` VALUES (43,'Music Recommendation Store',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Music%20Recommendation%20Store.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Music%20Recommendation%20Store.wav');
    INSERT INTO `Products` VALUES (44,'Ted’s Energy',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav');
    INSERT INTO `Products` VALUES (45,'Ted’s Green Machine',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav');
    INSERT INTO `Products` VALUES (46,'Ted’s Rush Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav');
    INSERT INTO `Products` VALUES (47,'Ted’s Utopia',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav');

    -- Grant privileges to application user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO '${MYSQL_USER}'@'%';
    FLUSH PRIVILEGES;
EOSQL
)

# Resolve script-relative paths so this script works from any cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_AF_SQL_PATH="${SCRIPT_DIR}/../scripts/database/audio_features_insert.sql"
ORDER_TRIGGER_SQL_PATH="${SCRIPT_DIR}/add_order_triggers.sql"
ORDER_BACKFILL_SQL_PATH="${SCRIPT_DIR}/backfill_order_tracking.sql"

run_mysql_pipe() {
    local sql="$1"
    echo "$sql" | mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
        || echo "$sql" | mysql --protocol=TCP --host=db -u root -p"${MYSQL_ROOT_PASSWORD}"
}

run_mysql_query() {
    local query="$1"
    mysql -Nse "$query" -u root -p"${MYSQL_ROOT_PASSWORD}" \
        || mysql --protocol=TCP --host=db -Nse "$query" -u root -p"${MYSQL_ROOT_PASSWORD}"
}

run_mysql_file() {
    local file_path="$1"
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" Game_Store_System < "$file_path" \
        || mysql --protocol=TCP --host=db -u root -p"${MYSQL_ROOT_PASSWORD}" Game_Store_System < "$file_path"
}

# Run the main initialization payload
run_mysql_pipe "$SQL_COMMANDS"

# Re-apply order tracking trigger/backfill explicitly so derived purchase tables
# are present even if trigger creation was skipped in an older initialization.
if [ -f "$ORDER_TRIGGER_SQL_PATH" ]; then
    run_mysql_file "$ORDER_TRIGGER_SQL_PATH"
fi

if [ -f "$ORDER_BACKFILL_SQL_PATH" ]; then
    run_mysql_file "$ORDER_BACKFILL_SQL_PATH"
fi

# Safety net: if positive ProductID AudioFeatures are missing, backfill them from the standalone seed file.
LIB_AF_COUNT=$(run_mysql_query "USE Game_Store_System; SELECT COUNT(*) FROM AudioFeatures WHERE ProductID > 0;")
if [ -z "$LIB_AF_COUNT" ]; then
    echo "ERROR: Unable to verify AudioFeatures seed count."
    exit 1
fi

if [ "$LIB_AF_COUNT" -lt 47 ]; then
    if [ ! -f "$LIB_AF_SQL_PATH" ]; then
        echo "ERROR: Missing fallback seed file: $LIB_AF_SQL_PATH"
        exit 1
    fi

    echo "Library AudioFeatures missing ($LIB_AF_COUNT found). Backfilling from $LIB_AF_SQL_PATH"
    run_mysql_file "$LIB_AF_SQL_PATH"
fi

echo "Database initialization complete!"
