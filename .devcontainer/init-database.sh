#!/bin/bash
set -e

echo "Initializing Game Store Database..."

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-'EOSQL'
    CREATE DATABASE IF NOT EXISTS Game_Store_System;
    USE Game_Store_System;

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
        PaymentStatus ENUM('COMPLETED', 'UNCOMPLETED'),
        PaymentDateAndTime DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(OrderID) REFERENCES Orders(OrderID),
        FOREIGN KEY(ProductID) REFERENCES Products(ProductID),
        FOREIGN KEY(AccountID) REFERENCES Accounts(AccountID)
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
    -- All passwords are BCrypt hashed version of 'password123'
    INSERT INTO Accounts (AccountName, AccountPhoneNumber, AccountEmailAddress, AccountPassword, AccountType) VALUES
    ('John Smith', '5551234567', 'john.smith@store.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Manager'),
    ('Sarah Johnson', '5552345678', 'sarah.j@store.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Employee'),
    ('Mike Wilson', '5553456789', 'mike.w@store.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Employee'),
    ('Alice Brown', '5554567890', 'alice.b@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer'),
    ('Bob Davis', '5555678901', 'bob.d@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer'),
    ('Carol White', '5556789012', 'carol.w@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer'),
    ('David Lee', '5557890123', 'david.l@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer'),
    ('Emma Garcia', '5558901234', 'emma.g@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer'),
    ('Frank Martinez', '5559012345', 'frank.m@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer'),
    ('Grace Taylor', '5550123456', 'grace.t@gmail.com', '$2a$10$2.9guWus3aeN2wJSpK42KexyGnXDSnWl/do8L1A2CIQdLTCCe2ioa', 'Customer');

    -- Insert Products (Games and Music Albums)
    INSERT INTO Products (GameTitle, AlbumTitle, Platform, GamePrice, AlbumPrice, albumCoverImageUrl, gameCoverImageUrl, file_url, preview_url, StockQuantity) VALUES
    -- Games
    ('Jimmy Jungle', NULL, 'PC', 2.00, NULL, NULL, 'RPG', 'https://cdn.store.com/games/jimmyjungle.zip', 'https://cdn.store.com/games/jimmyjungle_preview.mp4', 50),
    ('Midnight Haunt', NULL, 'PC', 2.00, NULL, NULL, 'Racing', 'https://cdn.store.com/games/midnightracers.zip', 'https://cdn.store.com/games/midnightracers_preview.mp4', 75),
    ('Protectors', NULL, 'PC', 5.00, NULL, NULL, 'Adventure', 'https://cdn.store.com/games/protectors.zip', 'https://cdn.store.com/games/protectors_preview.mp4', 100),
    ('Red Hood', NULL, 'PC', 1.50, NULL, NULL, 'Shooter', 'https://cdn.store.com/games/redhood.zip', 'https://cdn.store.com/games/redhood_preview.mp4', 60),

    -- Music Albums
    (NULL, 'Selected Electronic Works', NULL, NULL, 5.00, 'INSERT URL TO ALBUM COVER IMAGE HERE', 'INSERT URL TO GAME COVER IMAGE HERE', 'https://cdn.store.com/music/selectedelectronicworks.zip', 'https://cdn.store.com/music/selectedelectronicworks_preview.mp3', 200),

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
