const SongCard = ({ product, i }) => {
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  
  const icon = isMusic ? '🎵' : '🎮';
  const productName = isMusic ? product.albumTitle : product.gameTitle;
  const price = isMusic ? product.albumPrice : product.gamePrice;
  const coverImage = isMusic ? product.albumCoverImageUrl : product.gameCoverImageUrl;

  return (
    <div className="flex flex-col w-[250px] p-4 bg-white/5 bg-opacity-80 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all duration-300">
      <div className="relative w-full h-56 group">
        <div className={`absolute inset-0 justify-center items-center bg-black bg-opacity-50 group-hover:flex ${
          false ? 'flex bg-black bg-opacity-70' : 'hidden'
        }`}>
          <button
            type="button"
            className="text-4xl hover:scale-110 transition-transform"
            aria-label="Play"
          >
            ▶️
          </button>
        </div>
        <img
          alt={productName}
          src={coverImage || 'https://via.placeholder.com/250x224?text=No+Image'}
          className="w-full h-full rounded-lg object-cover"
        />
      </div>

      <div className="mt-4 flex flex-col">
        <p className="font-semibold text-lg text-white truncate">
          {productName}
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-gray-400">
            {icon} {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-lg font-bold text-white">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {isGame && product.platform ? `Platform: ${product.platform}` : 'Genre: N/A'}
        </p>
      </div>
    </div>
  );
};

export default SongCard;
