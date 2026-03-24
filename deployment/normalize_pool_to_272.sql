USE Game_Store_System;

-- Keep at most 225 imported iTunes rows (negative ProductID), newest first.
CREATE TEMPORARY TABLE keep_imported_ids AS
SELECT ProductID
FROM AudioFeatures
WHERE ProductID < 0
ORDER BY UpdatedAt DESC, FeatureID DESC
LIMIT 225;

DELETE af
FROM AudioFeatures af
LEFT JOIN keep_imported_ids k ON k.ProductID = af.ProductID
WHERE af.ProductID < 0
  AND k.ProductID IS NULL;

DROP TEMPORARY TABLE keep_imported_ids;

-- Remove Stock and Products rows that no longer have AudioFeatures.
DELETE s
FROM Stock s
LEFT JOIN AudioFeatures af ON af.ProductID = s.ProductID
WHERE af.ProductID IS NULL;

DELETE p
FROM Products p
LEFT JOIN AudioFeatures af ON af.ProductID = p.ProductID
WHERE af.ProductID IS NULL;

-- Ensure each AudioFeatures row has a Stock row.
INSERT INTO Stock (IsAvailable, UnavailableSince, AvailableSince, ProductID)
SELECT 1, NULL, NOW(), af.ProductID
FROM AudioFeatures af
LEFT JOIN Stock s ON s.ProductID = af.ProductID
WHERE s.ProductID IS NULL;

-- Final verification snapshot.
SELECT
    (SELECT COUNT(*) FROM Products) AS products_total,
    (SELECT COUNT(*) FROM Stock) AS stock_total,
    (SELECT COUNT(*) FROM AudioFeatures) AS af_total,
    (SELECT COUNT(*) FROM AudioFeatures WHERE ProductID > 0) AS af_library,
    (SELECT COUNT(*) FROM AudioFeatures WHERE ProductID < 0) AS af_imported;
