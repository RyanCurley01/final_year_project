import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';

const PlayPause = ({ isPlaying, activeSong, song, handlePause, handlePlay }) => {
  const isSameSong = activeSong?.albumTitle === song?.albumTitle || activeSong?.gameTitle === song?.gameTitle;
  
  return isPlaying && isSameSong ? (
    <FaPauseCircle 
      size={35}
      className="text-gray-300 hover:text-white cursor-pointer"
      onClick={handlePause}
    />
  ) : (
    <FaPlayCircle 
      size={35}
      className="text-gray-300 hover:text-white cursor-pointer"
      onClick={handlePlay}
    />
  );
};

export default PlayPause;
