import { useState } from 'react';
import { NavLink } from 'react-router-dom'; 
import { HiOutlineMenu } from 'react-icons/hi';
import { RiCloseLine } from 'react-icons/ri';
import { FaReceipt } from 'react-icons/fa';

import { logo } from '../assets';
import { links } from '../assets/constants';
import CartIcon from './CartIcon';

const NavLinks = ({ handleClick }) => (
  <div className="mt-10">
    {links.map((item) => (
      <NavLink 
      key={item.name}
      to={item.to}
      className="flex flex-row
      justify-start items-center my-8 text-sm
      font-medium text-gray-300
      hover:text-primary-light"
      onClick={() => handleClick && handleClick()}
      >
        <item.icon className="w-6 h-6 mr-2" />
        {item.name}
      </NavLink>
    ))}
    
    {/* Cart Link */}
    <NavLink
      to="/cart"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => handleClick && handleClick()}
    >
      <CartIcon />
      <span className="ml-4">Cart</span>
    </NavLink>
    
    {/* Purchase History Link */}
    <NavLink
      to="/purchase-history"
      className="flex flex-row justify-start items-center my-8 text-sm font-medium text-gray-300 hover:text-primary-light"
      onClick={() => handleClick && handleClick()}
    >
      <FaReceipt className="w-6 h-6 mr-2" />
      Purchase History
    </NavLink>
  </div>
);

const Sidebar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
    <div className="md:flex hidden flex-col w-[240px] bg-gradient-to-br
    py-10 px-4 bg-[#252246] relative z-20">
      <img src={logo} alt="logo" className="w-full h-[100px] 
      object-contain" />
      < NavLinks />
    </div>


    <div className="absolute md:hidden block 
    top-6 right-3 z-50">
      {mobileMenuOpen ? (
        <RiCloseLine className="w-6 h-6 text-white mr-2 cursor-pointer" 
        onClick={() => setMobileMenuOpen(false)}/>
      ) : <HiOutlineMenu className="w-6 h-6 text-white
      mr-2 cursor-pointer" onClick={() => setMobileMenuOpen(true)} />}
    </div>


    <div className={`absolute top-0 h-screen w-2/3
    bg-gradient-to-tl from-white/10 to-[#483d8b]
    backdrop-blur-lg z-10 p-6 md:hidden
    smooth-transition ${mobileMenuOpen ? 'left-0' :
    '-left-full'}`}>
      <img src={logo} alt="logo" className="w-full h-[100px] 
      object-contain" />
      < NavLinks handleClick={() => setMobileMenuOpen
      (false)}/>
    </div>
    </>
  );
};

export default Sidebar;
