import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom'; 
import { useDispatch, useSelector } from 'react-redux';
import { HiOutlineMenu, HiOutlineLogout } from 'react-icons/hi';
import { RiCloseLine } from 'react-icons/ri';
import { FaReceipt, FaChartLine, FaWaveSquare, FaSlidersH } from 'react-icons/fa';

import { useAuth } from '../context/AuthContext';
import { useSpectrogramLive } from '../context/SpectrogramLiveContext';
import { logo } from '../assets';
import { links } from '../assets/constants';
import CartIcon from './CartIcon';
import WishlistIcon from './WishlistIcon';
import { resetPlayer } from '../redux/features/playerSlice';
import { clearWishlist } from '../redux/features/wishlistSlice';
import UserInteractionsSidebar from './UserInteractionsSidebar';
import SoldProductsSidebar from './SoldProductsSidebar';
import CustomerSummarySidebar from './CustomerSummarySidebar';
import PurchasedProductsSidebar from './PurchasedProductsSidebar';
import StockSidebar from './StockSidebar';

// NavLinks Component: A helper component that renders the actual list of navigation items.
// It accepts functions as props (callbacks) to handle side effects when a link is clicked,
// such as closing the mobile menu, stopping the audio player, or clearing the wishlist on logout.
const NavLinks = ({ handleClick, onResetPlayer, onClearWishlist, isMobile = false }) => {
  
  // useAuth: A custom context hook that provides the currently logged-in user and the logout function.
  const { logout, currentUser } = useAuth();
  
  // useSpectrogramLive: Gets the state showing if the user is currently live-recording audio data.
  const { isLiveRecording, activeSongTitle } = useSpectrogramLive();
  
  // useNavigate: A React Router hook used for programmatically redirecting the user (e.g., to the login page).
  const navigate = useNavigate();
  
  // Role-based rendering: Checks if the logged-in user has Manager privileges.
  const isManager = currentUser?.accountType === 'Manager';

  // handleLogout: Triggered when the user clicks the logout button.
  // It completely resets the local application state and redirects to the login screen.
  const handleLogout = async () => {
    try {
      
      // Calls the backend/Firebase logout method.
      await logout(); 
      
      // Clears the locally stored user session.
      localStorage.removeItem('currentUser'); 
      
      // Redirects the UI to the login route.
      navigate('/login'); 
      
      // Stops any currently playing music.
      if (onResetPlayer) onResetPlayer();
      
      // Clears the user's volatile wishlist state.
      if (onClearWishlist) onClearWishlist(); 
      
      // Closes the mobile Sidebar overlay if open.
      if (handleClick) handleClick(); 
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  return (
  <div className="mt-4">
    {/* Map over the common links defined in the constants file and render them dynamically */}
    {links.map((item) => (
      <NavLink 
      key={item.name}
      to={item.to}
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => {
        
        // When navigating away to default pages, stop the music player and close mobile menus.
        onResetPlayer && onResetPlayer();
        handleClick && handleClick();
      }}
      >
        <item.icon className="w-6 h-6 mr-2" />
        {item.name}
      </NavLink>
    ))}
    
    {/* Cart Link: Navigates to the checkout page. Features the custom `CartIcon` which has the live Redux badge. */}
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
    
    {/* Wishlist Link: Similar to Cart, uses the custom `WishlistIcon` component for its badge. */}
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
    
    {/* Spectrogram Creator - visible to all users */}
    {/* onResetPlayer cannot be called here because the Spectrogram Creator's Live mode
       needs the MusicPlayer and its audio source to stay alive so the analyser
       can tap into the playing song's frequency data. */}
    <NavLink
      to="/spectrogram-creator"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => {
        handleClick && handleClick();
      }}
      title={isLiveRecording ? `Recording "${activeSongTitle}"` : 'Spectrogram Creator'}
    >
      {/* Live recording indicator: Adds a pulsing red dot over the icon if the user is currently live-recording */}
      <div className="relative">
        <FaWaveSquare className="w-6 h-6 mr-2" />
        {isLiveRecording && (
          <span className="absolute -top-1 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
          </span>
        )}
      </div>
      Spectrogram Creator
    </NavLink>

    {/* MIDI Explorer Link */}
    <NavLink
      to="/midi-explorer"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => {
        handleClick && handleClick();
      }}
    >
      <FaSlidersH className="w-6 h-6 mr-2" />
      MIDI Explorer
    </NavLink>

    {/* ML Visualization Link - Conditionally rendered: visible to Managers only based on accountType */}
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

    {/* Role-Specific Sub-Sidebars: These components likely contain their own internal logic 
        to determine if they should render data based on Employee/Manager roles. */}
    <UserInteractionsSidebar />
    <PurchasedProductsSidebar />
    <StockSidebar />
    <SoldProductsSidebar />
    <CustomerSummarySidebar />

    {/* Logout Button: Executes the full handleLogout teardown. */}
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

// Sidebar: The primary layout container component exported from this file.
// It manages the responsive state (whether the sidebar is squished as a hamburger menu on mobile, or fully fixed on desktop).
const Sidebar = () => {
  
  // Local state to track if the mobile flyout menu is visible or hidden.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Redux dispatch to trigger actions that modify global state.
  const dispatch = useDispatch();

  // Helper function to dispatch the resetPlayer action.
  const handleResetPlayer = () => {
    dispatch(resetPlayer());
  };

  // Helper function to dispatch the clearWishlist action.
  const handleClearWishlist = () => {
    dispatch(clearWishlist());
  };

  // Grabs the currently active song from Redux to see if the global Music Player bar is visible on screen.
  const { activeSong } = useSelector((state) => state.player);

  return (
    <>
      {/* Desktop Sidebar:
          - hidden md:flex means it is completely invisible on mobile (< 768px) and uses flexbox on desktop.
          - conditionally adds padding bottom ('pb-32') so the bottom links aren't hidden behind the fixed Music Player bar 
            if a song is currently loaded into activeSong. */}
      <div className={`hidden md:flex flex-col w-[200px] min-w-[200px] bg-gradient-to-br
      py-10 px-4 bg-[#252246] relative z-20 overflow-y-auto ${activeSong?.albumTitle ? 'pb-32' : ''}`}>
        <img src={logo} alt="logo" className="rounded w-full h-[100px] object-contain" />
        <NavLinks onResetPlayer={handleResetPlayer} onClearWishlist={handleClearWishlist} />
      </div>

      {/* Mobile Hamburger Button:
          Only visible on small screens (md:hidden). 
          Clicking sets mobileMenuOpen to true. */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        {!mobileMenuOpen && (
          <HiOutlineMenu 
            className="w-8 h-8 text-white cursor-pointer" 
            onClick={() => setMobileMenuOpen(true)} 
          />
        )}
      </div>

      {/* Mobile Menu Overlay:
          Translates smoothly moving in from the left (-translate-x-full to translate-x-0) when opened. */}
      <div className={`md:hidden fixed top-0 left-0 w-2/3 max-w-[250px] h-full overflow-y-auto bg-gradient-to-br from-[#252246] to-[#1a1a3e] z-50 transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 pb-20">
          {/* Close button (the 'X') at the top of the mobile menu. */}
          <RiCloseLine 
            className="w-8 h-8 text-white cursor-pointer mb-4" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          <img src={logo} alt="logo" className="rounded w-full h-[80px] object-contain mb-4" />
          {/* Render the NavLinks again, but pass the handleClick helper to close the menu upon selection. */}
          <NavLinks handleClick={() => setMobileMenuOpen(false)} onResetPlayer={handleResetPlayer} onClearWishlist={handleClearWishlist} isMobile />
        </div>
      </div>

      {/* Mobile Overlay Background: The darkened semi-transparent backdrop behind the sliding menu. 
          Clicking this backdrop also closes the mobile menu. */}
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
