import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom'; 
import { useDispatch } from 'react-redux';
import { HiOutlineMenu, HiOutlineLogout } from 'react-icons/hi';
import { RiCloseLine } from 'react-icons/ri';
import { FaReceipt, FaChartLine } from 'react-icons/fa';

import { useAuth } from '../context/AuthContext';
import { logo } from '../assets';
import { links } from '../assets/constants';
import CartIcon from './CartIcon';
import WishlistIcon from './WishlistIcon';
import { resetPlayer } from '../redux/features/playerSlice';
import { clearWishlist } from '../redux/features/wishlistSlice';

const NavLinks = ({ handleClick, onResetPlayer, onClearWishlist }) => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const isManager = currentUser?.accountType === 'Manager';

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem('currentUser');
      navigate('/login');
      if (onResetPlayer) onResetPlayer();
      if (onClearWishlist) onClearWishlist();
      if (handleClick) handleClick();
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  return (
  <div className="mt-4">
    {links.map((item) => (
      <NavLink 
      key={item.name}
      to={item.to}
      className="flex flex-row
      justify-start items-center my-8 text-sm
      font-medium text-gray-300
      hover:text-primary-light"
      onClick={() => {
        onResetPlayer && onResetPlayer();
        handleClick && handleClick();
      }}
      >
        <item.icon className="w-6 h-6 mr-2" />
        {item.name}
      </NavLink>
    ))}
    
    {/* Cart Link */}
    <NavLink
      to="/cart"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => {
        onResetPlayer && onResetPlayer();
        handleClick && handleClick();
      }}
    >
      <CartIcon />
      <span className="ml-4">Cart</span>
    </NavLink>
    
    {/* Wishlist Link */}
    <NavLink
      to="/wishlist"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => {
        onResetPlayer && onResetPlayer();
        handleClick && handleClick();
      }}
    >
      <WishlistIcon />
      <span className="ml-4">Wishlist</span>
    </NavLink>
    
    {/* Purchase History Link */}
    <NavLink
      to="/purchase-history"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => {
        onResetPlayer && onResetPlayer();
        handleClick && handleClick();
      }}
    >
      <FaReceipt className="w-6 h-6 mr-2" />
      Purchase History
    </NavLink>
    
    {/* ML Visualization Link - visible to Managers only */}
    {isManager && (
      <NavLink
        to="/ml-visualization"
        className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
        onClick={() => {
          onResetPlayer && onResetPlayer();
          handleClick && handleClick();
        }}
      >
        <FaChartLine className="w-6 h-6 mr-2" />
        ML Visualization
      </NavLink>
    )}

    {/* Logout Button */}
    <button
      type="button"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-red-500 w-full"
      onClick={handleLogout}
    >
      <HiOutlineLogout className="w-6 h-6 mr-2" />
      Logout
    </button>
  </div>
  );
};

const Sidebar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dispatch = useDispatch();

  const handleResetPlayer = () => {
    dispatch(resetPlayer());
  };

  const handleClearWishlist = () => {
    dispatch(clearWishlist());
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-[200px] min-w-[200px] bg-gradient-to-br
      py-10 px-4 bg-[#252246] relative z-20">
        <img src={logo} alt="logo" className="rounded w-full h-[100px] 
        object-contain" />
        <NavLinks onResetPlayer={handleResetPlayer} onClearWishlist={handleClearWishlist} />
      </div>

      {/* Mobile Hamburger Button */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        {!mobileMenuOpen && (
          <HiOutlineMenu 
            className="w-8 h-8 text-white cursor-pointer" 
            onClick={() => setMobileMenuOpen(true)} 
          />
        )}
      </div>

      {/* Mobile Menu Overlay */}
      <div className={`md:hidden fixed top-0 left-0 w-2/3 max-w-[250px] h-full bg-gradient-to-br from-[#252246] to-[#1a1a3e] z-50 transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4">
          <RiCloseLine 
            className="w-8 h-8 text-white cursor-pointer mb-4" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          <img src={logo} alt="logo" className="rounded w-full h-[80px] object-contain mb-4" />
          <NavLinks handleClick={() => setMobileMenuOpen(false)} onResetPlayer={handleResetPlayer} onClearWishlist={handleClearWishlist} />
        </div>
      </div>

      {/* Mobile Overlay Background */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;
