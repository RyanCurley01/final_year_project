import {Link } from 'react-router-dom';
import {useDispatch } from 'react-redux';

import PlayPause from './PlayPause';
import { playPause, setActiveSong } from '../redux/features/playerSlice';

const SongCard = ({ product, i }) => {
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  
  const productName = isMusic ? product.albumTitle : product.gameTitle;
  const price = isMusic ? product.albumPrice : product.gamePrice;
  const coverImage = isMusic ? product.albumCoverImageUrl : product.gameCoverImageUrl;

  return (
    <div className="flex flex-col w-[250px] p-4 bg-white/5 
    bg-opacity-80 backdrop-blur-sm animate-slideup
    rounded-lg cursor-pointer">
      <div className="relative w-full h-56 group">
        <div className={`absolute inset-0 justify-center items-center bg-black bg-opacity-50 group-hover:flex ${isMusic ? 'flex bg-black bg-opacity-70' : 'hidden'}`}>
          {isMusic && (
            <PlayPause
              isPlaying={false}
              activeSong={product}
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
        <p className="font-semibold text-lg text-black truncate">
          <Link to={isMusic ? `/songs/${product.productId}` : `/games/${product.productId}`}>
            {productName || 'Unknown'}
          </Link>
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-black-300">
            {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-sm font-bold text-black">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        {isGame && product.platform && (
          <p className="text-xs text-black-400 mt-1">
            Platform: {product.platform}
          </p>
        )}
      </div>
    </div>
  );
};

export default SongCard;
