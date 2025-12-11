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
    (NULL, 'Find The Light', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Find The Light.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Find The Light.wav', 200),
    (NULL, 'Green Bear', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green Bear.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green Bear.wav', 200),
    (NULL, 'Green God', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green God.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green God.wav', 200),
    (NULL, 'Intergalactic Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic Rave.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic Rave.wav', 200),
    (NULL, 'Mike''s Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike%E2%80%99s%20Rave.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike%E2%80%99s%20Rave.wav', 200),
    (NULL, 'Mike''s Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike%E2%80%99s%20Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike%E2%80%99s%20Utopia.wav', 200),
    (NULL, 'Ted Chilling', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted Chilling.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted Chilling.wav', 200),
    (NULL, 'Teddy Emotion', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy Emotion.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy Emotion.wav', 200),
    (NULL, 'Ted''s Adventure', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Adventure.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Adventure.wav', 200),
    (NULL, 'Ted''s Awakening', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 200),
    (NULL, 'Ted''s Beautiful Anger', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 200),
    (NULL, 'Ted''s Chillness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 200),
    (NULL, 'Ted''s Deepness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 200),
    (NULL, 'Ted''s Dream', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 200),
    (NULL, 'Ted''s Energy', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 200),
    (NULL, 'Ted''s Green Machine', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 200),
    (NULL, 'Ted''s Rush Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 200),
    (NULL, 'Ted''s Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 200);

    -- Insert Stock entries 
    INSERT INTO Stock (StockQuantity, ProductID) VALUES
    (100, 1),  -- Jimmy Jungle
    (100, 2),  -- Midnight Haunt
    (100, 3),  -- Protectors
    (100, 4),  -- Red Hood
    (200, 5),  -- Selected Electronic Works (full album ZIP)
    -- Individual songs (Product IDs 6-53)
    (200, 6), (200, 7), (200, 8), (200, 9), (200, 10),
    (200, 11), (200, 12), (200, 13), (200, 14), (200, 15),
    (200, 16), (200, 17), (200, 18), (200, 19), (200, 20),
    (200, 21), (200, 22), (200, 23), (200, 24), (200, 25),
    (200, 26), (200, 27), (200, 28), (200, 29), (200, 30),
    (200, 31), (200, 32), (200, 33), (200, 34), (200, 35),
    (200, 36), (200, 37), (200, 38), (200, 39), (200, 40),
    (200, 41), (200, 42), (200, 43), (200, 44), (200, 45),
    (200, 46), (200, 47), (200, 48), (200, 49), (200, 50),
    (200, 51), (200, 52), (200, 53);

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

    -- Insert Sample UserInteractions (simulate user behavior)
    INSERT INTO UserInteractions (AccountID, ProductID, InteractionType, DurationSeconds, CompletionPercentage, EngagementScore, DeviceType, SessionID) VALUES
    -- John Smith (Manager) exploring music
    (1, 6, 'play', 120, 75.5, 0.85, 'desktop', 'sess_001'),
    (1, 7, 'preview', 45, 90.0, 0.92, 'desktop', 'sess_001'),
    (1, 8, 'play', 180, 100.0, 0.98, 'desktop', 'sess_001'),
    -- Alice Brown (Customer) - likes energetic music
    (4, 10, 'play', 150, 95.0, 0.95, 'mobile', 'sess_002'),
    (4, 15, 'play', 200, 100.0, 0.99, 'mobile', 'sess_002'),
    (4, 20, 'preview', 30, 50.0, 0.65, 'mobile', 'sess_002'),
    (4, 1, 'view', 10, 100.0, 0.40, 'mobile', 'sess_002'),
    (4, 1, 'purchase', NULL, NULL, 1.0, 'mobile', 'sess_002'),
    -- Bob Davis - exploring various genres
    (5, 25, 'play', 90, 60.0, 0.70, 'tablet', 'sess_003'),
    (5, 30, 'play', 160, 85.0, 0.88, 'tablet', 'sess_003'),
    (5, 35, 'preview', 20, 40.0, 0.55, 'tablet', 'sess_003'),
    -- Carol White - chill music listener
    (6, 11, 'play', 210, 100.0, 0.96, 'desktop', 'sess_004'),
    (6, 16, 'play', 190, 95.0, 0.94, 'desktop', 'sess_004'),
    (6, 40, 'play', 180, 100.0, 0.97, 'desktop', 'sess_004'),
    -- David Lee - game browser
    (7, 1, 'view', 25, 100.0, 0.75, 'desktop', 'sess_005'),
    (7, 2, 'view', 30, 100.0, 0.80, 'desktop', 'sess_005'),
    (7, 3, 'view', 45, 100.0, 0.90, 'desktop', 'sess_005'),
    (7, 3, 'purchase', NULL, NULL, 1.0, 'desktop', 'sess_005');

    -- Insert Sample AudioFeatures (placeholder data - will be populated by AI service)
    -- Features for a few songs to demonstrate the structure
    INSERT INTO AudioFeatures (ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, Genre, Mood, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate) VALUES
    -- Alien Acid - High energy electronic
    (6, 128.0, 0.92, 0.88, 0.75, 0.05, 0.95, -5.5, 0.03, 'Electronic', 'Energetic', 240, 2500.0, 8000.0, 0.15),
    -- Alien Action - Fast paced
    (7, 140.0, 0.95, 0.85, 0.80, 0.03, 0.98, -4.8, 0.02, 'Electronic', 'Energetic', 210, 2800.0, 8500.0, 0.18),
    -- Alien Chilling - Relaxed ambient
    (11, 90.0, 0.45, 0.50, 0.65, 0.20, 0.90, -12.0, 0.01, 'Ambient', 'Calm', 300, 1500.0, 5000.0, 0.08),
    -- Alien Euphoria - Happy uplifting
    (13, 125.0, 0.88, 0.90, 0.95, 0.08, 0.85, -6.2, 0.04, 'Electronic', 'Happy', 220, 2600.0, 7800.0, 0.14),
    -- Ted Chilling - Relaxed downtempo
    (36, 85.0, 0.40, 0.55, 0.70, 0.25, 0.88, -13.5, 0.02, 'Downtempo', 'Calm', 280, 1400.0, 4800.0, 0.07);

    -- Insert Sample Recommendations (AI-generated recommendations)
    INSERT INTO UserRecommendations (AccountID, ProductID, RecommendationScore, RecommendationType, ReasonCode, ExpiresAt, WasShown, WasClicked) VALUES
    -- Recommendations for Alice (likes energetic music)
    (4, 7, 0.95, 'content-based', 'Similar tempo and energy to Alien Hyperness', DATE_ADD(NOW(), INTERVAL 7 DAY), TRUE, TRUE),
    (4, 13, 0.92, 'content-based', 'High valence and energy match your preferences', DATE_ADD(NOW(), INTERVAL 7 DAY), TRUE, FALSE),
    (4, 22, 0.88, 'collaborative', 'Users with similar taste enjoyed this', DATE_ADD(NOW(), INTERVAL 7 DAY), FALSE, FALSE),
    -- Recommendations for Bob
    (5, 40, 0.90, 'collaborative', 'Popular among users who liked Alien Sense', DATE_ADD(NOW(), INTERVAL 7 DAY), TRUE, FALSE),
    (5, 16, 0.85, 'content-based', 'Similar audio features to your recent listens', DATE_ADD(NOW(), INTERVAL 7 DAY), FALSE, FALSE),
    -- Recommendations for Carol (likes chill music)
    (6, 36, 0.93, 'content-based', 'Low tempo and calm mood match your preferences', DATE_ADD(NOW(), INTERVAL 7 DAY), TRUE, TRUE),
    (6, 45, 0.89, 'content-based', 'Similar spectral features to Ted Chilling', DATE_ADD(NOW(), INTERVAL 7 DAY), FALSE, FALSE),
    -- Game recommendations for David
    (7, 2, 0.87, 'collaborative', 'Users who bought Protectors also enjoyed this', DATE_ADD(NOW(), INTERVAL 7 DAY), TRUE, FALSE),
    (7, 4, 0.82, 'trending', 'Popular this week', DATE_ADD(NOW(), INTERVAL 7 DAY), FALSE, FALSE);

    -- Grant privileges to gamestore_user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO 'gamestore_user'@'%';
    FLUSH PRIVILEGES;
EOSQL
)

# Try localhost first, then remote host
echo "$SQL_COMMANDS" | mysql -u root -p"${MYSQL_ROOT_PASSWORD}" || echo "$SQL_COMMANDS" | mysql --protocol=TCP --host=db -u root -p"${MYSQL_ROOT_PASSWORD}"

echo "Database initialization complete!"
