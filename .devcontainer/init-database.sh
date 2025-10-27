#!/bin/bash
set -e

echo "Initializing Game Store Database..."

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS Game_Store_System;
    USE Game_Store_System;

    -- ============================================
    -- CREATE TABLES
    -- ============================================

    -- Account Table
    CREATE TABLE IF NOT EXISTS Accounts (
        AccountID INT AUTO_INCREMENT PRIMARY KEY,
        AccountName VARCHAR(100),
        AccountPhoneNumber VARCHAR(15),
        AccountEmailAddress VARCHAR(100),
        AccountPassword VARCHAR(255),
        AccountType ENUM('Manager', 'Employee', 'Customer')
    );

    -- Products Table (must be created before Orders, Stock, etc.)
    CREATE TABLE IF NOT EXISTS Products (
        ProductID INT AUTO_INCREMENT PRIMARY KEY,
        GameTitle VARCHAR(255),
        AlbumTitle VARCHAR(255),
        Platform VARCHAR(50),
        GamePrice DECIMAL(10, 2),
        AlbumPrice DECIMAL(10, 2),
        artist VARCHAR(100),
        genre VARCHAR(100),
        file_url VARCHAR(500),
        preview_url VARCHAR(500),
        StockQuantity INT UNSIGNED DEFAULT 0
    );

    -- Orders Table
    CREATE TABLE IF NOT EXISTS Orders (
        OrderID INT AUTO_INCREMENT PRIMARY KEY,
        AccountID INT,
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
        AccountID INT,
        PaymentAmount DECIMAL(10, 2),
        PaymentStatus ENUM('COMPLETED', 'UNCOMPLETED'),
        PaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
        FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
        FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID)
    );

    -- CustomerSummary Table
    CREATE TABLE IF NOT EXISTS CustomerSummary (
        CustomerSummaryID INT AUTO_INCREMENT PRIMARY KEY,
        AccountID INT,
        ProductID INT,
        OrderID INT,
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
        AccountID INT,
        ProductID INT,
        FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID),
        FOREIGN KEY(ProductID) REFERENCES Products(ProductID)
    );

    -- ============================================
    -- INSERT DUMMY DATA
    -- ============================================

    -- Insert Accounts (Managers, Employees, Customers)
    INSERT INTO Accounts (AccountName, AccountPhoneNumber, AccountEmailAddress, AccountPassword, AccountType) VALUES
    ('John Smith', '5551234567', 'john.smith@store.com', 'password123', 'Manager'),
    ('Sarah Johnson', '5552345678', 'sarah.j@store.com', 'password123', 'Employee'),
    ('Mike Wilson', '5553456789', 'mike.w@store.com', 'password123', 'Employee'),
    ('Alice Brown', '5554567890', 'alice.b@gmail.com', 'password123', 'Customer'),
    ('Bob Davis', '5555678901', 'bob.d@gmail.com', 'password123', 'Customer'),
    ('Carol White', '5556789012', 'carol.w@gmail.com', 'password123', 'Customer'),
    ('David Lee', '5557890123', 'david.l@gmail.com', 'password123', 'Customer'),
    ('Emma Garcia', '5558901234', 'emma.g@gmail.com', 'password123', 'Customer'),
    ('Frank Martinez', '5559012345', 'frank.m@gmail.com', 'password123', 'Customer'),
    ('Grace Taylor', '5550123456', 'grace.t@gmail.com', 'password123', 'Customer');

    -- Insert Products (Games and Music Albums)
    INSERT INTO Products (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, artist, genre, file_url, preview_url, StockQuantity) VALUES
    -- Games
    ('The Last Quest', NULL, 'PS5', 59.99, NULL, NULL, 'RPG', 'https://cdn.store.com/games/lastquest.zip', 'https://cdn.store.com/games/lastquest_preview.mp4', 50),
    ('Speed Racers', NULL, 'Xbox Series X', 49.99, NULL, NULL, 'Racing', 'https://cdn.store.com/games/speedracers.zip', 'https://cdn.store.com/games/speedracers_preview.mp4', 75),
    ('Mystery Island', NULL, 'Nintendo Switch', 39.99, NULL, NULL, 'Adventure', 'https://cdn.store.com/games/mysteryisland.zip', 'https://cdn.store.com/games/mysteryisland_preview.mp4', 100),
    ('Space Warriors', NULL, 'PC', 44.99, NULL, NULL, 'Shooter', 'https://cdn.store.com/games/spacewarriors.zip', 'https://cdn.store.com/games/spacewarriors_preview.mp4', 60),
    ('Fantasy Realms', NULL, 'PS5', 69.99, NULL, NULL, 'RPG', 'https://cdn.store.com/games/fantasyrealms.zip', 'https://cdn.store.com/games/fantasyrealms_preview.mp4', 40),
    ('Soccer Champions', NULL, 'Xbox Series X', 59.99, NULL, NULL, 'Sports', 'https://cdn.store.com/games/soccerchamps.zip', 'https://cdn.store.com/games/soccerchamps_preview.mp4', 80),
    ('Horror Mansion', NULL, 'PC', 34.99, NULL, NULL, 'Horror', 'https://cdn.store.com/games/horrormansion.zip', 'https://cdn.store.com/games/horrormansion_preview.mp4', 45),
    ('Battle Royale X', NULL, 'Multi-platform', 0.00, NULL, NULL, 'Shooter', 'https://cdn.store.com/games/battleroyalex.zip', 'https://cdn.store.com/games/battleroyalex_preview.mp4', 1000),
    -- Music Albums
    (NULL, 'Greatest Hits', NULL, NULL, 12.99, 'The Rockers', 'Rock', 'https://cdn.store.com/music/greatesthits.zip', 'https://cdn.store.com/music/greatesthits_preview.mp3', 200),
    (NULL, 'Summer Vibes', NULL, NULL, 9.99, 'DJ Cool', 'Electronic', 'https://cdn.store.com/music/summervibes.zip', 'https://cdn.store.com/music/summervibes_preview.mp3', 150),
    (NULL, 'Classical Masters', NULL, NULL, 14.99, 'Orchestra Symphony', 'Classical', 'https://cdn.store.com/music/classicalmasters.zip', 'https://cdn.store.com/music/classicalmasters_preview.mp3', 100),
    (NULL, 'Hip Hop Nation', NULL, NULL, 11.99, 'MC Flow', 'Hip Hop', 'https://cdn.store.com/music/hiphopnation.zip', 'https://cdn.store.com/music/hiphopnation_preview.mp3', 180),
    (NULL, 'Country Roads', NULL, NULL, 10.99, 'Johnny Boots', 'Country', 'https://cdn.store.com/music/countryroads.zip', 'https://cdn.store.com/music/countryroads_preview.mp3', 120),
    (NULL, 'Jazz Evenings', NULL, NULL, 13.99, 'Smooth Jazz Band', 'Jazz', 'https://cdn.store.com/music/jazzevenings.zip', 'https://cdn.store.com/music/jazzevenings_preview.mp3', 90),
    (NULL, 'Pop Sensation', NULL, NULL, 11.99, 'Star Singer', 'Pop', 'https://cdn.store.com/music/popsensation.zip', 'https://cdn.store.com/music/popsensation_preview.mp3', 250);

    -- Insert Stock entries
    INSERT INTO Stock (StockQuantity, ProductID) VALUES
    (50, 1),
    (75, 2),
    (100, 3),
    (60, 4),
    (40, 5),
    (80, 6),
    (45, 7),
    (1000, 8),
    (200, 9),
    (150, 10),
    (100, 11),
    (180, 12),
    (120, 13),
    (90, 14),
    (250, 15);

    -- Insert Orders
    INSERT INTO Orders (AccountID, orderDate, TotalAmount) VALUES
    (4, '2025-10-01 10:30:00', 109.97),  -- Alice Brown
    (5, '2025-10-02 14:15:00', 59.99),   -- Bob Davis
    (6, '2025-10-03 16:45:00', 94.97),   -- Carol White
    (7, '2025-10-05 11:20:00', 149.98),  -- David Lee
    (8, '2025-10-07 09:00:00', 44.98),   -- Emma Garcia
    (9, '2025-10-08 13:30:00', 199.96),  -- Frank Martinez
    (10, '2025-10-10 15:45:00', 84.97);  -- Grace Taylor

    -- Insert Order_Items
    INSERT INTO Order_Items (OrderID, ProductID, Quantity, UnitPrice) VALUES
    -- Order 1 (Alice Brown)
    (1, 1, 1, 59.99),   -- The Last Quest
    (1, 2, 1, 49.99),   -- Speed Racers
    -- Order 2 (Bob Davis)
    (2, 3, 1, 39.99),   -- Mystery Island
    (2, 10, 2, 9.99),   -- Summer Vibes x2
    -- Order 3 (Carol White)
    (3, 4, 1, 44.99),   -- Space Warriors
    (3, 2, 1, 49.99),   -- Speed Racers
    -- Order 4 (David Lee)
    (4, 5, 1, 69.99),   -- Fantasy Realms
    (4, 6, 1, 59.99),   -- Soccer Champions
    (4, 10, 2, 9.99),   -- Summer Vibes x2
    -- Order 5 (Emma Garcia)
    (5, 9, 2, 12.99),   -- Greatest Hits x2
    (5, 11, 1, 14.99),  -- Classical Masters
    (5, 7, 1, 34.99),   -- Horror Mansion
    -- Order 6 (Frank Martinez)
    (6, 1, 2, 59.99),   -- The Last Quest x2
    (6, 5, 1, 69.99),   -- Fantasy Realms
    (6, 13, 1, 10.99),  -- Country Roads
    -- Order 7 (Grace Taylor)
    (7, 12, 3, 11.99),  -- Hip Hop Nation x3
    (7, 14, 2, 13.99),  -- Jazz Evenings x2
    (7, 3, 1, 39.99);   -- Mystery Island

    -- Insert Payments
    INSERT INTO Payments (OrderID, ProductID, AccountID, PaymentAmount, PaymentStatus, PaymentDateAndTime) VALUES
    (1, 1, 4, 59.99, 'COMPLETED', '2025-10-01 10:35:00'),
    (1, 2, 4, 49.99, 'COMPLETED', '2025-10-01 10:35:00'),
    (2, 3, 5, 39.99, 'COMPLETED', '2025-10-02 14:20:00'),
    (2, 10, 5, 19.98, 'COMPLETED', '2025-10-02 14:20:00'),
    (3, 4, 6, 44.99, 'COMPLETED', '2025-10-03 16:50:00'),
    (3, 2, 6, 49.99, 'COMPLETED', '2025-10-03 16:50:00'),
    (4, 5, 7, 69.99, 'COMPLETED', '2025-10-05 11:25:00'),
    (4, 6, 7, 59.99, 'COMPLETED', '2025-10-05 11:25:00'),
    (4, 10, 7, 19.98, 'COMPLETED', '2025-10-05 11:25:00'),
    (5, 9, 8, 25.98, 'COMPLETED', '2025-10-07 09:05:00'),
    (5, 11, 8, 14.99, 'COMPLETED', '2025-10-07 09:05:00'),
    (5, 7, 8, 34.99, 'UNCOMPLETED', '2025-10-07 09:05:00'),
    (6, 1, 9, 119.98, 'COMPLETED', '2025-10-08 13:35:00'),
    (6, 5, 9, 69.99, 'COMPLETED', '2025-10-08 13:35:00'),
    (6, 13, 9, 10.99, 'COMPLETED', '2025-10-08 13:35:00'),
    (7, 12, 10, 35.97, 'COMPLETED', '2025-10-10 15:50:00'),
    (7, 14, 10, 27.98, 'COMPLETED', '2025-10-10 15:50:00'),
    (7, 3, 10, 39.99, 'COMPLETED', '2025-10-10 15:50:00');

    -- Insert CustomerSummary
    INSERT INTO CustomerSummary (AccountID, ProductID, OrderID) VALUES
    (4, 1, 1),
    (4, 2, 1),
    (5, 3, 2),
    (5, 10, 2),
    (6, 4, 3),
    (6, 2, 3),
    (7, 5, 4),
    (7, 6, 4),
    (7, 10, 4),
    (8, 9, 5),
    (8, 11, 5),
    (8, 7, 5),
    (9, 1, 6),
    (9, 5, 6),
    (9, 13, 6),
    (10, 12, 7),
    (10, 14, 7),
    (10, 3, 7);

    -- Insert Sold_Products
    INSERT INTO Sold_Products (OrderItemID, ProductID) VALUES
    (1, 1),
    (2, 2),
    (3, 3),
    (4, 10),
    (5, 4),
    (6, 2),
    (7, 5),
    (8, 6),
    (9, 10),
    (10, 9),
    (11, 11),
    (13, 1),
    (14, 5),
    (15, 13),
    (16, 12),
    (17, 14),
    (18, 3);

    -- Insert Purchased_Products
    INSERT INTO Purchased_Products (OrderItemID, ProductID) VALUES
    (1, 1),
    (2, 2),
    (3, 3),
    (4, 10),
    (5, 4),
    (6, 2),
    (7, 5),
    (8, 6),
    (9, 10),
    (10, 9),
    (11, 11),
    (12, 7),
    (13, 1),
    (14, 5),
    (15, 13),
    (16, 12),
    (17, 14),
    (18, 3);

    -- Insert GameWishlist
    INSERT INTO GameWishlist (AccountID, ProductID) VALUES
    (4, 5),   -- Alice wants Fantasy Realms
    (4, 6),   -- Alice wants Soccer Champions
    (5, 1),   -- Bob wants The Last Quest
    (6, 7),   -- Carol wants Horror Mansion
    (7, 8),   -- David wants Battle Royale X
    (8, 4),   -- Emma wants Space Warriors
    (9, 3),   -- Frank wants Mystery Island
    (10, 15); -- Grace wants Pop Sensation

    -- Grant privileges to gamestore_user
    GRANT ALL PRIVILEGES ON Game_Store_System.* TO 'gamestore_user'@'%';
    FLUSH PRIVILEGES;

EOSQL

echo "Database initialization complete!"
