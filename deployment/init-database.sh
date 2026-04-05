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
        FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
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
    

    -- Insert Accounts (Managers, Employees, Customers)
    INSERT INTO `Accounts` VALUES (1,'uid_john','John Smith','5551234567','john.smith@store.com','$2a$12$o1bIeFKxF1n9qHMZ7jmfuePFvy151/ELJxASYZTvg8sJiiyLqqBvi','Manager');
    INSERT INTO `Accounts` VALUES (2,'uid_sarah','Sarah Johnson','5552345678','sarah.j@store.com','$2a$12$o1bIeFKxF1n9qHMZ7jmfuePFvy151/ELJxASYZTvg8sJiiyLqqBvi','Employee');
    INSERT INTO `Accounts` VALUES (3,'uid_alice','Alice Brown','5554567890','alice.b@gmail.com','$2a$12$o1bIeFKxF1n9qHMZ7jmfuePFvy151/ELJxASYZTvg8sJiiyLqqBvi','Customer');
    INSERT INTO `Accounts` VALUES (4,'AHxuyzhNGddZ3bCJOHTqpULp1My2','Ryan Curley','','ryancurley21@gmail.com','$2a$10$oNOiwEPwyln7JChoi3ctc.uBx.8MyI5IFmyZBQ0AcGEmTqYFJwDyS','Customer');

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
    INSERT INTO `Products` VALUES (43,'Ted’s Dream',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav');
    INSERT INTO `Products` VALUES (44,'Ted’s Energy',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav');
    INSERT INTO `Products` VALUES (45,'Ted’s Green Machine',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav');
    INSERT INTO `Products` VALUES (46,'Ted’s Rush Up',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav');
    INSERT INTO `Products` VALUES (47,'Ted’s Utopia',0.50,'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav','https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav');


    -- Insert AudioFeatures for music products (extracted from S3 WAV files)
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (315,1,117.45,0.488,0.23,0.312,1,0.874,-69.04,0.126,'Cluster 0','calm','C','4/4',30,1722.19,3584.83,0.0632,'[-291.7796630859375, 111.64028930664062, 48.19269943237305, 14.828948974609375, 1.358401894569397, 8.407593727111816, 4.571701526641846, 9.025636672973633, 3.417975902557373, 6.400054931640625, 1.8948384523391724, 1.1143864393234253, -1.3582206964492798]','[0.8696905970573425, 0.5900625586509705, 0.4457494914531708, 0.4092062711715698, 0.42403706908226013, 0.3584103584289551, 0.3536975383758545, 0.47110459208488464, 0.42281708121299744, 0.40945959091186523, 0.45202991366386414, 0.5952064394950867]','2026-02-15 00:34:49','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (316,4,136,0.714,0.19,0.459,1,0.672,-58.5,0.328,'Cluster 0','energetic','A#','4/4',30,2529.68,5621.21,0.1638,'[-173.56605529785156, 98.32673645019531, 20.514408111572266, 18.889841079711914, 14.777070045471191, 6.647645473480225, 5.771152496337891, 10.658246040344238, 0.14356110990047455, 5.037039756774902, -0.35658639669418335, 9.898202896118164, -3.9117817878723145]','[0.5842545628547668, 0.5410036444664001, 0.5196573734283447, 0.503713071346283, 0.5226868391036987, 0.6135708093643188, 0.5325860381126404, 0.4706481397151947, 0.4980233609676361, 0.5585569143295288, 0.6801507472991943, 0.5890701413154602]','2026-02-15 00:34:56','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (317,2,80.75,1,0.271,0.204,1,0.928,-56.39,0.072,'Cluster 0','calm','G','4/4',30,1121.95,2261.08,0.0359,'[-160.5883331298828, 154.20309448242188, 6.3192338943481445, 39.80005645751953, 11.498737335205078, 10.888457298278809, 3.7194249629974365, 7.480372905731201, 1.5592849254608154, 9.576579093933105, 3.297532558441162, 2.85922908782959, -2.3978917598724365]','[0.4899482727050781, 0.4097427427768707, 0.37036189436912537, 0.36979860067367554, 0.4186936020851135, 0.47673436999320984, 0.4084568917751312, 0.534656822681427, 0.47800248861312866, 0.4820568859577179, 0.5121039748191833, 0.5257129669189453]','2026-02-15 00:34:58','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (318,5,80.75,0.512,0.261,0.416,1,0.802,-64.71,0.198,'Cluster 0','calm','F','4/4',30,2291.16,4872.53,0.099,'[-224.2651824951172, 85.18619537353516, 1.8011455535888672, 36.73760223388672, 8.387450218200684, 18.134429931640625, 6.105869293212891, 6.560997486114502, 4.75814962387085, 7.528581619262695, 3.2510826587677, 5.749767780303955, 3.087707042694092]','[0.3869478404521942, 0.34176206588745117, 0.3896002173423767, 0.43647465109825134, 0.5009134411811829, 0.6020864844322205, 0.44727790355682373, 0.42112448811531067, 0.5123448967933655, 0.45260417461395264, 0.453020304441452, 0.33988597989082336]','2026-02-15 00:35:06','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (319,3,0,0.744,0.189,0.078,1,0.927,-77.18,0.073,'Cluster 1','calm','F#','4/4',30,427.85,544.56,0.0367,'[-498.8492736816406, 157.57118225097656, 76.0373306274414, 8.46163558959961, -19.200679779052734, -23.63567352294922, -28.274227142333984, -36.56103515625, -39.56654739379883, -33.278038024902344, -22.332683563232422, -14.160150527954102, -12.939478874206543]','[0.2521918714046478, 0.19001205265522003, 0.07258238643407822, 0.21958176791667938, 0.05029676482081413, 0.12331210821866989, 0.6893225908279419, 0.47778546810150146, 0.12202895432710648, 0.1776474118232727, 0.5485556721687317, 0.19877539575099945]','2026-02-15 00:35:10','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (320,8,161.5,0.758,0.183,0.418,1,0.81,-65.08,0.19,'Cluster 0','calm','G','4/4',30,2303.12,4652.55,0.0952,'[-274.0487976074219, 84.15977478027344, 28.312742233276367, -10.254232406616211, -23.26548957824707, -15.990490913391113, -13.9362211227417, 0.6028299927711487, 0.28409144282341003, 7.250712871551514, 1.9116778373718262, 3.5035452842712402, 4.716301918029785]','[0.3145711421966553, 0.21121150255203247, 0.28714972734451294, 0.21425139904022217, 0.3558451235294342, 0.35404306650161743, 0.2764364778995514, 0.553981602191925, 0.33949169516563416, 0.3881781995296478, 0.35758474469184875, 0.48471757769584656]','2026-02-15 00:35:25','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (321,6,152,1,0.167,0.154,1,0.889,-66.97,0.111,'Cluster 1','calm','A','4/4',30,847.88,1581.54,0.0555,'[-272.8619689941406, 163.66107177734375, -8.853872299194336, 11.022200584411621, -11.258843421936035, -0.6838850378990173, -1.32103431224823, 6.201972007751465, 6.1769118309021, 5.139103889465332, -2.2383921146392822, 0.010298997163772583, 1.5301883220672607]','[0.1770537793636322, 0.23311617970466614, 0.10511849820613861, 0.14160595834255219, 0.43663322925567627, 0.20520831644535065, 0.07497717440128326, 0.0690610408782959, 0.23357799649238586, 0.5501435399055481, 0.330685555934906, 0.32476523518562317]','2026-02-15 00:35:26','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (322,7,92.29,0.841,0.276,0.39,1,0.863,-59.6,0.137,'Cluster 0','calm','B','4/4',30,2148.9,5034.32,0.0687,'[-192.7371368408203, 90.75020599365234, 36.50471496582031, 31.312911987304688, 7.3049397468566895, 19.672863006591797, 6.182407855987549, 6.147857666015625, -3.6068320274353027, 4.0100483894348145, 0.14933550357818604, 11.057010650634766, 2.7568647861480713]','[0.5351702570915222, 0.46278509497642517, 0.49196040630340576, 0.4662717878818512, 0.5080235600471497, 0.430172324180603, 0.446509450674057, 0.49664023518562317, 0.48366987705230713, 0.5673215985298157, 0.5497402548789978, 0.6479500532150269]','2026-02-15 00:35:46','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (323,10,112.35,0.889,0.205,0.273,1,0.887,-65.53,0.113,'Cluster 1','calm','C','4/4',30,1502.17,3165.63,0.0565,'[-262.2541809082031, 127.989990234375, 36.87516784667969, 18.66297149658203, 1.878906488418579, 1.5694676637649536, -1.4080365896224976, -10.532339096069336, -12.458942413330078, -0.9789358973503113, -0.3932969272136688, 4.824808597564697, 8.377914428710938]','[0.6288644671440125, 0.2211882472038269, 0.12872323393821716, 0.2408715784549713, 0.3778626322746277, 0.1641283482313156, 0.1252022087574005, 0.1214347556233406, 0.15362416207790375, 0.3075670599937439, 0.22155889868736267, 0.24811126291751862]','2026-02-15 00:35:57','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (324,11,129.2,0.634,0.177,0.571,1,0.784,-57.63,0.216,'Cluster 0','energetic','A#','4/4',30,3146.82,6556.56,0.108,'[-173.13739013671875, 34.45747756958008, 28.51560401916504, 34.05730056762695, 11.609046936035156, 21.3087158203125, 12.639996528625488, 12.151270866394043, -0.04745180904865265, 9.126513481140137, 1.7712595462799072, 7.550595283508301, 0.26206251978874207]','[0.5958718657493591, 0.6071215867996216, 0.5532501339912415, 0.5172088146209717, 0.5691878795623779, 0.6215564012527466, 0.6377958059310913, 0.6667459607124329, 0.714123010635376, 0.7796725630760193, 0.78364098072052, 0.6435062885284424]','2026-02-15 00:36:03','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (325,9,136,0.342,0.253,0.251,1,0.938,-70.85,0.062,'Cluster 0','sad','A','4/4',30,1385.08,3130.71,0.0311,'[-228.78443908691406, 116.61597442626953, 2.2653286457061768, 24.30242156982422, 8.909819602966309, 12.791056632995605, 5.938939094543457, 8.34558391571045, 3.813663959503174, 5.994678020477295, 3.8269357681274414, 5.087463855743408, 3.3250732421875]','[0.4378887414932251, 0.3786922097206116, 0.34861528873443604, 0.3111705482006073, 0.43505772948265076, 0.2890700697898865, 0.3047960698604584, 0.49127283692359924, 0.5314127206802368, 0.652132511138916, 0.49258777499198914, 0.4344289302825928]','2026-02-15 00:36:06','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (326,15,129.2,0.759,0.198,0.22,1,0.928,-69.34,0.072,'Cluster 0','calm','C','4/4',30,1214.5,2459.02,0.0362,'[-321.4566955566406, 83.47396087646484, 10.06994342803955, 17.939945220947266, -3.6801888942718506, 8.457157135009766, -0.46799659729003906, -1.7294793128967285, -3.538048028945923, -2.9204957485198975, -5.3191914558410645, -1.986415982246399, -3.8233866691589355]','[0.6574205160140991, 0.43358665704727173, 0.46574410796165466, 0.31679871678352356, 0.3043428361415863, 0.27727144956588745, 0.3064235746860504, 0.5015268921852112, 0.35467928647994995, 0.3682245910167694, 0.33953672647476196, 0.46972858905792236]','2026-02-15 00:36:23','2026-02-19 18:00:27');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (327,12,112.35,0.47,0.257,0.364,1,0.736,-59.99,0.264,'Cluster 0','calm','G#','4/4',30,2004.54,3494.78,0.1319,'[-142.93064880371094, 120.18232727050781, -58.5262451171875, 30.326322555541992, 0.7238057255744934, -12.0706205368042, -0.5284595489501953, -14.991065979003906, -4.75360631942749, 6.931060314178467, -4.71026611328125, -1.4554390907287598, -0.5561707019805908]','[0.3904719948768616, 0.3156321346759796, 0.2801608741283417, 0.2788582146167755, 0.27005165815353394, 0.33840078115463257, 0.6471386551856995, 0.6640409231185913, 0.7899214029312134, 0.7332117557525635, 0.5300519466400146, 0.4873392581939697]','2026-02-15 00:36:24','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (328,13,92.29,0.679,0.241,0.346,1,0.86,-57.42,0.14,'Cluster 0','calm','A#','4/4',30,1908.07,4277.34,0.0701,'[-138.92984008789062, 125.23304748535156, 24.38108253479004, 13.790332794189453, -6.302807807922363, 0.11525818705558777, -4.6467509269714355, 3.3020846843719482, -2.9362921714782715, 2.1210250854492188, -1.0549159049987793, 3.6283419132232666, -2.4360551834106445]','[0.2548246383666992, 0.3047349750995636, 0.4560638666152954, 0.5467240214347839, 0.3741835355758667, 0.473758339881897, 0.3302142322063446, 0.3891015648841858, 0.2891090214252472, 0.3596285879611969, 0.6662790179252625, 0.3345089256763458]','2026-02-15 00:36:36','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (329,14,86.13,0.572,0.209,0.532,1,0.639,-58.19,0.361,'Cluster 0','energetic','C','4/4',30,2931.59,6334.57,0.1807,'[-190.9525146484375, 67.5693359375, 15.864490509033203, 28.39185905456543, -0.8594547510147095, 11.9025297164917, 3.507998466491699, 9.268799781799316, 1.7546396255493164, 3.0277485847473145, 2.8171937465667725, 2.902913808822632, -0.6429049372673035]','[0.6105231642723083, 0.6057002544403076, 0.6062937378883362, 0.5997845530509949, 0.6053523421287537, 0.5604987144470215, 0.5152921676635742, 0.545059084892273, 0.5126366019248962, 0.517414927482605, 0.5654284954071045, 0.6069908738136292]','2026-02-15 00:36:42','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (330,17,129.2,0.701,0.183,0.334,1,0.839,-62.74,0.161,'Cluster 0','calm','E','4/4',30,1842.72,3721.17,0.0805,'[-229.52503967285156, 85.82749938964844, 1.8272905349731445, 40.14368438720703, 18.076255798339844, 16.764080047607422, 3.114091634750366, 18.76078987121582, 11.630099296569824, 9.36582088470459, 7.079768180847168, 13.588312149047852, 3.4006845951080322]','[0.3982434868812561, 0.4371739327907562, 0.5721983313560486, 0.5522677302360535, 0.6101207733154297, 0.5873250365257263, 0.5112078189849854, 0.5765304565429688, 0.5394662022590637, 0.45233485102653503, 0.40852734446525574, 0.37387603521347046]','2026-02-15 00:36:48','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (331,16,161.5,0.958,0.086,0.078,1,0.931,-76.58,0.069,'Cluster 1','calm','F','4/4',30,429.12,532.33,0.0343,'[-467.0399475097656, 164.8089141845703, 49.701759338378906, -11.538522720336914, -23.373971939086914, -23.43776512145996, -28.623035430908203, -33.32231521606445, -31.916704177856445, -29.92522430419922, -29.254806518554688, -27.15540885925293, -21.705883026123047]','[0.3011217415332794, 0.13237810134887695, 0.19154198467731476, 0.15453779697418213, 0.43265676498413086, 0.44874078035354614, 0.18801581859588623, 0.4219789206981659, 0.18528275191783905, 0.3935926556587219, 0.08183499425649643, 0.09568076580762863]','2026-02-15 00:36:51','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (332,18,129.2,0.873,0.289,0.281,1,0.89,-63.1,0.11,'Cluster 1','calm','G','4/4',30,1547.24,3208.03,0.0548,'[-181.6957550048828, 115.22474670410156, -6.62003231048584, 17.245302200317383, -6.895037651062012, -1.3102341890335083, -7.087146282196045, -2.2928566932678223, -9.346034049987793, 0.5336926579475403, -7.27768087387085, -2.950411081314087, -11.221529960632324]','[0.24072995781898499, 0.17559874057769775, 0.2712497413158417, 0.24079744517803192, 0.5082387924194336, 0.22934827208518982, 0.22546249628067017, 0.5189749002456665, 0.2869715392589569, 0.38268882036209106, 0.25323450565338135, 0.44413262605667114]','2026-02-15 00:37:04','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (333,21,73.83,0.696,0.144,0.262,1,0.82,-66.38,0.18,'Cluster 1','calm','D','4/4',30,1443.37,2549.16,0.0899,'[-242.52249145507812, 148.96246337890625, -2.1132805347442627, 7.093379020690918, -2.0650949478149414, -0.08707836270332336, -1.4206916093826294, -2.2283856868743896, -2.055642604827881, 10.666793823242188, 8.658056259155273, 11.549274444580078, 3.4565629959106445]','[0.4983883202075958, 0.3290005028247833, 0.5850901007652283, 0.3079705536365509, 0.4576011300086975, 0.24514640867710114, 0.1975816786289215, 0.3412894010543823, 0.20811687409877777, 0.18828809261322021, 0.19417555630207062, 0.2652498781681061]','2026-02-15 00:37:26','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (334,23,92.29,0.679,0.241,0.346,1,0.86,-57.42,0.14,'Cluster 0','calm','A#','4/4',30,1907.88,4277.46,0.0701,'[-138.93121337890625, 125.22777557373047, 24.388532638549805, 13.802616119384766, -6.308520317077637, 0.11406280100345612, -4.661259651184082, 3.323747396469116, -2.951113700866699, 2.109877109527588, -1.0496327877044678, 3.645723342895508, -2.4496374130249023]','[0.25486302375793457, 0.3046948313713074, 0.45605507493019104, 0.5465919375419617, 0.3741709589958191, 0.47376933693885803, 0.3303375542163849, 0.3891395330429077, 0.28909602761268616, 0.359598308801651, 0.6662948131561279, 0.33458366990089417]','2026-02-15 00:37:31','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (335,22,161.5,0.62,0.205,0.379,1,0.706,-58.08,0.294,'Cluster 0','calm','E','4/4',30,2091.32,4488.33,0.147,'[-166.0731964111328, 90.38202667236328, 1.6462249755859375, 43.3494873046875, 2.2906694412231445, 10.640787124633789, -1.549059271812439, 2.4666128158569336, -4.333460330963135, 1.5795912742614746, -0.09253109246492386, 4.702509880065918, -2.613163709640503]','[0.5412710905075073, 0.5273582339286804, 0.5739275813102722, 0.5751316547393799, 0.5975916981697083, 0.544954776763916, 0.48581168055534363, 0.4144611060619354, 0.469478964805603, 0.5752703547477722, 0.5607941150665283, 0.5502389073371887]','2026-02-15 00:37:36','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (336,24,103.36,0.418,0.174,0.361,1,0.835,-65.95,0.165,'Cluster 0','sad','C#','4/4',30,1989.41,4071.02,0.0824,'[-225.74314880371094, 98.8675537109375, 18.74367332458496, 10.258078575134277, 0.6093793511390686, 1.7460776567459106, -6.825586795806885, -1.9590463638305664, -4.9704060554504395, -0.5223786234855652, -0.7313710451126099, 1.604599118232727, -3.6765477657318115]','[0.43157482147216797, 0.48110857605934143, 0.4554288983345032, 0.43230190873146057, 0.40751558542251587, 0.4146325886249542, 0.40717610716819763, 0.4492172300815582, 0.4064130187034607, 0.4685404300689697, 0.43919387459754944, 0.3827185034751892]','2026-02-15 00:38:01','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (337,25,161.5,0.707,0.173,0.406,1,0.834,-58.97,0.166,'Cluster 0','calm','A','4/4',30,2235.88,4691.57,0.083,'[-227.58119201660156, 88.05905151367188, 20.057432174682617, 26.69036102294922, 5.110052585601807, 5.8636088371276855, -0.7672247886657715, 3.899847984313965, -6.461248874664307, -1.075980305671692, -4.444858074188232, -1.059238076210022, -6.027135372161865]','[0.49975284934043884, 0.46023795008659363, 0.5243709087371826, 0.4820462167263031, 0.43907955288887024, 0.46005362272262573, 0.44444161653518677, 0.5025918483734131, 0.47112342715263367, 0.5443638563156128, 0.4926835298538208, 0.43022841215133667]','2026-02-15 00:38:03','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (338,26,92.29,0.772,0.122,0.258,1,0.93,-65.31,0.07,'Cluster 0','calm','G','4/4',30,1421.32,3156.86,0.0352,'[-271.5086669921875, 109.86163330078125, 9.930145263671875, 39.70039749145508, 14.661646842956543, 23.213451385498047, 8.918110847473145, 11.354644775390625, -1.013602375984192, 2.0665488243103027, 0.10183574259281158, 2.1761035919189453, 1.3367999792099]','[0.2500383257865906, 0.2767792344093323, 0.3448827266693115, 0.3383305072784424, 0.36670053005218506, 0.45093750953674316, 0.7205297350883484, 0.8620312809944153, 0.7329985499382019, 0.5163260698318481, 0.3295186161994934, 0.2559756934642792]','2026-02-15 00:38:14','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (339,27,161.5,0.668,0.238,0.484,1,0.78,-61.09,0.22,'Cluster 1','energetic','F','4/4',30,2667.46,5212.79,0.1099,'[-238.71932983398438, 100.74251556396484, 30.2479190826416, -10.55079174041748, 5.928128719329834, 8.20437240600586, -18.049846649169922, -5.444216251373291, -16.08165168762207, -9.924089431762695, -16.338537216186523, -6.122375011444092, -3.8855621814727783]','[0.3255111575126648, 0.1552526205778122, 0.23430858552455902, 0.11970798671245575, 0.31193551421165466, 0.7382984161376953, 0.2856314480304718, 0.17444707453250885, 0.09705385565757751, 0.09752320498228073, 0.31410452723503113, 0.17640192806720734]','2026-02-15 00:38:29','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (340,19,234.91,0.851,0.167,0.272,1,0.901,-64.98,0.099,'Cluster 0','calm','E','4/4',30,1501.55,3128.68,0.0496,'[-225.29017639160156, 103.07921600341797, -12.360396385192871, 48.59523010253906, 5.550570487976074, 10.617122650146484, 10.418973922729492, 1.0992306470870972, -2.411526679992676, 5.0084004402160645, 0.6325653195381165, 3.7127044200897217, -1.4993101358413696]','[0.34424859285354614, 0.3155418336391449, 0.383274644613266, 0.3899000287055969, 0.4662596583366394, 0.42539793252944946, 0.3781391978263855, 0.4422891438007355, 0.36465439200401306, 0.37306544184684753, 0.38901185989379883, 0.4251267611980438]','2026-02-15 00:38:29','2026-02-19 18:02:32');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (341,28,172.27,0.561,0.262,0.336,1,0.874,-64.91,0.126,'Cluster 1','calm','A#','4/4',30,1849.5,3946.58,0.0629,'[-235.661376953125, 104.2260513305664, -1.7475305795669556, 16.74005126953125, -3.086660623550415, 1.3579885959625244, -14.800631523132324, -8.322338104248047, -12.923497200012207, -13.343825340270996, -11.013126373291016, -12.749248504638672, -11.544974327087402]','[0.3338605463504791, 0.227630615234375, 0.28221920132637024, 0.3234154284000397, 0.19356444478034973, 0.3703901469707489, 0.23077118396759033, 0.32044050097465515, 0.1785365343093872, 0.19921952486038208, 0.4599723815917969, 0.2788541316986084]','2026-02-15 00:38:36','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (342,32,60.09,0.838,0.28,0.424,1,0.804,-58.33,0.196,'Cluster 1','calm','C','4/4',30,2338.57,4998.79,0.0981,'[-266.7823791503906, 114.87069702148438, 23.192827224731445, -29.746196746826172, -30.627723693847656, 26.4716739654541, -30.212554931640625, 2.2564940452575684, -17.970626831054688, -12.4765625, -6.365811824798584, -15.352507591247559, -0.18143819272518158]','[0.4170452356338501, 0.17708748579025269, 0.2740311622619629, 0.09333799034357071, 0.2239788919687271, 0.22711443901062012, 0.15468746423721313, 0.3163442611694336, 0.16576965153217316, 0.4053024351596832, 0.1141757071018219, 0.1964331418275833]','2026-02-15 00:38:55','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (343,29,95.7,0.765,0.19,0.25,1,0.87,-63.82,0.13,'Cluster 1','calm','C','4/4',30,1378.91,2547.81,0.0648,'[-267.4826965332031, 140.6433563232422, 17.76319694519043, 19.929378509521484, 5.183872699737549, 0.5665738582611084, -2.9422569274902344, -0.6028041839599609, -7.536318778991699, -4.591829299926758, -8.156452178955078, -3.0622808933258057, -1.9345676898956299]','[0.47165748476982117, 0.3342323899269104, 0.4507347643375397, 0.31773650646209717, 0.409074991941452, 0.3314514756202698, 0.3101437985897064, 0.41882559657096863, 0.2694501280784607, 0.2293778955936432, 0.201775923371315, 0.317092627286911]','2026-02-15 00:39:00','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (344,31,112.35,0.821,0.183,0.213,1,0.902,-64.9,0.098,'Cluster 1','calm','F#','4/4',30,1172.53,2377.87,0.0488,'[-194.89620971679688, 142.08766174316406, -11.67041015625, 27.776750564575195, 8.415875434875488, 0.2244461178779602, -15.918803215026855, -6.244618892669678, -23.637779235839844, -16.31099510192871, -18.052541732788086, -10.575477600097656, -9.886528015136719]','[0.3196992874145508, 0.2535199224948883, 0.15870709717273712, 0.299234539270401, 0.22510819137096405, 0.2613258957862854, 0.7052720785140991, 0.49367427825927734, 0.31711581349372864, 0.33802586793899536, 0.5660445690155029, 0.3980415165424347]','2026-02-15 00:39:16','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (345,33,92.29,0.85,0.239,0.427,1,0.839,-58.19,0.161,'Cluster 1','calm','C','4/4',30,2353.98,5312.02,0.0807,'[-160.01153564453125, 82.46275329589844, 21.512065887451172, 0.7471678256988525, -9.585063934326172, -0.09471891075372696, -9.580475807189941, -2.216367244720459, -11.572237968444824, -1.5536783933639526, -8.768304824829102, 0.6265640258789062, -0.5768996477127075]','[0.6300707459449768, 0.3030671775341034, 0.37361687421798706, 0.18893969058990479, 0.19507606327533722, 0.27690282464027405, 0.180027574300766, 0.2695574164390564, 0.24370361864566803, 0.4117682874202728, 0.27324363589286804, 0.2910895049571991]','2026-02-15 00:39:19','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (346,30,112.35,0.824,0.201,0.493,1,0.717,-52.21,0.283,'Cluster 0','energetic','G','4/4',30,2716.79,5335.83,0.1414,'[-157.4423370361328, 59.0897216796875, -10.761137962341309, 32.187744140625, -9.719478607177734, 17.09938621520996, 1.8488963842391968, 13.038954734802246, 3.982470989227295, 9.975820541381836, 2.073711633682251, 6.32275915145874, 2.696228504180908]','[0.5810216665267944, 0.60750812292099, 0.5920849442481995, 0.5662544965744019, 0.6154308319091797, 0.6413846611976624, 0.616187334060669, 0.6824856400489807, 0.6780519485473633, 0.6170716285705566, 0.5783922076225281, 0.5366066098213196]','2026-02-15 00:39:21','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (347,36,112.35,0.773,0.179,0.69,1,0.653,-49.5,0.347,'Cluster 2','energetic','C','4/4',30,3802.65,7300.53,0.1735,'[-76.34330749511719, 32.40485763549805, 13.599586486816406, 21.95585823059082, -6.032223224639893, 4.243138313293457, -3.4958457946777344, 7.585309982299805, -0.2751673758029938, 3.300969362258911, -2.3368139266967773, 2.8297924995422363, -0.551568865776062]','[0.6750799417495728, 0.6143838763237, 0.6080953478813171, 0.49047189950942993, 0.5373258590698242, 0.4195995032787323, 0.40791451930999756, 0.4599479138851166, 0.46235382556915283, 0.5038087368011475, 0.46575620770454407, 0.5825895667076111]','2026-02-15 00:39:53','2026-02-19 18:04:07');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (348,37,112.35,0.798,0.191,0.309,1,0.876,-63.42,0.124,'Cluster 0','calm','A','4/4',30,1704.25,3612.22,0.0621,'[-249.3046112060547, 118.12415313720703, 29.1572322845459, 11.355780601501465, 4.455151557922363, 13.427360534667969, 13.974187850952148, 8.535768508911133, -0.5622357130050659, 4.611128807067871, 6.649290084838867, 7.747580528259277, 2.2355141639709473]','[0.5889639258384705, 0.49288633465766907, 0.4897470772266388, 0.505031168460846, 0.5920229554176331, 0.5210940837860107, 0.48886042833328247, 0.5435884594917297, 0.6154492497444153, 0.7461036443710327, 0.6427518129348755, 0.5908902287483215]','2026-02-15 00:39:58','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (349,34,123.05,0.575,0.252,0.102,1,0.96,-73.74,0.04,'Cluster 0','calm','A#','4/4',30,564.45,920.97,0.0201,'[-283.7353210449219, 170.39903259277344, 31.53995132446289, 14.545334815979004, 10.365283012390137, 16.007051467895508, 10.928388595581055, -5.628076553344727, -4.682980537414551, 8.59101390838623, 3.533684492111206, -1.287199854850769, 1.0956929922103882]','[0.521050751209259, 0.5079584717750549, 0.45228561758995056, 0.41227397322654724, 0.41318222880363464, 0.5296165347099304, 0.4692016839981079, 0.4791538119316101, 0.40650674700737, 0.4733368456363678, 0.662922739982605, 0.5293145775794983]','2026-02-15 00:39:58','2026-02-19 18:04:22');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (350,35,117.45,0.725,0.246,0.503,1,0.84,-65.66,0.16,'Cluster 1','energetic','C','4/4',30,2772.4,5332.76,0.0798,'[-352.236572265625, 57.73606872558594, 56.82722854614258, -6.987407684326172, -52.6755256652832, -4.893746852874756, -46.685340881347656, -8.978119850158691, -25.231447219848633, -14.852683067321777, -2.382296323776245, -9.081103324890137, 4.606204032897949]','[0.3517311215400696, 0.12139472365379333, 0.19583448767662048, 0.059997450560331345, 0.15997885167598724, 0.2279561460018158, 0.11724714189767838, 0.2472706139087677, 0.12536990642547607, 0.343375563621521, 0.0778290331363678, 0.08090966939926147]','2026-02-15 00:40:01','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (351,38,117.45,0.657,0.219,0.342,1,0.858,-66.77,0.142,'Cluster 1','calm','C','4/4',30,1882.64,3912.38,0.071,'[-259.2496032714844, 115.18919372558594, 48.20033645629883, 10.076486587524414, -0.44933435320854187, 1.4229696989059448, -5.363617420196533, -3.8235888481140137, -9.083013534545898, -0.652114748954773, -4.006403923034668, -3.302405595779419, -7.933320999145508]','[0.5106341242790222, 0.3068523406982422, 0.24305467307567596, 0.23844581842422485, 0.24868661165237427, 0.3123791217803955, 0.2634906470775604, 0.3120751678943634, 0.45827510952949524, 0.33673417568206787, 0.2709812521934509, 0.31030693650245667]','2026-02-15 00:40:11','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (352,39,129.2,0.752,0.257,0.27,1,0.885,-68.73,0.115,'Cluster 1','calm','D','4/4',30,1486.79,2944.74,0.0573,'[-307.00274658203125, 88.12306213378906, -10.555253028869629, 8.402239799499512, -3.3849129676818848, -2.183814287185669, -1.897255539894104, -3.946942090988159, -5.556814670562744, 1.9488568305969238, 2.1084444522857666, 12.85062026977539, 10.084400177001953]','[0.21029183268547058, 0.26431185007095337, 0.5670540928840637, 0.2642612159252167, 0.3853599429130554, 0.14941829442977905, 0.10864720493555069, 0.13519157469272614, 0.22600652277469635, 0.46017536520957947, 0.2332116961479187, 0.20703651010990143]','2026-02-15 00:40:21','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (353,42,172.27,0.604,0.177,0.438,1,0.765,-60.53,0.235,'Cluster 0','calm','E','4/4',30,2413.98,5027.39,0.1173,'[-171.49830627441406, 75.40416717529297, 4.283688545227051, 21.175676345825195, -3.938417673110962, 6.120541095733643, -3.779733657836914, 2.7552988529205322, -4.567434310913086, 0.5475163459777832, -5.04701566696167, 1.4085426330566406, -4.220250606536865]','[0.3692547380924225, 0.3311227262020111, 0.39772939682006836, 0.302167683839798, 0.6014439463615417, 0.36666029691696167, 0.24915821850299835, 0.30020642280578613, 0.2847345471382141, 0.30517128109931946, 0.22053262591362, 0.29506292939186096]','2026-02-15 00:40:29','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (354,40,143.55,0.85,0.19,0.334,1,0.846,-59.63,0.154,'Cluster 0','calm','C','4/4',30,1841.02,3447.75,0.077,'[-109.48234558105469, 94.95707702636719, -31.701160430908203, 27.3882999420166, 25.930099487304688, 21.846858978271484, -1.4552611112594604, 19.848285675048828, 15.284566879272461, 10.927695274353027, 1.1326583623886108, 7.876308917999268, 8.812942504882812]','[0.8685998320579529, 0.6449216604232788, 0.4722902774810791, 0.37390923500061035, 0.3170570135116577, 0.30577388405799866, 0.3184095025062561, 0.3897402286529541, 0.4344501197338104, 0.5074830651283264, 0.5909215211868286, 0.7950335741043091]','2026-02-15 00:40:38','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (355,41,123.05,0.709,0.229,0.111,1,0.94,-70.1,0.06,'Cluster 0','calm','A#','4/4',30,609.73,1061.64,0.0299,'[-272.4412841796875, 204.6283416748047, 12.90759563446045, 12.979705810546875, 10.926217079162598, 12.283960342407227, 6.128424167633057, -11.936955451965332, -15.20096206665039, 3.0426549911499023, -0.42271703481674194, -7.194949626922607, -0.6042979955673218]','[0.28205910325050354, 0.36866435408592224, 0.39649221301078796, 0.40877729654312134, 0.4186513423919678, 0.63428795337677, 0.4363144338130951, 0.4616107642650604, 0.32129207253456116, 0.39297136664390564, 0.7107682228088379, 0.3531145453453064]','2026-02-15 00:40:55','2026-02-19 18:06:16');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (356,44,152,0.679,0.26,0.415,1,0.791,-67.07,0.209,'Cluster 0','calm','A','4/4',30,2288,4430.66,0.1047,'[-286.66632080078125, 38.71942138671875, 18.527908325195312, 19.841176986694336, 1.9276294708251953, 21.241323471069336, 16.509519577026367, 18.771135330200195, 5.2492995262146, 5.153302192687988, 4.007015228271484, 9.117924690246582, 3.7719674110412598]','[0.5157134532928467, 0.3919721841812134, 0.523232638835907, 0.3934495449066162, 0.4416239261627197, 0.3470115661621094, 0.33438584208488464, 0.40570327639579773, 0.4796052873134613, 0.5679228901863098, 0.4720793068408966, 0.46161314845085144]','2026-02-15 00:41:01','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (357,45,152,0.632,0.252,0.469,1,0.722,-67.27,0.278,'Cluster 0','energetic','A','4/4',30,2586.07,4570.36,0.1391,'[-272.3420104980469, 61.48999786376953, 21.200122833251953, 11.60689640045166, 3.3056609630584717, 12.312471389770508, 7.136586666107178, 10.060386657714844, 1.9929159879684448, 5.445714473724365, 1.6913374662399292, 6.769577980041504, 2.805314302444458]','[0.5814852118492126, 0.47137758135795593, 0.5605792999267578, 0.4390503466129303, 0.45628681778907776, 0.3846088945865631, 0.34819021821022034, 0.4313164949417114, 0.5147926211357117, 0.5880630016326904, 0.5393431186676025, 0.5465788841247559]','2026-02-15 00:41:07','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (358,46,95.7,0.928,0.169,0.199,1,0.863,-64.95,0.137,'Cluster 0','calm','C','4/4',30,1099.42,2375.89,0.0687,'[-237.49085998535156, 160.451416015625, -1.541104793548584, 42.720943450927734, -0.056725092232227325, 10.997356414794922, -1.6006414890289307, 2.5700948238372803, -0.48588716983795166, 3.060793399810791, 3.8757898807525635, 4.658009052276611, 1.5896402597427368]','[0.6485422849655151, 0.48947975039482117, 0.5955979824066162, 0.450274258852005, 0.4057048261165619, 0.49986234307289124, 0.33034461736679077, 0.32214871048927307, 0.33584949374198914, 0.46725326776504517, 0.41753166913986206, 0.44607803225517273]','2026-02-15 00:41:15','2026-02-19 18:06:29');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (359,43,152,0.581,0.173,0.276,1,0.901,-64.92,0.099,'Cluster 0','calm','A#','4/4',30,1520.3,3478.45,0.0495,'[-240.7470703125, 121.95928955078125, 37.98905944824219, 18.72100257873535, 8.451420783996582, 15.08006477355957, 2.2985072135925293, -5.420319557189941, -10.024087905883789, 3.6150128841400146, -1.5767208337783813, -2.5911102294921875, -3.30161190032959]','[0.49419692158699036, 0.5047646164894104, 0.4430842995643616, 0.3806976079940796, 0.3702503740787506, 0.5254553556442261, 0.46430784463882446, 0.4758014380931854, 0.3455214202404022, 0.4249054193496704, 0.6670570373535156, 0.5070172548294067]','2026-02-15 00:41:31','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (360,20,129.2,0.574,0.194,0.421,1,0.778,-61.78,0.222,'Cluster 0','calm','C','4/4',30,2321.93,4855.42,0.1112,'[-230.03004455566406, 101.03678131103516, 37.38475799560547, 12.480851173400879, -3.4072492122650146, 6.950671672821045, -1.5474574565887451, 6.9413065910339355, -1.1668068170547485, 4.92484712600708, -0.19639846682548523, 5.918920516967773, 1.9171746969223022]','[0.6036909222602844, 0.5917720198631287, 0.5428407788276672, 0.5378152132034302, 0.5542937517166138, 0.5524892210960388, 0.5465307831764221, 0.5285900235176086, 0.5022815465927124, 0.5103784203529358, 0.5463089346885681, 0.5640500783920288]','2026-02-15 00:41:34','2026-02-19 19:06:40');
    INSERT INTO `AudioFeatures` (FeatureID, ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, GenreCluster, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean, CreatedAt, UpdatedAt) VALUES (361,47,152,0.517,0.287,0.346,1,0.886,-66.67,0.114,'Cluster 1','calm','G','4/4',30,1906.83,4123.88,0.0571,'[-282.92376708984375, 78.4372787475586, 42.36942672729492, 25.68995475769043, -1.2356219291687012, 2.3052494525909424, -4.264463901519775, -2.8364343643188477, -9.858209609985352, -3.923866033554077, -8.017931938171387, 2.1730828285217285, -2.044839859008789]','[0.32521435618400574, 0.19111093878746033, 0.23747171461582184, 0.2824883759021759, 0.21076101064682007, 0.1537773609161377, 0.15599791705608368, 0.3458544909954071, 0.21613828837871552, 0.30216553807258606, 0.3195885121822357, 0.22682657837867737]','2026-02-15 00:41:41','2026-02-19 19:06:40');



    -- Grant privileges to gamestore_user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO 'gamestore_user'@'%';
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
