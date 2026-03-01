/**
 * SpectrogramLiveContext
 * ─────────────────────
 * Lightweight context to share the Spectrogram Creator's live recording state
 * with other components (e.g. the Sidebar recording indicator).
 *
 * The SpectrogramCreator component writes to this context, and the Sidebar reads it.
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const SpectrogramLiveContext = createContext({
  isLiveRecording: false,
  activeSongTitle: null,
  setLiveRecording: () => {},
});

export const SpectrogramLiveProvider = ({ children }) => {
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [activeSongTitle, setActiveSongTitle] = useState(null);

  const setLiveRecording = useCallback((recording, songTitle = null) => {
    setIsLiveRecording(recording);
    setActiveSongTitle(songTitle);
  }, []);

  const value = useMemo(() => ({
    isLiveRecording,
    activeSongTitle,
    setLiveRecording,
  }), [isLiveRecording, activeSongTitle, setLiveRecording]);

  return (
    <SpectrogramLiveContext.Provider value={value}>
      {children}
    </SpectrogramLiveContext.Provider>
  );
};

export const useSpectrogramLive = () => useContext(SpectrogramLiveContext);

export default SpectrogramLiveContext;
