import React from 'react';
import { MdSkipNext, MdSkipPrevious } from 'react-icons/md';
import { BsArrowRepeat, BsFillPauseFill, BsFillPlayFill, BsShuffle } from 'react-icons/bs';
import { TbAtom2Filled } from 'react-icons/tb';

const Controls = ({ isPlaying, repeat, setRepeat, shuffle, setShuffle, currentSongs, handlePlayPause, handlePrevSong, handleNextSong, quantumMode, handleQuantumToggle, quantumState }) => (
  <div className="flex items-center justify-around w-full max-w-xs">
    <BsArrowRepeat size={20} color={repeat ? 'red' : 'white'} onClick={() => setRepeat((prev) => !prev)} className="cursor-pointer" />
    {currentSongs?.length && <MdSkipPrevious size={30} color="#FFF" className="cursor-pointer" onClick={handlePrevSong} />}
    {isPlaying ? (
      <BsFillPauseFill size={45} color="#FFF" onClick={handlePlayPause} className="cursor-pointer" />
    ) : (
      <BsFillPlayFill size={45} color="#FFF" onClick={handlePlayPause} className="cursor-pointer" />
    )}
    {currentSongs?.length && <MdSkipNext size={30} color="#FFF" className="cursor-pointer" onClick={handleNextSong} />}
    <BsShuffle size={20} color={shuffle ? 'red' : 'white'} onClick={() => setShuffle((prev) => !prev)} className="cursor-pointer" />
    <div className="relative group">
      <TbAtom2Filled
        size={22}
        color={quantumMode ? '#00ffff' : 'white'}
        onClick={handleQuantumToggle}
        className="cursor-pointer transition-all duration-200"
        style={{
          filter: quantumMode ? 'drop-shadow(0 0 6px #00ffff) drop-shadow(0 0 12px #0088ff)' : 'none',
          animation: quantumMode ? 'quantum-spin 2s linear infinite' : 'none',
        }}
        title={quantumMode ? 'Quantum Mode ON — Click to disable' : 'Quantum Mode — Qubit panning on transients'}
      />
      {/* Quantum state indicator */}
      {quantumMode && quantumState && (
        <span
          className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono whitespace-nowrap pointer-events-none"
          style={{ color: '#00ffff', textShadow: '0 0 4px #00ffff' }}
        >
          {quantumState.bits}
        </span>
      )}
    </div>
  </div>
);

export default Controls;
