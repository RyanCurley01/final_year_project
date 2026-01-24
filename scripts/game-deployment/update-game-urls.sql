-- SQL script to update Products table with game executable URLs
-- Run this after uploading the .exe files to S3

-- Update Jimmy Jungle
UPDATE Products
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Jimmy%20Jungle.exe',
    preview_url = NULL  -- Games don't have preview files
WHERE gameTitle = 'Jimmy Jungle';

-- Update Midnight Haunt  
UPDATE Products
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Midnight%20Haunt.exe',
    preview_url = NULL
WHERE gameTitle = 'Midnight Haunt';

-- Update Platform Game
UPDATE Products
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Platform%20Game.exe',
    preview_url = NULL
WHERE gameTitle = 'Platform Game';

-- Verify the updates
SELECT 
    ProductID,
    gameTitle,
    gamePrice,
    file_url,
    preview_url
FROM Products
WHERE gameTitle IN ('Jimmy Jungle', 'Midnight Haunt', 'Platform Game');
