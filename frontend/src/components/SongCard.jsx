const SongCard = ({ product, i }) => {
  // Determine if it's a game or music based on product type
  const isMusic = product.productType === 'MUSIC';
  const icon = isMusic ? '🎵' : '🎮';

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
          alt={product.productName}
          src={product.coverImage || 'https://via.placeholder.com/250x224?text=No+Image'}
          className="w-full h-full rounded-lg object-cover"
        />
      </div>

      <div className="mt-4 flex flex-col">
        <p className="font-semibold text-lg text-white truncate">
          {product.productName}
        </p>
        <p className="text-sm truncate text-gray-300 mt-1">
          {product.artist || product.developer || 'Unknown Artist'}
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-gray-400">
            {icon} {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-lg font-bold text-white">
            ${product.price?.toFixed(2) || '0.00'}
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Genre: {product.genre || 'N/A'}
        </p>
      </div>
    </div>
  );
};

export default SongCard;
