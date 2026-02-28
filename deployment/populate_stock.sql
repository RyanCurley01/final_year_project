-- Populate Stock table with binary availability for a digital music store
-- Availability is derived from real product data, not randomization.
--
-- iTunes songs (negative ProductID):
--   Available if the song still has a valid preview_url (Apple CDN link)
--   and has extracted AudioFeatures — otherwise the song was removed/delisted.
--
-- Library songs (positive ProductID):
--   Available if the song still has a valid file_url (S3 audio file)
--   and has extracted AudioFeatures — otherwise the song was removed from the library.

-- Clear any existing stock data
DELETE FROM Stock;

-- Insert availability for every product based on real status data
INSERT INTO Stock (IsAvailable, ProductID)
SELECT
    CASE
        -- iTunes songs: available if preview_url exists and audio features were extracted
        WHEN p.ProductID < 0 THEN
            CASE
                WHEN p.preview_url IS NOT NULL
                     AND TRIM(p.preview_url) != ''
                     AND af.FeatureID IS NOT NULL
                THEN 1
                ELSE 0
            END
        -- Library songs: available if file_url exists and audio features were extracted
        ELSE
            CASE
                WHEN p.file_url IS NOT NULL
                     AND TRIM(p.file_url) != ''
                     AND af.FeatureID IS NOT NULL
                THEN 1
                ELSE 0
            END
    END AS IsAvailable,
    p.ProductID
FROM Products p
LEFT JOIN AudioFeatures af ON af.ProductID = p.ProductID;
