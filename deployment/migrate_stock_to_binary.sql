-- Migrate Stock table from quantity-based to binary availability model
-- Also remove StockQuantity from Products table

-- 1. Drop the old Stock data and column, add new column
ALTER TABLE Stock DROP COLUMN StockQuantity;
ALTER TABLE Stock ADD COLUMN IsAvailable BOOLEAN NOT NULL DEFAULT 1;

-- 2. Remove StockQuantity from Products table (no longer needed)
ALTER TABLE Products DROP COLUMN StockQuantity;

-- 3. Ensure one Stock row per product (required for ON DUPLICATE KEY UPDATE)
ALTER TABLE Stock ADD UNIQUE INDEX idx_stock_product (ProductID);

-- 4. Populate availability based on real product data
-- (see populate_stock.sql for the full logic)
UPDATE Stock SET IsAvailable = 1;
