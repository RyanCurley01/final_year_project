#!/bin/bash
set -e

echo "Initializing Game Store Database..."

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-'EOSQL'
#mysql --protocol=TCP --host=127.0.0.1 -u root -p"${MYSQL_ROOT_PASSWORD}" <<-'EOSQL'
    CREATE DATABASE IF NOT EXISTS Game_Store_System;
    USE Game_Store_System;

    -- DROP existing tables to ensure idempotent initialization
    SET FOREIGN_KEY_CHECKS = 0;
    DROP TABLE IF EXISTS GameWishlist, Purchased_Products, Sold_Products, CustomerSummary, Payments, Order_Items, Orders, Stock, Products, Accounts;
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
    INSERT INTO Products (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, albumCoverImageUrl, gameCoverImageUrl, file_url, preview_url, StockQuantity) VALUES
    -- Games
    ('Jimmy Jungle', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Jimmy Jungle Cover Image.png', 'https://jimmywheezer.itch.io/jimmy-jungle', NULL, 100),
    ('Midnight Haunt', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Midnight Haunt Cover Image.png', 'https://jimmywheezer.itch.io/midnight-haunt', NULL, 100),
    ('Protectors', NULL, 'PC', 5.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Protectors Cover Image.png', 'https://jimmywheezer.itch.io/protectors', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors video game trailer.mp4', 100),
    ('Red Hood', NULL, 'PC', 1.50, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Red Hood Cover Image.png', 'https://jimmywheezer.itch.io/red-hood', NULL, 100),

    -- Music Albums
    (NULL, 'Selected Electronic Works', NULL, NULL, 5.00, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Song_WAV_Files_For_Final_Year_Project.zip', NULL, 200),
    
    -- Individual Songs from Selected Electronic Works
    (NULL, 'Electronic Works - Alien Acid', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Acid.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Action', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Action.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Amp Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Amp Up.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Bars', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Bars.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Business', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Business.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Chilling', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Chilling.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Essence', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Essence.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Euphoria', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Euphoria.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Feels', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Feels.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Flow State', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Flow State.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Grind', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Grind.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Harmony', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Harmony.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Hyperness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Hyperness.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Joy', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Joy.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Memories', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Memories.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Mode', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Mode.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Nature', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Nature.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Ragebait', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Ragebait.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Realm', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Realm.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Sense', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Sense.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Singing', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Singing.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Soul', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Soul.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Translation', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Translation.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Turn Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Turn Up.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Upgrade', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Upgrade.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Utopia.wav', NULL, 200),
    (NULL, 'Electronic Works - Alien Wonder', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Alien Wonder.wav', NULL, 200),
    (NULL, 'Electronic Works - Extraterrestrial Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Extraterrestrial Rave.wav', NULL, 200),
    (NULL, 'Electronic Works - Find The Light', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Find The Light.wav', NULL, 200),
    (NULL, 'Electronic Works - Green Bear', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green Bear.wav', NULL, 200),
    (NULL, 'Electronic Works - Green God', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Green God.wav', NULL, 200),
    (NULL, 'Electronic Works - Intergalactic Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Intergalactic Rave.wav', NULL, 200),
    (NULL, 'Electronic Works - Mike Mix 1 (Giggity Mix)', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike Mix 1 (Giggity Mix).wav', NULL, 200),
    (NULL, 'Electronic Works - Mike''s Rave', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike''s Rave.wav', NULL, 200),
    (NULL, 'Electronic Works - Mike''s Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Mike''s Utopia.wav', NULL, 200),
    (NULL, 'Electronic Works - Soft Chaos', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Soft Chaos.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted Chilling', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted Chilling.wav', NULL, 200),
    (NULL, 'Electronic Works - Teddy Emotion', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Teddy Emotion.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Adventure', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Adventure.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Awakening', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Awakening.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Beautiful Anger', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Beautiful Anger.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Chillness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Chillness.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Deepness', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Deepness.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Dream', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Dream.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Energy', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Energy.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Green Machine', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Green Machine.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Rush Up', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Rush Up.wav', NULL, 200),
    (NULL, 'Electronic Works - Ted''s Utopia', NULL, NULL, 0.50, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted''s Utopia.wav', NULL, 200);

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

    -- Grant privileges to gamestore_user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO 'gamestore_user'@'%';
    FLUSH PRIVILEGES;

EOSQL

echo "Database initialization complete!"
