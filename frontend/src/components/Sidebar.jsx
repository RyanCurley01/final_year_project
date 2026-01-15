import { useState } from 'react';
import { NavLink } from 'react-router-dom'; 
import { useDispatch } from 'react-redux';
import { HiOutlineMenu } from 'react-icons/hi';
import { RiCloseLine } from 'react-icons/ri';
import { FaReceipt } from 'react-icons/fa';

import { logo } from '../assets';
import { links } from '../assets/constants';
import CartIcon from './CartIcon';
import { resetPlayer } from '../redux/features/playerSlice';

const NavLinks = ({ handleClick, onResetPlayer }) => (
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
  </div>
);

const Sidebar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dispatch = useDispatch();

  const handleResetPlayer = () => {
    dispatch(resetPlayer());
  };

  return (
    <div className="flex flex-col w-[200px] min-w-[200px] bg-gradient-to-br
    py-10 px-4 bg-[#252246] relative z-20">
      <img src={logo} alt="logo" className="rounded w-full h-[100px] 
      object-contain" />
      <NavLinks onResetPlayer={handleResetPlayer} />
    </div>
  );
};

export default Sidebar;
