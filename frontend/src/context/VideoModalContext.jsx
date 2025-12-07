import { createContext, useContext, useState } from 'react';

const VideoModalContext = createContext();

export const useVideoModal = () => {
  const context = useContext(VideoModalContext);
  if (!context) {
    throw new Error('useVideoModal must be used within VideoModalProvider');
  }
  return context;
};

export const VideoModalProvider = ({ children }) => {
  const [modalState, setModalState] = useState({
    isOpen: false,
    videoSrc: null,
    title: null,
    isPlaying: false,
    isActive: false
  });
  
  // Track current sky color for synchronization
  const [currentSkyColor, setCurrentSkyColor] = useState([135, 206, 235]);

  const openModal = ({ videoSrc, title, isPlaying, isActive }) => {
    setModalState({
      isOpen: true,
      videoSrc,
      title,
      isPlaying,
      isActive
    });
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      videoSrc: null,
      title: null,
      isPlaying: false,
      isActive: false
    });
    // Reset color when closing
    setCurrentSkyColor([135, 206, 235]);
  };

  return (
    <VideoModalContext.Provider value={{ 
      modalState, 
      openModal, 
      closeModal,
      currentSkyColor,
      setCurrentSkyColor
    }}>
      {children}
    </VideoModalContext.Provider>
  );
};
