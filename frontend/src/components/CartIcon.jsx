import { useSelector } from 'react-redux';
import { FiShoppingCart } from 'react-icons/fi';

const CartIcon = () => {
  const { totalItems } = useSelector((state) => state.cart);

  return (
    <div className="relative">
      <FiShoppingCart className="w-6 h-6 mr-2" />
      {totalItems > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
          {totalItems}
        </span>
      )}
    </div>
  );
};

export default CartIcon;
