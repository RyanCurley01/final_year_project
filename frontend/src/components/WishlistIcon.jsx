import { useSelector } from 'react-redux';
import { FaStar } from 'react-icons/fa';

const WishlistIcon = () => {
  const { totalItems } = useSelector((state) => state.wishlist);

  return (
    <div className="relative">
      <FaStar className="w-6 h-6 mr-2 text-yellow-400" />
      {totalItems > 0 && (
        <span className="absolute -top-2 -right-2 bg-yellow-500 text-black text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
          {totalItems}
        </span>
      )}
    </div>
  );
};

export default WishlistIcon;
