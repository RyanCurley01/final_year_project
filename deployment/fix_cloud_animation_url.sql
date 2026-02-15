UPDATE Products
SET AlbumCoverImageUrl = REPLACE(AlbumCoverImageUrl, 'Music Cover Image and cloud movement script', 'Music%20Cover%20Image%20and%20cloud%20movement%20script')
WHERE AlbumCoverImageUrl LIKE '%Music Cover Image and cloud movement script%';
