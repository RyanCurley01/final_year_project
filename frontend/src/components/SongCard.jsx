const SongCard = ({ product, i }) => {
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  
  const productName = isMusic ? product.albumTitle : product.gameTitle;
  const price = isMusic ? product.albumPrice : product.gamePrice;
  const coverImage = isMusic ? product.albumCoverImageUrl : product.gameCoverImageUrl;

  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-400 rounded-lg w-[600px]">
      <div className="relative w-full h-auto flex-shrink-0 overflow-hidden group rounded-lg">
        {isMusic && (
          <div className={"absolute inset-0 flex justify-center items-center bg-black bg-opacity-70 group-hover:flex hidden rounded-lg"}>
            <button
              type="button"
              className="text-3xl hover:scale-110 transition-transform"
              aria-label="Play"
            >
              ▶️
            </button>
          </div>
        )}
        <img
          src={coverImage || 'https://via.placeholder.com/150x150?text=No+Image'}
          className="w-full h-auto rounded-lg object-contain"
        />
      </div>

      <div className="flex flex-col bg-gray-900 bg-opacity-80 p-2 rounded">
        <p className="font-semibold text-sm text-black">
          {productName || 'Unknown'}
        </p>
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-gray-300">
            {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-sm font-bold text-black">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        <p className="text-xs text-gray-300 mt-1">
          {isGame && product.platform ? 'Platform: ' + product.platform : 'Platform: N/A'}
        </p>
      </div>
    </div>
  );
};

export default SongCard;
