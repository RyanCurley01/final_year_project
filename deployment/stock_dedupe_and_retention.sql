-- One-time Stock cleanup + retention schema hardening
-- Run inside Game_Store_System

-- 1) Keep only the newest Stock row per ProductID
DELETE s1
FROM Stock s1
JOIN Stock s2
  ON s1.ProductID = s2.ProductID
 AND s1.StockID < s2.StockID;

-- 2) Ensure columns needed by refresh retention logic exist
SET @has_is_available := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Stock'
    AND COLUMN_NAME = 'IsAvailable'
);
SET @sql := IF(
  @has_is_available = 0,
  'ALTER TABLE Stock ADD COLUMN IsAvailable TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_unavailable_since := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Stock'
    AND COLUMN_NAME = 'UnavailableSince'
);
SET @sql := IF(
  @has_unavailable_since = 0,
  'ALTER TABLE Stock ADD COLUMN UnavailableSince DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_available_since := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Stock'
    AND COLUMN_NAME = 'AvailableSince'
);
SET @sql := IF(
  @has_available_since = 0,
  'ALTER TABLE Stock ADD COLUMN AvailableSince DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Ensure one Stock row per product going forward
SET @has_idx_stock_product := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Stock'
    AND INDEX_NAME = 'idx_stock_product'
);
SET @sql := IF(
  @has_idx_stock_product = 0,
  'ALTER TABLE Stock ADD UNIQUE KEY idx_stock_product (ProductID)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Backfill UnavailableSince on currently unavailable rows
UPDATE Stock
SET UnavailableSince = COALESCE(UnavailableSince, NOW())
WHERE IsAvailable = 0;

-- 5) Backfill AvailableSince on currently available rows
UPDATE Stock
SET AvailableSince = COALESCE(AvailableSince, NOW())
WHERE IsAvailable = 1;
