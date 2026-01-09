#!/bin/bash
set -e

echo "Initializing Game Store Database..."

# SQL commands to execute
SQL_COMMANDS=$(cat <<'EOSQL'
CREATE DATABASE IF NOT EXISTS Game_Store_System;
USE Game_Store_System;

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
        albumCoverImageUrl VARCHAR(255),
        gameCoverImageUrl VARCHAR(255),
        file_url VARCHAR(255),
        preview_url VARCHAR(255),
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
    -- AI RECOMMENDATION TABLES
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
        Genre VARCHAR(100),             -- Detected genre
        Mood VARCHAR(100),              -- Detected mood (happy, sad, energetic, calm)
        Key_Signature VARCHAR(10),      -- Musical key (C, D, E, etc.)
        TimeSignature VARCHAR(10),      -- Time signature (4/4, 3/4, etc.)
        Duration INT,                   -- Duration in seconds
        SpectralCentroid FLOAT,         -- Brightness of sound
        SpectralRolloff FLOAT,          -- Shape of signal
        ZeroCrossingRate FLOAT,         -- Noisiness indicator
        MfccMean TEXT,                  -- JSON array of MFCC means
        ChromaMean TEXT,                -- JSON array of chroma features
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

    -- UserRecommendations: Store personalized recommendations for users
    CREATE TABLE IF NOT EXISTS UserRecommendations (
        RecommendationID BIGINT AUTO_INCREMENT PRIMARY KEY,
        AccountID BIGINT NOT NULL,
        ProductID INT NOT NULL,
        RecommendationScore FLOAT NOT NULL,     -- Confidence score 0-1
        RecommendationType VARCHAR(50),         -- collaborative, content-based, hybrid, trending, audio-similarity
        ReasonCode VARCHAR(255),                -- Why recommended (e.g., "similar to X", "users like you enjoyed")
        GeneratedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ExpiresAt TIMESTAMP,                    -- When recommendation becomes stale
        WasShown BOOLEAN DEFAULT FALSE,         -- Track if shown to user
        WasClicked BOOLEAN DEFAULT FALSE,       -- Track if user clicked
        WasPurchased BOOLEAN DEFAULT FALSE,     -- Track if resulted in purchase
        FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
        FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
        INDEX idx_account_score (AccountID, RecommendationScore DESC),
        INDEX idx_generated_at (GeneratedAt),
        INDEX idx_recommendation_type (RecommendationType),
        UNIQUE KEY unique_active_recommendation (AccountID, ProductID, GeneratedAt)
    );

    -- RealTimeRecommendations: Store live audio-based recommendations during playback
    CREATE TABLE IF NOT EXISTS RealTimeRecommendations (
        RealTimeID BIGINT AUTO_INCREMENT PRIMARY KEY,
        SessionID VARCHAR(255) NOT NULL,        -- User session identifier
        AccountID BIGINT,                       -- Optional if user is logged in
        CurrentProductID INT NOT NULL,          -- Product currently being played
        RecommendedProductID INT NOT NULL,      -- Recommended product
        SimilarityScore FLOAT NOT NULL,         -- Audio similarity score 0-1
        TempoMatch FLOAT,                       -- How close tempo values are
        EnergyMatch FLOAT,                      -- How close energy values are
        MoodMatch FLOAT,                        -- How close mood/valence values are
        GenreMatch BOOLEAN,                     -- Same genre or not
        FeatureVector TEXT,                     -- JSON of compared features
        DisplayedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UserAction VARCHAR(50),                 -- clicked, ignored, purchased, skipped
        ResponseTime INT,                       -- Seconds until user action
        FOREIGN KEY(CurrentProductID) REFERENCES Products(ProductID),
        FOREIGN KEY(RecommendedProductID) REFERENCES Products(ProductID),
        FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
        INDEX idx_session (SessionID),
        INDEX idx_current_product (CurrentProductID),
        INDEX idx_similarity (SimilarityScore DESC),
        INDEX idx_displayed_at (DisplayedAt)
    );

    -- ============================================
    -- INSERT DUMMY DATA
    -- ============================================

    -- Insert Accounts (Managers, Employees, Customers)
    -- All passwords are BCrypt hashed version of 'password'
    -- Using BCrypt hash: $2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG
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
    -- Note: albumCoverImageUrl for music uses the cloud animation video from S3
    INSERT INTO Products (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, albumCoverImageUrl, gameCoverImageUrl, file_url, preview_url, StockQuantity) VALUES
    -- Games
    ('Jimmy Jungle', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Jimmy Jungle Cover Image.png', 'https://jimmywheezer.itch.io/jimmy-jungle', NULL, 100),
    ('Midnight Haunt', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Midnight Haunt Cover Image.png', 'https://jimmywheezer.itch.io/midnight-haunt', NULL, 100),
    ('Protectors', NULL, 'PC', 5.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Protectors Cover Image.png', 'https://jimmywheezer.itch.io/protectors', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors video game trailer.mp4', 100),
    ('Red Hood', NULL, 'PC', 1.50, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Red Hood Cover Image.png', 'https://jimmywheezer.itch.io/red-hood', NULL, 100),

    -- Music Albums (using cloud animation video as cover)
    (NULL, 'Selected Electronic Works', NULL, NULL, 5.00, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Song_WAV_Files_For_Final_Year_Project.zip', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Song_WAV_Files_For_Final_Year_Project.zip', 200),
    
    -- Individual Songs from Selected Electronic Works (using cloud animation video as cover)
    (NULL, 'Alien Acid', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Acid.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Acid.wav', 200),
    (NULL, 'Alien Action', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Action.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Action.wav', 200),
    (NULL, 'Alien Amp Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Amp Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Amp Up.wav', 200),
    (NULL, 'Alien Bars', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Bars.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Bars.wav', 200),
    (NULL, 'Alien Business', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Business.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Business.wav', 200),
    (NULL, 'Alien Chilling', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Chilling.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Chilling.wav', 200),
    (NULL, 'Alien Essence', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Essence.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Essence.wav', 200),
    (NULL, 'Alien Euphoria', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Euphoria.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Euphoria.wav', 200),
    (NULL, 'Alien Feels', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Feels.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Feels.wav', 200),
    (NULL, 'Alien Flow State', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Flow State.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Flow State.wav', 200),
    (NULL, 'Alien Grind', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Grind.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Grind.wav', 200),
    (NULL, 'Alien Harmony', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Harmony.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Harmony.wav', 200),
    (NULL, 'Alien Hyperness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Hyperness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Hyperness.wav', 200),
    (NULL, 'Alien Joy', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Joy.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Joy.wav', 200),
    (NULL, 'Alien Memories', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Memories.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Memories.wav', 200),
    (NULL, 'Alien Mode', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Mode.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Mode.wav', 200),
    (NULL, 'Alien Nature', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Nature.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Nature.wav', 200),
    (NULL, 'Alien Ragebait', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Ragebait.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Ragebait.wav', 200),
    (NULL, 'Alien Realm', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Realm.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Realm.wav', 200),
    (NULL, 'Alien Sense', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Sense.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Sense.wav', 200),
    (NULL, 'Alien Singing', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Singing.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Singing.wav', 200),
    (NULL, 'Alien Soul', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Soul.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Soul.wav', 200),
    (NULL, 'Alien Translation', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Translation.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Translation.wav', 200),
    (NULL, 'Alien Turn Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Turn Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Turn Up.wav', 200),
    (NULL, 'Alien Upgrade', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Upgrade.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Upgrade.wav', 200),
    (NULL, 'Alien Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Utopia.wav', 200),
    (NULL, 'Alien Wonder', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Wonder.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Wonder.wav', 200),
    (NULL, 'Extraterrestrial Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial Rave.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial Rave.wav', 200),
    (NULL, 'Green Bear', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green Bear.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green Bear.wav', 200),
    (NULL, 'Green God', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green God.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green God.wav', 200),
    (NULL, 'Intergalactic Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic Rave.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic Rave.wav', 200),
    (NULL, 'Ted Chilling', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted Chilling.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted Chilling.wav', 200),
    (NULL, 'Teddy Emotion', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy Emotion.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy Emotion.wav', 200),
    (NULL, 'Ted''s Awakening', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 200),
    (NULL, 'Ted''s Beautiful Anger', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 200),
    (NULL, 'Ted''s Chillness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 200),
    (NULL, 'Ted''s Deepness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 200),
    (NULL, 'Ted''s Dream', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 200),
    (NULL, 'Ted''s Energy', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 200),
    (NULL, 'Ted''s Green Machine', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 200),
    (NULL, 'Ted''s Rush Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 200),
    (NULL, 'Ted''s Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 200),
    (NULL, 'Acid Ambience', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Acid%20Ambience%20.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Acid%20Ambience%20.wav', 200),
    (NULL, 'Alien Amen Break Beat', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien%20Amen%20Break%20Beat.wav', 200),
    (NULL, 'Breakcore Bear Hug', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Breakcore%20Bear%20Hug.wav', 200),
    (NULL, 'Drunk House', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Drunk%20House.wav', 200),
    (NULL, 'Soft Chaos', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft%20Chaos.wav', 200);

    -- Insert Stock entries 
    INSERT INTO Stock (StockQuantity, ProductID) VALUES
    (100, 1),  -- Jimmy Jungle
    (100, 2),  -- Midnight Haunt
    (100, 3),  -- Protectors
    (100, 4),  -- Red Hood
    (200, 5),  -- Selected Electronic Works (full album ZIP)
    -- Individual songs (Product IDs 6-58)
    (200, 6), (200, 7), (200, 8), (200, 9), (200, 10),
    (200, 11), (200, 12), (200, 13), (200, 14), (200, 15),
    (200, 16), (200, 17), (200, 18), (200, 19), (200, 20),
    (200, 21), (200, 22), (200, 23), (200, 24), (200, 25),
    (200, 26), (200, 27), (200, 28), (200, 29), (200, 30),
    (200, 31), (200, 32), (200, 33), (200, 34), (200, 35),
    (200, 36), (200, 37), (200, 38), (200, 39), (200, 40),
    (200, 41), (200, 42), (200, 43), (200, 44), (200, 45),
    (200, 46), (200, 47), (200, 48), (200, 49), (200, 50),
    (200, 51), (200, 52), (200, 53), (200, 54), (200, 55),
    (200, 56), (200, 57), (200, 58);

    -- Insert Orders
    INSERT INTO Orders (AccountID, orderDate, TotalAmount) VALUES
    (4, '2025-10-01 10:30:00', 4.00),    -- Alice Brown
    (5, '2025-10-02 14:15:00', 7.00),    -- Bob Davis
    (6, '2025-10-03 16:45:00', 3.50),    -- Carol White
    (7, '2025-10-05 11:20:00', 10.00),   -- David Lee
    (8, '2025-10-07 09:00:00', 5.00);    -- Emma Garcia

    -- Insert Order_Items (only referencing products 1-5)
    INSERT INTO Order_Items (OrderID, ProductID, Quantity, UnitPrice) VALUES
    -- Order 1 (Alice Brown)
    (1, 1, 2, 2.00),    -- Jimmy Jungle x2
    -- Order 2 (Bob Davis)
    (2, 2, 2, 2.00),    -- Midnight Haunt x2
    (2, 3, 1, 5.00),    -- Protectors
    (2, 1, 1, 2.00),    -- Jimmy Jungle
    -- Order 3 (Carol White)
    (3, 4, 1, 1.50),    -- Red Hood
    (3, 1, 1, 2.00),    -- Jimmy Jungle
    -- Order 4 (David Lee)
    (4, 3, 2, 5.00),    -- Protectors x2
    -- Order 5 (Emma Garcia)
    (5, 5, 1, 5.00);    -- Selected Electronic Works

    -- Insert CustomerSummary (matching the updated orders)
    INSERT INTO CustomerSummary (AccountID, ProductID, OrderID) VALUES
    (4, 1, 1),
    (5, 2, 2),
    (5, 3, 2),
    (5, 1, 2),
    (6, 4, 3),
    (6, 1, 3),
    (7, 3, 4),
    (8, 5, 5);

    -- Insert Sold_Products (matching the updated order items)
    INSERT INTO Sold_Products (OrderItemID, ProductID) VALUES
    (1, 1),
    (2, 2),
    (3, 3),
    (4, 1),
    (5, 4),
    (6, 1),
    (7, 3),
    (8, 5);

    -- Insert Purchased_Products (matching the updated order items)
    INSERT INTO Purchased_Products (OrderItemID, ProductID) VALUES
    (1, 1),
    (2, 2),
    (3, 3),
    (4, 1),
    (5, 4),
    (6, 1),
    (7, 3),
    (8, 5);

    -- Insert GameWishlist (only referencing products 1-5)
    INSERT INTO GameWishlist (AccountID, ProductID) VALUES
    (4, 2),   -- Alice wants Midnight Haunt
    (4, 3),   -- Alice wants Protectors
    (5, 1),   -- Bob wants Jimmy Jungle
    (6, 3),   -- Carol wants Protectors
    (7, 4),   -- David wants Red Hood
    (8, 5),   -- Emma wants Selected Electronic Works
    (9, 3),   -- Frank wants Protectors
    (10, 2);  -- Grace wants Midnight Haunt

    -- Insert AudioFeatures for music products (extracted from S3 WAV files)
    INSERT INTO AudioFeatures (ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, Genre, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate) VALUES
    (6, 117.45, 0.168, 1.0, 0.584, 1.0, 0.874, -69.04, 0.126, 'Pop', 'Neutral', 'C', '4/4', 30, 1722.19, 3584.83, 0.0632),
    (7, 80.75, 0.318, 1.0, 0.464, 1.0, 0.928, -56.39, 0.072, 'Ambient', 'Neutral', 'G', '4/4', 30, 1121.95, 2261.08, 0.0359),
    (8, 136.0, 0.21, 1.0, 0.843, 0.999, 0.672, -58.5, 0.328, 'Pop', 'Uplifting', 'A#', '4/4', 30, 2529.68, 5621.21, 0.1638),
    (9, 80.75, 0.187, 1.0, 0.762, 0.999, 0.802, -64.71, 0.198, 'Ambient', 'Uplifting', 'F', '4/4', 30, 2291.16, 4872.53, 0.099),
    (10, 152.0, 0.159, 0.745, 0.318, 1.0, 0.889, -66.97, 0.111, 'Pop', 'Calm', 'A', '4/4', 30, 847.88, 1581.54, 0.0555),
    (11, 92.29, 0.236, 1.0, 0.739, 0.999, 0.863, -59.6, 0.137, 'Ambient', 'Uplifting', 'B', '4/4', 30, 2148.9, 5034.32, 0.0687),
    (12, 161.5, 0.193, 1.0, 0.768, 0.999, 0.81, -65.08, 0.19, 'Pop', 'Uplifting', 'G', '4/4', 30, 2303.12, 4652.55, 0.0952),
    (13, 136.0, 0.182, 1.0, 0.488, 1.0, 0.938, -70.85, 0.062, 'Pop', 'Neutral', 'A', '4/4', 30, 1385.08, 3130.71, 0.0311),
    (14, 112.35, 0.257, 1.0, 0.553, 1.0, 0.887, -65.53, 0.113, 'Pop', 'Neutral', 'C', '4/4', 30, 1502.17, 3165.63, 0.0565),
    (15, 129.2, 0.272, 1.0, 1.0, 0.999, 0.784, -57.63, 0.216, 'Pop', 'Uplifting', 'A#', '4/4', 30, 3146.82, 6556.56, 0.108),
    (16, 112.35, 0.14, 1.0, 0.657, 1.0, 0.736, -59.99, 0.264, 'Pop', 'Uplifting', 'G#', '4/4', 30, 2004.54, 3494.78, 0.1319),
    (17, 92.29, 0.267, 1.0, 0.679, 0.999, 0.86, -57.42, 0.14, 'Ambient', 'Uplifting', 'A#', '4/4', 30, 1908.07, 4277.34, 0.0701),
    (18, 86.13, 0.163, 1.0, 0.945, 0.999, 0.639, -58.19, 0.361, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2931.59, 6334.57, 0.1807),
    (19, 129.2, 0.199, 1.0, 0.444, 1.0, 0.928, -69.34, 0.072, 'Pop', 'Neutral', 'C', '4/4', 30, 1214.5, 2459.02, 0.0362),
    (20, 161.5, 0.143, 0.601, 0.186, 1.0, 0.931, -76.58, 0.069, 'Pop', 'Calm', 'F', '4/4', 30, 429.12, 532.33, 0.0343),
    (21, 129.2, 0.244, 1.0, 0.65, 1.0, 0.839, -62.74, 0.161, 'Pop', 'Uplifting', 'E', '4/4', 30, 1842.72, 3721.17, 0.0805),
    (22, 129.2, 0.246, 1.0, 0.563, 1.0, 0.89, -63.1, 0.11, 'Pop', 'Neutral', 'G', '4/4', 30, 1547.24, 3208.03, 0.0548),
    (23, 129.2, 0.157, 1.0, 0.759, 0.999, 0.778, -61.78, 0.222, 'Pop', 'Uplifting', 'C', '4/4', 30, 2321.93, 4855.42, 0.1112),
    (24, 73.83, 0.183, 0.973, 0.506, 1.0, 0.82, -66.38, 0.18, 'Ambient', 'Neutral', 'D', '4/4', 30, 1443.37, 2549.16, 0.0899),
    (25, 161.5, 0.263, 1.0, 0.733, 0.999, 0.706, -58.08, 0.294, 'Pop', 'Uplifting', 'E', '4/4', 30, 2091.32, 4488.33, 0.147),
    (26, 92.29, 0.267, 1.0, 0.679, 0.999, 0.86, -57.42, 0.14, 'Ambient', 'Uplifting', 'A#', '4/4', 30, 1907.88, 4277.46, 0.0701),
    (27, 103.36, 0.178, 1.0, 0.668, 0.999, 0.835, -65.95, 0.165, 'Pop', 'Uplifting', 'C#', '4/4', 30, 1989.41, 4071.02, 0.0824),
    (28, 161.5, 0.161, 1.0, 0.735, 0.999, 0.834, -58.97, 0.166, 'Pop', 'Uplifting', 'A', '4/4', 30, 2235.88, 4691.57, 0.083),
    (29, 92.29, 0.207, 1.0, 0.509, 1.0, 0.93, -65.31, 0.07, 'Ambient', 'Neutral', 'G', '4/4', 30, 1421.32, 3156.86, 0.0352),
    (30, 161.5, 0.141, 1.0, 0.857, 0.999, 0.78, -61.09, 0.22, 'Pop', 'Uplifting', 'F', '4/4', 30, 2667.46, 5212.79, 0.1099),
    (31, 172.27, 0.137, 0.805, 0.61, 1.0, 0.874, -64.91, 0.126, 'Pop', 'Uplifting', 'A#', '4/4', 30, 1849.5, 3946.58, 0.0629),
    (32, 95.7, 0.198, 1.0, 0.493, 1.0, 0.87, -63.82, 0.13, 'Ambient', 'Neutral', 'C', '4/4', 30, 1378.91, 2547.81, 0.0648),
    (33, 60.09, 0.096, 0.742, 0.74, 0.999, 0.804, -58.33, 0.196, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2338.57, 4998.79, 0.0981),
    (35, 92.29, 0.314, 1.0, 0.832, 0.999, 0.839, -58.19, 0.161, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2353.98, 5312.02, 0.0807),
    (36, 123.05, 0.235, 0.958, 0.263, 1.0, 0.96, -73.74, 0.04, 'Pop', 'Calm', 'A#', '4/4', 30, 564.45, 920.97, 0.0201),
    (37, 117.45, 0.113, 1.0, 0.877, 0.999, 0.84, -65.66, 0.16, 'Pop', 'Uplifting', 'C', '4/4', 30, 2772.4, 5332.76, 0.0798),
    (40, 112.35, 0.181, 1.0, 0.584, 1.0, 0.876, -63.42, 0.124, 'Pop', 'Neutral', 'A', '4/4', 30, 1704.25, 3612.22, 0.0621),
    (41, 117.45, 0.212, 1.0, 0.65, 1.0, 0.858, -66.77, 0.142, 'Pop', 'Uplifting', 'C', '4/4', 30, 1882.64, 3912.38, 0.071),
    (43, 129.2, 0.199, 1.0, 0.526, 1.0, 0.885, -68.73, 0.115, 'Pop', 'Neutral', 'D', '4/4', 30, 1486.79, 2944.74, 0.0573),
    (44, 143.55, 0.423, 1.0, 0.721, 1.0, 0.846, -59.63, 0.154, 'Pop', 'Uplifting', 'C', '4/4', 30, 1841.02, 3447.75, 0.077),
    (45, 123.05, 0.183, 0.953, 0.256, 1.0, 0.94, -70.1, 0.06, 'Pop', 'Calm', 'A#', '4/4', 30, 609.73, 1061.64, 0.0299),
    (46, 172.27, 0.232, 1.0, 0.817, 0.999, 0.765, -60.53, 0.235, 'Pop', 'Uplifting', 'E', '4/4', 30, 2413.98, 5027.39, 0.1173),
    (47, 152.0, 0.204, 1.0, 0.538, 1.0, 0.901, -64.92, 0.099, 'Pop', 'Neutral', 'A#', '4/4', 30, 1520.3, 3478.45, 0.0495),
    (48, 152.0, 0.264, 1.0, 0.792, 0.999, 0.791, -67.07, 0.209, 'Pop', 'Uplifting', 'A', '4/4', 30, 2288.0, 4430.66, 0.1047),
    (49, 152.0, 0.258, 1.0, 0.879, 0.999, 0.722, -67.27, 0.278, 'Pop', 'Uplifting', 'A', '4/4', 30, 2586.07, 4570.36, 0.1391),
    (50, 95.7, 0.2, 1.0, 0.41, 1.0, 0.863, -64.95, 0.137, 'Ambient', 'Neutral', 'C', '4/4', 30, 1099.42, 2375.89, 0.0687),
    (51, 152.0, 0.173, 1.0, 0.641, 0.999, 0.886, -66.67, 0.114, 'Pop', 'Uplifting', 'G', '4/4', 30, 1906.83, 4123.88, 0.0571);

    -- Grant privileges to gamestore_user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO 'gamestore_user'@'%';
    FLUSH PRIVILEGES;
EOSQL
)

# Try localhost first, then remote host
echo "$SQL_COMMANDS" | mysql -u root -p"${MYSQL_ROOT_PASSWORD}" || echo "$SQL_COMMANDS" | mysql --protocol=TCP --host=db -u root -p"${MYSQL_ROOT_PASSWORD}"

echo "Database initialization complete!"
