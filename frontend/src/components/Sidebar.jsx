import { useState } from 'react';
import { NavLink } from 'react-router-dom'; 
import { RiCloseLine } from 'react-icons/ri';

import { logo } from '../assets';
import { links } from '../assets/constants';

const Sidebar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="md:flex hidden flex-col w-[240px] bg-gradient-to-br
    py-10 px-4 bg-[#1e1e40]">
      <img src={logo} alt="logo" className="w-full h-[100px] 
      object-contain" />
    </div>
  );
};

export default Sidebar;
