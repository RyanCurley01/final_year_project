import { useSelector } from 'react-redux';

// FiShoppingCart: This imports the specific SVG icon for a shopping cart from the react-icons library, 
// specifically from the Feather Icons (fi) collection.
import { FiShoppingCart } from 'react-icons/fi';

const CartIcon = () => {

  // useSelector((state) => state.cart): It grabs the entire cart slice from the global Redux store 
  // (the same state we looked at previously in cartSlice.js).
  // const { totalItems }: This uses object destructuring to pull out only the totalItems property from state.cart. 
  // This variable will always reflect the live, up-to-date count of how many items the user has added to their cart.
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
