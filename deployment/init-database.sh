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
    (NULL, 'Selected Electronic Works', NULL, NULL, 5.00, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Selected_Electronic_Works - Album.zip', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Selected_Electronic_Works - Album.zip', 200),
    
    -- Individual Songs from Selected Electronic Works (using cloud animation video as cover)
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
    (NULL, 'Ted''s Awakening', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav', 200),
    (NULL, 'Ted''s Beautiful Anger', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Beautiful%20Anger.wav', 200),
    (NULL, 'Ted''s Chillness', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Chillness.wav', 200),
    (NULL, 'Ted''s Deepness', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Deepness.wav', 200),
    (NULL, 'Ted''s Dream', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Dream.wav', 200),
    (NULL, 'Ted''s Energy', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Energy.wav', 200),
    (NULL, 'Ted''s Green Machine', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Green%20Machine.wav', 200),
    (NULL, 'Ted''s Rush Up', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Rush%20Up.wav', 200),
    (NULL, 'Ted''s Utopia', NULL, NULL, 0.5, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Utopia.wav', 200);

    -- Insert Stock entries 
    INSERT INTO Stock (StockQuantity, ProductID) VALUES
    (100, 1),  -- Jimmy Jungle
    (100, 2),  -- Midnight Haunt
    (100, 3),  -- Protectors
    (100, 4),  -- Red Hood
    (200, 5),  -- Selected Electronic Works (full album ZIP)
    -- Individual songs (Product IDs 6-52)
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
    INSERT INTO AudioFeatures (ProductID, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, Genre, Mood, Key_Signature, TimeSignature, Duration, SpectralCentroid, SpectralRolloff, ZeroCrossingRate, MfccMean, ChromaMean) VALUES
    (6, 117.45, 0.168, 1.0, 0.584, 1.0, 0.874, -69.04, 0.126, 'Pop', 'Neutral', 'C', '4/4', 30, 1722.19, 3584.83, 0.0632, '[-291.7796630859375, 111.64028930664062, 48.19269561767578, 14.828948974609375, 1.358401894569397, 8.407594680786133, 4.571701526641846, 9.025636672973633, 3.417975902557373, 6.400054931640625, 1.8948384523391724, 1.1143864393234253, -1.3582206964492798]', '[0.8696908950805664, 0.5900623202323914, 0.44574981927871704, 0.40920647978782654, 0.42403730750083923, 0.3584105968475342, 0.3536975383758545, 0.47110438346862793, 0.42281636595726013, 0.4094597399234772, 0.45202934741973877, 0.5952065587043762]'),
    (7, 80.75, 0.318, 1.0, 0.464, 1.0, 0.928, -56.39, 0.072, 'Ambient', 'Neutral', 'G', '4/4', 30, 1121.95, 2261.08, 0.0359, '[-160.5883331298828, 154.20309448242188, 6.3192338943481445, 39.80005645751953, 11.498737335205078, 10.888457298278809, 3.7194249629974365, 7.480372905731201, 1.5592849254608154, 9.576579093933105, 3.297532320022583, 2.85922908782959, -2.3978922367095947]', '[0.4899479150772095, 0.4097428023815155, 0.3703620433807373, 0.3697986304759979, 0.41869351267814636, 0.4767346978187561, 0.4084570109844208, 0.5346569418907166, 0.4780023992061615, 0.48205694556236267, 0.5121042728424072, 0.5257125496864319]'),
    (8, 0.0, 0.1, 0.147, 0.168, 1.0, 0.927, -77.18, 0.073, 'Ambient', 'Calm', 'F#', '4/4', 30, 427.85, 544.56, 0.0367, '[-498.8492736816406, 157.57118225097656, 76.0373306274414, 8.46163558959961, -19.200679779052734, -23.63567352294922, -28.274229049682617, -36.56103515625, -39.56654739379883, -33.278038024902344, -22.332683563232422, -14.160150527954102, -12.939478874206543]', '[0.25219181180000305, 0.1900118887424469, 0.0725824162364006, 0.21958181262016296, 0.05029677227139473, 0.12331201136112213, 0.6893225312232971, 0.4777854382991791, 0.12202893197536469, 0.1776473969221115, 0.5485554337501526, 0.19877542555332184]'),
    (9, 136.0, 0.21, 1.0, 0.843, 0.999, 0.672, -58.5, 0.328, 'Pop', 'Uplifting', 'A#', '4/4', 30, 2529.68, 5621.21, 0.1638, '[-173.56605529785156, 98.32673645019531, 20.514408111572266, 18.889841079711914, 14.777070045471191, 6.647645950317383, 5.771152496337891, 10.658245086669922, 0.14356115460395813, 5.0370402336120605, -0.3565865755081177, 9.898202896118164, -3.9117817878723145]', '[0.5842548608779907, 0.5410041213035583, 0.5196573138237, 0.5037132501602173, 0.5226867198944092, 0.6135703325271606, 0.5325864553451538, 0.4706481695175171, 0.49802371859550476, 0.5585571527481079, 0.68015056848526, 0.589070200920105]'),
    (10, 80.75, 0.187, 1.0, 0.762, 0.999, 0.802, -64.71, 0.198, 'Ambient', 'Uplifting', 'F', '4/4', 30, 2291.16, 4872.53, 0.099, '[-224.2651824951172, 85.18619537353516, 1.8011462688446045, 36.73759841918945, 8.387452125549316, 18.134429931640625, 6.105869293212891, 6.560997486114502, 4.75814962387085, 7.528582572937012, 3.2510831356048584, 5.749767780303955, 3.087707042694092]', '[0.38694825768470764, 0.3417617380619049, 0.38960006833076477, 0.4364745318889618, 0.5009136199951172, 0.6020865440368652, 0.44727787375450134, 0.42112475633621216, 0.5123448371887207, 0.4526042640209198, 0.453020304441452, 0.3398859202861786]'),
    (11, 152.0, 0.159, 0.745, 0.318, 1.0, 0.889, -66.97, 0.111, 'Pop', 'Calm', 'A', '4/4', 30, 847.88, 1581.54, 0.0555, '[-272.8619689941406, 163.66107177734375, -8.853872299194336, 11.022202491760254, -11.258843421936035, -0.6838850378990173, -1.321034550666809, 6.201972007751465, 6.1769118309021, 5.139103412628174, -2.2383921146392822, 0.010299044661223888, 1.5301884412765503]', '[0.17705383896827698, 0.23311631381511688, 0.10511835664510727, 0.14160588383674622, 0.43663346767425537, 0.20520825684070587, 0.07497718930244446, 0.06906105577945709, 0.2335778772830963, 0.5501435399055481, 0.3306853175163269, 0.324765145778656]'),
    (12, 92.29, 0.236, 1.0, 0.739, 0.999, 0.863, -59.6, 0.137, 'Ambient', 'Uplifting', 'B', '4/4', 30, 2148.9, 5034.32, 0.0687, '[-192.7371368408203, 90.75020599365234, 36.50471496582031, 31.312911987304688, 7.3049397468566895, 19.672863006591797, 6.182407855987549, 6.147857666015625, -3.6068320274353027, 4.0100483894348145, 0.14933539927005768, 11.057010650634766, 2.7568647861480713]', '[0.5351701378822327, 0.4627852439880371, 0.49195998907089233, 0.4662715196609497, 0.5080233216285706, 0.4301722049713135, 0.446509450674057, 0.4966399371623993, 0.483669638633728, 0.5673215389251709, 0.5497406721115112, 0.6479495763778687]'),
    (13, 161.5, 0.193, 1.0, 0.768, 0.999, 0.81, -65.08, 0.19, 'Pop', 'Uplifting', 'G', '4/4', 30, 2303.12, 4652.55, 0.0952, '[-274.0487976074219, 84.15977478027344, 28.312742233276367, -10.254232406616211, -23.26548957824707, -15.990490913391113, -13.9362211227417, 0.6028303503990173, 0.28409138321876526, 7.250712871551514, 1.9116779565811157, 3.5035452842712402, 4.716301918029785]', '[0.3145705759525299, 0.21121154725551605, 0.2871500253677368, 0.21425136923789978, 0.3558451533317566, 0.35404306650161743, 0.27643662691116333, 0.5539819598197937, 0.33949175477027893, 0.38817834854125977, 0.35758495330810547, 0.48471713066101074]'),
    (14, 136.0, 0.182, 1.0, 0.488, 1.0, 0.938, -70.85, 0.062, 'Pop', 'Neutral', 'A', '4/4', 30, 1385.08, 3130.71, 0.0311, '[-228.78443908691406, 116.61597442626953, 2.265329122543335, 24.30242156982422, 8.909819602966309, 12.791056632995605, 5.938939094543457, 8.34558391571045, 3.813663959503174, 5.994677543640137, 3.8269357681274414, 5.087463855743408, 3.3250732421875]', '[0.437889039516449, 0.3786918818950653, 0.3486151099205017, 0.3111702501773834, 0.43505769968032837, 0.2890703082084656, 0.30479612946510315, 0.4912731945514679, 0.5314133763313293, 0.6521323323249817, 0.4925881624221802, 0.43442872166633606]'),
    (15, 112.35, 0.257, 1.0, 0.553, 1.0, 0.887, -65.53, 0.113, 'Pop', 'Neutral', 'C', '4/4', 30, 1502.17, 3165.63, 0.0565, '[-262.2541809082031, 127.989990234375, 36.87516784667969, 18.66297149658203, 1.878906488418579, 1.5694676637649536, -1.4080363512039185, -10.532339096069336, -12.458942413330078, -0.978935956954956, -0.3932969272136688, 4.8248090744018555, 8.377914428710938]', '[0.6288642287254333, 0.2211882621049881, 0.12872323393821716, 0.24087172746658325, 0.37786272168159485, 0.1641283631324768, 0.1252022534608841, 0.12143480777740479, 0.15362414717674255, 0.30756714940071106, 0.22155874967575073, 0.24811112880706787]'),
    (16, 129.2, 0.272, 1.0, 1.0, 0.999, 0.784, -57.63, 0.216, 'Pop', 'Uplifting', 'A#', '4/4', 30, 3146.82, 6556.56, 0.108, '[-173.13739013671875, 34.45747756958008, 28.51560401916504, 34.05729675292969, 11.609046936035156, 21.3087158203125, 12.639996528625488, 12.151270866394043, -0.04745180904865265, 9.126513481140137, 1.7712595462799072, 7.550595283508301, 0.26206251978874207]', '[0.5958716869354248, 0.6071217656135559, 0.5532503128051758, 0.5172086358070374, 0.5691881775856018, 0.6215564012527466, 0.6377961039543152, 0.6667459011077881, 0.7141227126121521, 0.7796722650527954, 0.783641517162323, 0.6435062289237976]'),
    (17, 112.35, 0.14, 1.0, 0.657, 1.0, 0.736, -59.99, 0.264, 'Pop', 'Uplifting', 'G#', '4/4', 30, 2004.54, 3494.78, 0.1319, '[-142.93064880371094, 120.18232727050781, -58.5262451171875, 30.326322555541992, 0.7238056659698486, -12.0706205368042, -0.528459370136261, -14.991065979003906, -4.75360631942749, 6.931060314178467, -4.71026611328125, -1.4554388523101807, -0.5561707019805908]', '[0.39047208428382874, 0.3156321048736572, 0.2801606357097626, 0.2788583040237427, 0.27005183696746826, 0.3384007215499878, 0.6471388339996338, 0.6640409231185913, 0.7899218797683716, 0.7332120537757874, 0.5300521850585938, 0.4873393177986145]'),
    (18, 92.29, 0.267, 1.0, 0.679, 0.999, 0.86, -57.42, 0.14, 'Ambient', 'Uplifting', 'A#', '4/4', 30, 1908.07, 4277.34, 0.0701, '[-138.92984008789062, 125.23304748535156, 24.38108253479004, 13.790332794189453, -6.302806854248047, 0.11525827646255493, -4.646751403808594, 3.302084445953369, -2.9362921714782715, 2.1210250854492188, -1.0549159049987793, 3.6283419132232666, -2.4360551834106445]', '[0.2548244595527649, 0.3047349452972412, 0.45606404542922974, 0.5467240810394287, 0.37418368458747864, 0.4737588167190552, 0.330214262008667, 0.3891018033027649, 0.2891089618206024, 0.3596288859844208, 0.6662787795066833, 0.33450889587402344]'),
    (19, 86.13, 0.163, 1.0, 0.945, 0.999, 0.639, -58.19, 0.361, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2931.59, 6334.57, 0.1807, '[-190.9525146484375, 67.5693359375, 15.864490509033203, 28.39185905456543, -0.8594546318054199, 11.9025297164917, 3.507998466491699, 9.268799781799316, 1.7546398639678955, 3.0277488231658936, 2.8171935081481934, 2.902913808822632, -0.6429049968719482]', '[0.6105232834815979, 0.6056997776031494, 0.6062938570976257, 0.5997846126556396, 0.6053524613380432, 0.5604990124702454, 0.515292227268219, 0.545059859752655, 0.5126370191574097, 0.517414927482605, 0.5654286742210388, 0.6069911122322083]'),
    (20, 129.2, 0.199, 1.0, 0.444, 1.0, 0.928, -69.34, 0.072, 'Pop', 'Neutral', 'C', '4/4', 30, 1214.5, 2459.02, 0.0362, '[-321.4566955566406, 83.47396087646484, 10.06994342803955, 17.939945220947266, -3.6801888942718506, 8.457157135009766, -0.46799659729003906, -1.729479193687439, -3.5380477905273438, -2.9204957485198975, -5.319190979003906, -1.986415982246399, -3.8233866691589355]', '[0.6574206948280334, 0.43358689546585083, 0.4657440781593323, 0.3167988359928131, 0.3043428659439087, 0.2772711515426636, 0.3064238131046295, 0.5015266537666321, 0.3546793460845947, 0.3682248294353485, 0.3395363986492157, 0.46972864866256714]'),
    (21, 161.5, 0.143, 0.601, 0.186, 1.0, 0.931, -76.58, 0.069, 'Pop', 'Calm', 'F', '4/4', 30, 429.12, 532.33, 0.0343, '[-467.0399475097656, 164.8089141845703, 49.701759338378906, -11.538522720336914, -23.373971939086914, -23.43776512145996, -28.623035430908203, -33.32231521606445, -31.916704177856445, -29.925222396850586, -29.254806518554688, -27.15540885925293, -21.705883026123047]', '[0.3011215925216675, 0.13237805664539337, 0.19154193997383118, 0.15453776717185974, 0.43265652656555176, 0.44874098896980286, 0.18801575899124146, 0.4219786524772644, 0.18528281152248383, 0.3935925364494324, 0.08183491975069046, 0.09568078815937042]'),
    (22, 129.2, 0.244, 1.0, 0.65, 1.0, 0.839, -62.74, 0.161, 'Pop', 'Uplifting', 'E', '4/4', 30, 1842.72, 3721.17, 0.0805, '[-229.52503967285156, 85.82749938964844, 1.8272905349731445, 40.14368438720703, 18.076255798339844, 16.76407814025879, 3.114091634750366, 18.76078987121582, 11.630099296569824, 9.36582088470459, 7.079768180847168, 13.588314056396484, 3.4006845951080322]', '[0.39824315905570984, 0.4371740520000458, 0.5721984505653381, 0.5522675514221191, 0.6101202368736267, 0.5873247981071472, 0.5112076997756958, 0.5765299797058105, 0.5394667983055115, 0.45233455300331116, 0.408527135848999, 0.37387609481811523]'),
    (23, 129.2, 0.246, 1.0, 0.563, 1.0, 0.89, -63.1, 0.11, 'Pop', 'Neutral', 'G', '4/4', 30, 1547.24, 3208.03, 0.0548, '[-181.6957550048828, 115.22474670410156, -6.62003231048584, 17.245302200317383, -6.895037651062012, -1.3102341890335083, -7.087146282196045, -2.2928569316864014, -9.346034049987793, 0.5336925387382507, -7.27768087387085, -2.950411319732666, -11.221529960632324]', '[0.2407301664352417, 0.1755986511707306, 0.2712498605251312, 0.24079760909080505, 0.508238673210144, 0.22934836149215698, 0.22546258568763733, 0.5189747214317322, 0.2869715690612793, 0.3826887607574463, 0.2532345652580261, 0.44413289427757263]'),
    (24, 234.91, 0.263, 0.479, 0.555, 1.0, 0.901, -64.98, 0.099, 'Pop', 'Neutral', 'E', '4/4', 30, 1501.55, 3128.68, 0.0496, '[-225.29017639160156, 103.07921600341797, -12.360396385192871, 48.5952262878418, 5.550570487976074, 10.617122650146484, 10.418972969055176, 1.0992306470870972, -2.411526679992676, 5.0084004402160645, 0.6325653195381165, 3.7127044200897217, -1.4993101358413696]', '[0.3442484736442566, 0.3155421018600464, 0.3832748532295227, 0.38990020751953125, 0.46625998616218567, 0.42539840936660767, 0.3781392276287079, 0.4422891438007355, 0.3646543622016907, 0.3730652928352356, 0.38901183009147644, 0.42512691020965576]'),
    (25, 129.2, 0.157, 1.0, 0.759, 0.999, 0.778, -61.78, 0.222, 'Pop', 'Uplifting', 'C', '4/4', 30, 2321.93, 4855.42, 0.1112, '[-230.03004455566406, 101.03678131103516, 37.38475799560547, 12.480849266052246, -3.4072492122650146, 6.950671672821045, -1.5474574565887451, 6.9413065910339355, -1.1668070554733276, 4.92484712600708, -0.19639866054058075, 5.918920516967773, 1.9171746969223022]', '[0.6036909818649292, 0.5917717218399048, 0.5428410172462463, 0.5378155708312988, 0.5542932152748108, 0.5524890422821045, 0.5465303659439087, 0.5285901427268982, 0.5022811889648438, 0.5103785395622253, 0.5463094711303711, 0.5640502572059631]'),
    (26, 73.83, 0.183, 0.973, 0.506, 1.0, 0.82, -66.38, 0.18, 'Ambient', 'Neutral', 'D', '4/4', 30, 1443.37, 2549.16, 0.0899, '[-242.52249145507812, 148.96246337890625, -2.1132805347442627, 7.093379020690918, -2.0650947093963623, -0.0870782732963562, -1.4206916093826294, -2.2283856868743896, -2.055643081665039, 10.666793823242188, 8.658055305480957, 11.549274444580078, 3.4565625190734863]', '[0.4983885586261749, 0.3290005326271057, 0.5850901007652283, 0.3079705834388733, 0.45760107040405273, 0.24514628946781158, 0.19758173823356628, 0.3412892818450928, 0.20811684429645538, 0.1882881373167038, 0.19417564570903778, 0.2652498185634613]'),
    (27, 161.5, 0.263, 1.0, 0.733, 0.999, 0.706, -58.08, 0.294, 'Pop', 'Uplifting', 'E', '4/4', 30, 2091.32, 4488.33, 0.147, '[-166.0731964111328, 90.38202667236328, 1.6462254524230957, 43.3494873046875, 2.2906692028045654, 10.640787124633789, -1.549059271812439, 2.4666128158569336, -4.333460330963135, 1.5795912742614746, -0.09253109246492386, 4.702509880065918, -2.613163709640503]', '[0.5412705540657043, 0.5273578763008118, 0.573927640914917, 0.575131356716156, 0.59759122133255, 0.5449551939964294, 0.4858117699623108, 0.4144609272480011, 0.469478964805603, 0.5752701163291931, 0.5607942938804626, 0.550239086151123]'),
    (28, 92.29, 0.267, 1.0, 0.679, 0.999, 0.86, -57.42, 0.14, 'Ambient', 'Uplifting', 'A#', '4/4', 30, 1907.88, 4277.46, 0.0701, '[-138.93121337890625, 125.22777557373047, 24.388532638549805, 13.802616119384766, -6.3085198402404785, 0.11406299471855164, -4.661259651184082, 3.3237478733062744, -2.95111346244812, 2.109877347946167, -1.0496327877044678, 3.645723342895508, -2.4496371746063232]', '[0.25486302375793457, 0.3046948313713074, 0.45605483651161194, 0.5465925335884094, 0.3741708993911743, 0.47376900911331177, 0.3303375244140625, 0.3891400098800659, 0.2890961170196533, 0.3595983386039734, 0.6662951707839966, 0.3345838487148285]'),
    (29, 103.36, 0.178, 1.0, 0.668, 0.999, 0.835, -65.95, 0.165, 'Pop', 'Uplifting', 'C#', '4/4', 30, 1989.41, 4071.02, 0.0824, '[-225.74314880371094, 98.8675537109375, 18.74367332458496, 10.258077621459961, 0.6093793511390686, 1.746077537536621, -6.825586795806885, -1.959046721458435, -4.9704060554504395, -0.5223786234855652, -0.7313708662986755, 1.604599118232727, -3.6765477657318115]', '[0.4315747618675232, 0.481108158826828, 0.4554293155670166, 0.43230175971984863, 0.40751591324806213, 0.41463232040405273, 0.40717604756355286, 0.44921714067459106, 0.40641334652900696, 0.4685404896736145, 0.4391933083534241, 0.38271844387054443]'),
    (30, 161.5, 0.161, 1.0, 0.735, 0.999, 0.834, -58.97, 0.166, 'Pop', 'Uplifting', 'A', '4/4', 30, 2235.88, 4691.57, 0.083, '[-227.58119201660156, 88.05905151367188, 20.057432174682617, 26.69036102294922, 5.110052108764648, 5.863609313964844, -0.7672249674797058, 3.899847984313965, -6.461249828338623, -1.075980305671692, -4.444857597351074, -1.059238076210022, -6.027135372161865]', '[0.49975284934043884, 0.4602377712726593, 0.5243707895278931, 0.48204654455184937, 0.43907925486564636, 0.4600537121295929, 0.4444417655467987, 0.5025920867919922, 0.47112366557121277, 0.5443643927574158, 0.4926835298538208, 0.430228590965271]'),
    (31, 92.29, 0.207, 1.0, 0.509, 1.0, 0.93, -65.31, 0.07, 'Ambient', 'Neutral', 'G', '4/4', 30, 1421.32, 3156.86, 0.0352, '[-271.5086669921875, 109.86163330078125, 9.930145263671875, 39.70039749145508, 14.661646842956543, 23.213451385498047, 8.918110847473145, 11.354644775390625, -1.013602375984192, 2.0665485858917236, 0.10183574259281158, 2.1761035919189453, 1.3367997407913208]', '[0.2500382363796234, 0.2767794728279114, 0.3448828458786011, 0.3383304476737976, 0.3667006492614746, 0.4509376883506775, 0.7205297946929932, 0.8620311617851257, 0.7329983711242676, 0.5163263082504272, 0.3295186758041382, 0.2559756338596344]'),
    (32, 161.5, 0.141, 1.0, 0.857, 0.999, 0.78, -61.09, 0.22, 'Pop', 'Uplifting', 'F', '4/4', 30, 2667.46, 5212.79, 0.1099, '[-238.71932983398438, 100.74251556396484, 30.2479190826416, -10.550792694091797, 5.928128719329834, 8.204373359680176, -18.049846649169922, -5.444216728210449, -16.081649780273438, -9.924089431762695, -16.338537216186523, -6.12237548828125, -3.885561943054199]', '[0.32551109790802, 0.15525272488594055, 0.23430855572223663, 0.11970806121826172, 0.31193578243255615, 0.738298237323761, 0.28563159704208374, 0.1744471937417984, 0.09705385565757751, 0.09752323478460312, 0.31410452723503113, 0.17640194296836853]'),
    (33, 172.27, 0.137, 0.805, 0.61, 1.0, 0.874, -64.91, 0.126, 'Pop', 'Uplifting', 'A#', '4/4', 30, 1849.5, 3946.58, 0.0629, '[-235.661376953125, 104.2260513305664, -1.7475314140319824, 16.74005126953125, -3.086660861968994, 1.3579883575439453, -14.800631523132324, -8.322338104248047, -12.923495292663574, -13.343825340270996, -11.013126373291016, -12.749248504638672, -11.544975280761719]', '[0.3338605463504791, 0.22763042151927948, 0.28221940994262695, 0.3234155476093292, 0.19356438517570496, 0.37039002776145935, 0.2307712584733963, 0.3204406201839447, 0.17853645980358124, 0.19921955466270447, 0.4599728286266327, 0.2788539528846741]'),
    (34, 95.7, 0.198, 1.0, 0.493, 1.0, 0.87, -63.82, 0.13, 'Ambient', 'Neutral', 'C', '4/4', 30, 1378.91, 2547.81, 0.0648, '[-267.4826965332031, 140.6433563232422, 17.763193130493164, 19.929380416870117, 5.183872222900391, 0.5665738582611084, -2.9422571659088135, -0.6028041839599609, -7.536318778991699, -4.591829776763916, -8.156452178955078, -3.0622804164886475, -1.9345676898956299]', '[0.471657395362854, 0.33423227071762085, 0.4507348835468292, 0.31773659586906433, 0.4090750515460968, 0.33145156502723694, 0.31014400720596313, 0.41882604360580444, 0.26944997906684875, 0.2293781042098999, 0.2017759382724762, 0.3170928359031677]'),
    (35, 112.35, 0.191, 1.0, 0.891, 0.999, 0.717, -52.21, 0.283, 'Pop', 'Uplifting', 'G', '4/4', 30, 2716.79, 5335.83, 0.1414, '[-157.4423370361328, 59.0897216796875, -10.761137962341309, 32.187744140625, -9.719480514526367, 17.09938621520996, 1.8488966226577759, 13.038954734802246, 3.982470989227295, 9.97581958770752, 2.073711633682251, 6.32275915145874, 2.696228504180908]', '[0.5810218453407288, 0.6075080037117004, 0.5920848846435547, 0.5662544965744019, 0.6154308915138245, 0.6413843631744385, 0.6161876320838928, 0.6824857592582703, 0.6780517101287842, 0.6170714497566223, 0.5783917903900146, 0.5366066694259644]'),
    (36, 112.35, 0.249, 1.0, 0.451, 1.0, 0.902, -64.9, 0.098, 'Pop', 'Neutral', 'F#', '4/4', 30, 1172.53, 2377.87, 0.0488, '[-194.89620971679688, 142.08766174316406, -11.670411109924316, 27.776750564575195, 8.415875434875488, 0.22444573044776917, -15.918801307678223, -6.244618892669678, -23.637779235839844, -16.31099510192871, -18.052541732788086, -10.575477600097656, -9.886528015136719]', '[0.31969910860061646, 0.2535199522972107, 0.15870699286460876, 0.299234539270401, 0.2251080721616745, 0.26132577657699585, 0.70527184009552, 0.49367421865463257, 0.3171159327030182, 0.33802592754364014, 0.566044270992279, 0.39804115891456604]'),
    (37, 60.09, 0.096, 0.742, 0.74, 0.999, 0.804, -58.33, 0.196, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2338.57, 4998.79, 0.0981, '[-266.7823791503906, 114.87069702148438, 23.192827224731445, -29.746196746826172, -30.627727508544922, 26.4716739654541, -30.212554931640625, 2.2564938068389893, -17.970626831054688, -12.4765625, -6.365811824798584, -15.352508544921875, -0.18143826723098755]', '[0.4170452356338501, 0.1770874261856079, 0.27403128147125244, 0.0933380201458931, 0.22397884726524353, 0.22711455821990967, 0.1546875387430191, 0.3163444399833679, 0.1657695472240448, 0.40530234575271606, 0.11417566239833832, 0.1964331418275833]'),
    (38, 92.29, 0.314, 1.0, 0.832, 0.999, 0.839, -58.19, 0.161, 'Ambient', 'Uplifting', 'C', '4/4', 30, 2353.98, 5312.02, 0.0807, '[-160.01153564453125, 82.46275329589844, 21.512065887451172, 0.7471680045127869, -9.585063934326172, -0.09471894800662994, -9.580475807189941, -2.216367244720459, -11.572237968444824, -1.553678274154663, -8.768304824829102, 0.6265639662742615, -0.5768996477127075]', '[0.6300705671310425, 0.30306705832481384, 0.3736170530319214, 0.18893954157829285, 0.19507603347301483, 0.2769027650356293, 0.18002751469612122, 0.2695574462413788, 0.24370355904102325, 0.41176852583885193, 0.2732435166835785, 0.29108932614326477]'),
    (39, 123.05, 0.235, 0.958, 0.263, 1.0, 0.96, -73.74, 0.04, 'Pop', 'Calm', 'A#', '4/4', 30, 564.45, 920.97, 0.0201, '[-283.7353210449219, 170.39903259277344, 31.53995132446289, 14.545334815979004, 10.365283012390137, 16.007051467895508, 10.928388595581055, -5.628076553344727, -4.682980537414551, 8.59101390838623, 3.533684492111206, -1.287199854850769, 1.0956929922103882]', '[0.5210503935813904, 0.5079589486122131, 0.4522857069969177, 0.41227424144744873, 0.4131820797920227, 0.5296168327331543, 0.46920132637023926, 0.4791540503501892, 0.4065065085887909, 0.47333666682243347, 0.6629228591918945, 0.5293142795562744]'),
    (40, 117.45, 0.113, 1.0, 0.877, 0.999, 0.84, -65.66, 0.16, 'Pop', 'Uplifting', 'C', '4/4', 30, 2772.4, 5332.76, 0.0798, '[-352.236572265625, 57.73606872558594, 56.82722854614258, -6.987407684326172, -52.6755256652832, -4.893746852874756, -46.685340881347656, -8.978119850158691, -25.231447219848633, -14.852683067321777, -2.382296323776245, -9.081103324890137, 4.606204032897949]', '[0.35173091292381287, 0.12139460444450378, 0.1958344429731369, 0.05999745801091194, 0.15997889637947083, 0.22795625030994415, 0.11724710464477539, 0.24727077782154083, 0.1253698319196701, 0.3433755040168762, 0.0778290331363678, 0.08090963959693909]'),
    (41, 112.35, 0.314, 1.0, 1.0, 0.999, 0.653, -49.5, 0.347, 'Pop', 'Uplifting', 'C', '4/4', 30, 3802.65, 7300.53, 0.1735, '[-76.34330749511719, 32.40485763549805, 13.599586486816406, 21.95585823059082, -6.032222747802734, 4.243138313293457, -3.4958457946777344, 7.5853095054626465, -0.2751672565937042, 3.300969362258911, -2.3368139266967773, 2.8297924995422363, -0.5515689253807068]', '[0.6750797033309937, 0.6143837571144104, 0.6080952882766724, 0.4904710650444031, 0.5373260974884033, 0.41959965229034424, 0.40791457891464233, 0.45994794368743896, 0.4623536467552185, 0.5038093328475952, 0.46575596928596497, 0.5825899243354797]'),
    (42, 112.35, 0.181, 1.0, 0.584, 1.0, 0.876, -63.42, 0.124, 'Pop', 'Neutral', 'A', '4/4', 30, 1704.25, 3612.22, 0.0621, '[-249.3046112060547, 118.12415313720703, 29.1572322845459, 11.355780601501465, 4.455151557922363, 13.427360534667969, 13.974187850952148, 8.535768508911133, -0.5622356534004211, 4.611128330230713, 6.649289131164551, 7.747580528259277, 2.2355141639709473]', '[0.5889636874198914, 0.49288567900657654, 0.48974713683128357, 0.505031168460846, 0.5920227766036987, 0.5210939049720764, 0.48886021971702576, 0.5435883402824402, 0.6154493093490601, 0.7461037635803223, 0.6427513360977173, 0.5908897519111633]'),
    (43, 117.45, 0.212, 1.0, 0.65, 1.0, 0.858, -66.77, 0.142, 'Pop', 'Uplifting', 'C', '4/4', 30, 1882.64, 3912.38, 0.071, '[-259.2496032714844, 115.18919372558594, 48.20033645629883, 10.076486587524414, -0.4493342936038971, 1.4229695796966553, -5.363617420196533, -3.8235888481140137, -9.083013534545898, -0.6521145105361938, -4.006403923034668, -3.3024051189422607, -7.933320999145508]', '[0.5106347799301147, 0.3068524897098541, 0.24305467307567596, 0.23844562470912933, 0.24868641793727875, 0.3123791217803955, 0.2634906768798828, 0.3120753765106201, 0.4582749605178833, 0.33673420548439026, 0.2709813416004181, 0.3103065490722656]'),
    (44, 129.2, 0.199, 1.0, 0.526, 1.0, 0.885, -68.73, 0.115, 'Pop', 'Neutral', 'D', '4/4', 30, 1486.79, 2944.74, 0.0573, '[-307.00274658203125, 88.12306213378906, -10.555253028869629, 8.402239799499512, -3.384913444519043, -2.183814287185669, -1.897255301475525, -3.946942090988159, -5.556814670562744, 1.948857069015503, 2.1084444522857666, 12.85062026977539, 10.08440113067627]', '[0.21029190719127655, 0.2643119990825653, 0.5670538544654846, 0.26426100730895996, 0.38535988330841064, 0.14941823482513428, 0.10864728689193726, 0.13519148528575897, 0.22600644826889038, 0.46017542481422424, 0.2332116663455963, 0.20703668892383575]'),
    (45, 143.55, 0.423, 1.0, 0.721, 1.0, 0.846, -59.63, 0.154, 'Pop', 'Uplifting', 'C', '4/4', 30, 1841.02, 3447.75, 0.077, '[-109.48234558105469, 94.95707702636719, -31.701160430908203, 27.3882999420166, 25.930099487304688, 21.846858978271484, -1.455260992050171, 19.848285675048828, 15.284566879272461, 10.927695274353027, 1.1326582431793213, 7.876308917999268, 8.812941551208496]', '[0.8686000108718872, 0.6449214816093445, 0.4722899794578552, 0.37390920519828796, 0.31705716252326965, 0.30577367544174194, 0.31840938329696655, 0.3897404670715332, 0.43445008993148804, 0.5074833035469055, 0.5909214019775391, 0.7950334548950195]'),
    (46, 123.05, 0.183, 0.953, 0.256, 1.0, 0.94, -70.1, 0.06, 'Pop', 'Calm', 'A#', '4/4', 30, 609.73, 1061.64, 0.0299, '[-272.4412841796875, 204.6283416748047, 12.907596588134766, 12.979703903198242, 10.926217079162598, 12.283960342407227, 6.128424167633057, -11.936955451965332, -15.20096206665039, 3.0426549911499023, -0.42271706461906433, -7.194949626922607, -0.6042980551719666]', '[0.2820591628551483, 0.3686644434928894, 0.3964923024177551, 0.40877765417099, 0.41865137219429016, 0.6342874765396118, 0.43631431460380554, 0.46161091327667236, 0.32129210233688354, 0.39297130703926086, 0.7107685208320618, 0.3531147539615631]'),
    (47, 172.27, 0.232, 1.0, 0.817, 0.999, 0.765, -60.53, 0.235, 'Pop', 'Uplifting', 'E', '4/4', 30, 2413.98, 5027.39, 0.1173, '[-171.49830627441406, 75.40415954589844, 4.283688545227051, 21.175676345825195, -3.938417673110962, 6.120541095733643, -3.7797341346740723, 2.7552988529205322, -4.567434310913086, 0.5475161671638489, -5.04701566696167, 1.4085426330566406, -4.220250606536865]', '[0.3692547380924225, 0.3311229646205902, 0.39772921800613403, 0.3021676242351532, 0.6014440655708313, 0.3666602671146393, 0.24915818870067596, 0.30020636320114136, 0.2847343385219574, 0.305171400308609, 0.22053253650665283, 0.2950628697872162]'),
    (48, 152.0, 0.204, 1.0, 0.538, 1.0, 0.901, -64.92, 0.099, 'Pop', 'Neutral', 'A#', '4/4', 30, 1520.3, 3478.45, 0.0495, '[-240.7470703125, 121.95928955078125, 37.98905944824219, 18.72100257873535, 8.451420783996582, 15.08006477355957, 2.29850697517395, -5.420319557189941, -10.024087905883789, 3.6150128841400146, -1.5767205953598022, -2.5911104679107666, -3.30161190032959]', '[0.49419698119163513, 0.5047644376754761, 0.443084716796875, 0.38069742918014526, 0.37025022506713867, 0.5254553556442261, 0.46430784463882446, 0.4758013188838959, 0.3455214500427246, 0.42490553855895996, 0.6670576333999634, 0.5070171356201172]'),
    (49, 152.0, 0.264, 1.0, 0.792, 0.999, 0.791, -67.07, 0.209, 'Pop', 'Uplifting', 'A', '4/4', 30, 2288.0, 4430.66, 0.1047, '[-286.66632080078125, 38.71942138671875, 18.527908325195312, 19.841176986694336, 1.9276294708251953, 21.241321563720703, 16.509519577026367, 18.771135330200195, 5.2492995262146, 5.153302192687988, 4.007015228271484, 9.117924690246582, 3.771967649459839]', '[0.5157131552696228, 0.3919723331928253, 0.5232332348823547, 0.3934495151042938, 0.4416239857673645, 0.34701159596443176, 0.3343859314918518, 0.40570324659347534, 0.47960519790649414, 0.5679232478141785, 0.4720793068408966, 0.46161291003227234]'),
    (50, 152.0, 0.258, 1.0, 0.879, 0.999, 0.722, -67.27, 0.278, 'Pop', 'Uplifting', 'A', '4/4', 30, 2586.07, 4570.36, 0.1391, '[-272.3420104980469, 61.48999786376953, 21.200122833251953, 11.606897354125977, 3.30566143989563, 12.312470436096191, 7.136586666107178, 10.060385704040527, 1.9929157495498657, 5.445714473724365, 1.6913377046585083, 6.769577980041504, 2.805314540863037]', '[0.5814855098724365, 0.47137758135795593, 0.5605788230895996, 0.4390503466129303, 0.45628678798675537, 0.3846089243888855, 0.3481903076171875, 0.4313163161277771, 0.5147925615310669, 0.5880628824234009, 0.5393430590629578, 0.5465788245201111]'),
    (51, 95.7, 0.2, 1.0, 0.41, 1.0, 0.863, -64.95, 0.137, 'Ambient', 'Neutral', 'C', '4/4', 30, 1099.42, 2375.89, 0.0687, '[-237.49085998535156, 160.451416015625, -1.541104793548584, 42.720943450927734, -0.056724902242422104, 10.997356414794922, -1.6006414890289307, 2.5700948238372803, -0.48588716983795166, 3.060793399810791, 3.8757898807525635, 4.658009052276611, 1.5896403789520264]', '[0.6485422253608704, 0.48947998881340027, 0.5955979228019714, 0.4502740204334259, 0.40570521354675293, 0.49986201524734497, 0.33034464716911316, 0.32214874029159546, 0.33584946393966675, 0.46725332736968994, 0.41753196716308594, 0.44607844948768616]'),
    (52, 152.0, 0.173, 1.0, 0.641, 0.999, 0.886, -66.67, 0.114, 'Pop', 'Uplifting', 'G', '4/4', 30, 1906.83, 4123.88, 0.0571, '[-282.92376708984375, 78.4372787475586, 42.36942672729492, 25.68995475769043, -1.2356218099594116, 2.3052492141723633, -4.264464378356934, -2.8364341259002686, -9.858209609985352, -3.923865556716919, -8.017931938171387, 2.1730828285217285, -2.04483962059021]', '[0.32521435618400574, 0.19111089408397675, 0.2374718189239502, 0.282488614320755, 0.21076102554798126, 0.15377728641033173, 0.15599799156188965, 0.34585481882095337, 0.21613809466362, 0.30216553807258606, 0.3195885419845581, 0.22682666778564453]');

    -- Grant privileges to gamestore_user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO 'gamestore_user'@'%';
    FLUSH PRIVILEGES;
EOSQL
)

# Try localhost first, then remote host
echo "$SQL_COMMANDS" | mysql -u root -p"${MYSQL_ROOT_PASSWORD}" || echo "$SQL_COMMANDS" | mysql --protocol=TCP --host=db -u root -p"${MYSQL_ROOT_PASSWORD}"

echo "Database initialization complete!"
