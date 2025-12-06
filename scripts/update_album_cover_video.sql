
-- Update all music albums to use the cloud animation video
-- This replaces the static albumCoverImageUrl with the animated video URL

UPDATE Products 
SET albumCoverImageUrl = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/cloud-animation.mp4'
WHERE AlbumTitle IS NOT NULL 
  AND AlbumTitle != '';

-- Verify the update
SELECT ProductID, AlbumTitle, albumCoverImageUrl 
FROM Products 
WHERE AlbumTitle IS NOT NULL 
LIMIT 5;
