import React from 'react';

const Track = ({ isPlaying, isActive, activeSong }) => (
  <div className="flex-1 flex items-center justify-start">
    <div className={`${isPlaying && isActive ? 'animate-[spin_3s_linear_infinite]' : ''} hidden sm:block h-16 w-16 mr-4`}>
      <img 
        src={activeSong?.albumCoverImageUrl || activeSong?.gameCoverImageUrl || 'https://via.placeholder.com/64'} 
        alt="cover art" 
        className="rounded-full object-cover"
      />
    </div>
    <div className="w-[50%]">
      <p className="truncate text-white font-bold text-lg">
        {activeSong?.albumTitle || activeSong?.gameTitle || 'No active Song'}
      </p>
      <p className="truncate text-gray-300">
        {activeSong?.albumPrice ? `$${activeSong.albumPrice.toFixed(2)}` : activeSong?.gamePrice ? `$${activeSong.gamePrice.toFixed(2)}` : 'Select a song'}
      </p>
    </div>
  </div>
);

export default Track;
