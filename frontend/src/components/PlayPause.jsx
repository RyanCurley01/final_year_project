import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';

const PlayPause = ({ isPlaying, handlePause, handlePlay }) => {
  // isPlaying prop should already indicate if THIS specific song is playing
  // Show Pause icon when playing (so user can pause)
  // Show Play icon when not playing (so user can play)
  
  return isPlaying ? (
    <FaPauseCircle 
      size={45}
      className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
      onClick={(e) => {
        e.stopPropagation();
        handlePause();
      }}
    />
  ) : (
    <FaPlayCircle 
      size={45}
      className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
      onClick={(e) => {
        e.stopPropagation();
        handlePlay();
      }}
    />
  );
};

export default PlayPause;
