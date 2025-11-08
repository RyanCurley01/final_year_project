#!/bin/bash
set -e

echo "Initializing Game Store Database..."

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-'EOSQL'
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
    ('Jimmy Jungle', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Jimmy Jungle Cover Image.png', 'https://jimmywheezer.itch.io/jimmy-jungle', NULL, 100),
    ('Midnight Haunt', NULL, 'PC', 2.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Midnight Haunt Cover Image.png', 'https://jimmywheezer.itch.io/midnight-haunt', NULL, 100),
    ('Protectors', NULL, 'PC', 5.00, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Protectors Cover Image.png', 'https://jimmywheezer.itch.io/protectors', 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors video game trailer.mp4', 100),
    ('Red Hood', NULL, 'PC', 1.50, NULL, NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Red Hood Cover Image.png', 'https://jimmywheezer.itch.io/red-hood', NULL, 100),

    -- Music Albums
    (NULL, 'Selected Electronic Works', NULL, NULL, 5.00, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp', NULL, 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Song_WAV_Files_For_Final_Year_Project.zip', NULL, 200);

    -- Insert Stock entries 
    INSERT INTO Stock (StockQuantity, ProductID) VALUES
    (100, 1),  -- Jimmy Jungle
    (100, 2),  -- Midnight Haunt
    (100, 3),  -- Protectors
    (100, 4),  -- Red Hood
    (200, 5);  -- Selected Electronic Works

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
