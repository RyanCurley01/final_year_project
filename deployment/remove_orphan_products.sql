-- Remove products from Products table that have no matching AudioFeatures entry
-- This brings Products count from 326 down to 279 to match AudioFeatures

USE Game_Store_System;

-- Step 1: Check for foreign key references to these orphan products
SELECT 'Checking for FK references to orphan products...' AS Status;

SELECT 'Order_Items references' AS TableCheck, COUNT(*) AS RefCount
FROM Order_Items oi
WHERE oi.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'Payments references' AS TableCheck, COUNT(*) AS RefCount
FROM Payments pay
WHERE pay.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'Stock references' AS TableCheck, COUNT(*) AS RefCount
FROM Stock s
WHERE s.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'Wishlist references' AS TableCheck, COUNT(*) AS RefCount
FROM Wishlist w
WHERE w.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'Sold_Products references' AS TableCheck, COUNT(*) AS RefCount
FROM Sold_Products sp
WHERE sp.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'Purchased_Products references' AS TableCheck, COUNT(*) AS RefCount
FROM Purchased_Products pp
WHERE pp.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'CustomerSummary references' AS TableCheck, COUNT(*) AS RefCount
FROM CustomerSummary cs
WHERE cs.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'UserInteractions references' AS TableCheck, COUNT(*) AS RefCount
FROM UserInteractions ui
WHERE ui.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SELECT 'UserRecommendations references' AS TableCheck, COUNT(*) AS RefCount
FROM UserRecommendations ur
WHERE ur.ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

-- Step 2: Show the orphan products that will be deleted
SELECT 'Products to be DELETED (no AudioFeatures match):' AS Status;
SELECT p.ProductID, p.AlbumTitle
FROM Products p
LEFT JOIN AudioFeatures af ON p.ProductID = af.ProductID
WHERE af.ProductID IS NULL
ORDER BY p.ProductID;

-- Step 3: Delete orphan products (those with no AudioFeatures entry)
-- First remove any FK references in dependent tables
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM Stock WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);
DELETE FROM Wishlist WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);
DELETE FROM Sold_Products WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);
DELETE FROM Purchased_Products WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);
DELETE FROM UserInteractions WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);
DELETE FROM UserRecommendations WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

-- Now delete the orphan products
DELETE FROM Products
WHERE ProductID NOT IN (SELECT ProductID FROM AudioFeatures);

SET FOREIGN_KEY_CHECKS = 1;

-- Step 4: Verify counts match
SELECT 'AFTER cleanup:' AS Status;
SELECT COUNT(*) AS ProductsCount FROM Products;
SELECT COUNT(*) AS AudioFeaturesCount FROM AudioFeatures;
SELECT COUNT(*) AS OrphanProducts
FROM Products p
LEFT JOIN AudioFeatures af ON p.ProductID = af.ProductID
WHERE af.ProductID IS NULL;
