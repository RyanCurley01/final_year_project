USE Game_Store_System;

UPDATE Products 
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Jimmy%20Jungle.exe' 
WHERE GameTitle = 'Jimmy Jungle';

UPDATE Products 
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Midnight%20Haunt.exe' 
WHERE GameTitle = 'Midnight Haunt';

UPDATE Products 
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Protectors.exe',
    preview_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors%20video%20game%20trailer.mp4' 
WHERE GameTitle = 'Protectors';

UPDATE Products 
SET file_url = 'https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Platform%20Game.exe' 
WHERE GameTitle = 'Red Hood' OR GameTitle = 'Platform Game';
