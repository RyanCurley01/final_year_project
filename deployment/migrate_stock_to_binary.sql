-- Migrate Stock table from quantity-based to binary availability model
-- Also remove StockQuantity from Products table

-- 1. Drop the old Stock data and column, add new column
ALTER TABLE Stock DROP COLUMN StockQuantity;
ALTER TABLE Stock ADD COLUMN IsAvailable BOOLEAN NOT NULL DEFAULT 1;

-- 2. Remove StockQuantity from Products table (no longer needed)
ALTER TABLE Products DROP COLUMN StockQuantity;

-- 3. Populate availability for all products (~95% available, ~5% unavailable)
UPDATE Stock SET IsAvailable = CASE WHEN RAND() < 0.05 THEN 0 ELSE 1 END;
