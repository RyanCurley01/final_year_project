import React from 'react';
import { BsFillVolumeUpFill, BsVolumeDownFill, BsFillVolumeMuteFill } from 'react-icons/bs';

const VolumeBar = ({ value, min, max, onChange, setVolume }) => {
  // Detect iOS - volume control doesn't work on iOS due to Apple restrictions
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  // On iOS, show message to use device buttons instead
  if (isIOS) {
    return (
      <div className="flex items-center justify-end flex-shrink-0">
        <BsFillVolumeUpFill size={20} color="#888" className="flex-shrink-0" />
        <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">Use device buttons</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-end flex-shrink-0">
      {value <= 1 && value > 0.5 && <BsFillVolumeUpFill size={20} color="#FFF" onClick={() => setVolume(0)} className="cursor-pointer flex-shrink-0" />}
      {value <= 0.5 && value > 0 && <BsVolumeDownFill size={20} color="#FFF" onClick={() => setVolume(0)} className="cursor-pointer flex-shrink-0" />}
      {value === 0 && <BsFillVolumeMuteFill size={20} color="#FFF" onClick={() => setVolume(1)} className="cursor-pointer flex-shrink-0" />}
      <input
        type="range"
        step="any"
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        className="w-16 sm:w-24 h-1 ml-2 cursor-pointer"
      />
    </div>
  );
};

export default VolumeBar;
