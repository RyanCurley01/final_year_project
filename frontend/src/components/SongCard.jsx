import {Link } from 'react-router-dom';
import {useDispatch, useSelector } from 'react-redux';

import PlayPause from './PlayPause';
import { playPause, setActiveSong } from '../redux/features/playerSlice';

const SongCard = ({ product, i, data }) => {
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  
  const productName = isMusic ? product.albumTitle : product.gameTitle;
  const price = isMusic ? product.albumPrice : product.gamePrice;
  const coverImage = isMusic ? product.albumCoverImageUrl : product.gameCoverImageUrl;

  // Check if this is a playable song (individual song, not full album)
  // Individual songs have "Electronic Works - " prefix, album is just "Selected Electronic Works"
  const isPlayableSong = isMusic && product.albumTitle?.includes(' - ');

  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);

  const handlePauseClick = () => {
    dispatch(playPause(false));
  };

  const handlePlayClick = () => {
    dispatch(setActiveSong({ song: product, data, i }));
    dispatch(playPause(true));
  };


  return (
    /**
     * Shows the cover image and and song and game details
     */
    <div className="flex flex-col w-[250px] p-4 bg-white/5 
    bg-opacity-80 backdrop-blur-sm animate-slideup
    rounded-lg cursor-pointer">
      <div className="relative w-full h-56 group">
        <div className={`absolute inset-0 justify-center items-center bg-black bg-opacity-50 group-hover:flex ${isPlayableSong ? 'flex bg-black bg-opacity-70' : 'hidden'}`}>
          {isPlayableSong && (
            <PlayPause
              isPlaying={isPlaying && activeSong?.albumTitle === product.albumTitle}
              activeSong={activeSong}
              handlePause={handlePauseClick}
              handlePlay={handlePlayClick}
              song={product}
            />
          )}
        </div>
        <img
          src={coverImage || 'https://via.placeholder.com/250x224?text=No+Image'}
          alt={productName}
          className="w-full h-full rounded-lg object-cover"
        />
      </div>

      <div className="flex flex-col mt-4">
        <p className="font-semibold text-lg text-white truncate">
          <Link to={isMusic ? `/songs/${product.productId}` : `/games/${product.productId}`}>
            {productName || 'Unknown'}
          </Link>
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-white">
            {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-sm font-bold text-white">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        {isGame && product.platform && (
          <p className="text-xs text-white mt-1">
            Platform: {product.platform}
          </p>
        )}
      </div>
    </div>
  );
};

export default SongCard;
