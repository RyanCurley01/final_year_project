import React from 'react';

const Seekbar = ({ value, min, max, onInput, setSeekTime, appTime, onSeekStart, onSeekEnd }) => {
  // converts the time to format 0:00
  const getTime = (time) => `${Math.floor(time / 60)}:${(`0${Math.floor(time % 60)}`).slice(-2)}`;

  return (
    <div className="flex flex-row items-center flex-1 min-w-0">
      <button type="button" onClick={() => setSeekTime(appTime - 5)} className="mr-2 text-white text-sm shrink-0">
        -
      </button>
      <p className="text-white text-xs sm:text-sm shrink-0">{value === 0 ? '0:00' : getTime(value)}</p>
      <input
        type="range"
        step="any"
        value={value}
        min={min}
        max={max}
        onMouseDown={onSeekStart}
        onMouseUp={onSeekEnd}
        onTouchStart={onSeekStart}
        onTouchEnd={onSeekEnd}
        onChange={onInput}
        className="flex-1 min-w-[60px] h-1 mx-2 rounded-lg cursor-pointer"
      />
      <p className="text-white text-xs sm:text-sm shrink-0">{max === 0 ? '0:00' : getTime(max)}</p>
      <button type="button" onClick={() => setSeekTime(appTime + 5)} className="ml-2 text-white text-sm shrink-0">
        +
      </button>
    </div>
  );
};

export default Seekbar;
