import { MdClose } from 'react-icons/md';
import { createPortal } from 'react-dom';
import AudioReactiveVideo from './AudioReactiveVideo';

const VideoModal = ({ isOpen, onClose, videoSrc, title, isPlaying, isActive }) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed bg-gradient-to-br from-gray-900 to-black rounded-lg shadow-2xl border border-gray-700"
      style={{
        width: '400px',
        maxWidth: 'calc(100vw - 2rem)',
        bottom: 'calc(7rem + 1rem)', // Above the music player (h-28 = 7rem) + 1rem gap
        right: '1rem',
        zIndex: 9999,
        maxHeight: 'calc(100vh - 9rem)' // Prevent overflow
      }}
    >
        {/* Header */}
        <div
          className="flex items-center justify-between p-2 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-t-lg border-b border-gray-700"
        >
          <h3 className="text-white font-semibold text-sm truncate mr-2">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
            title="Close"
          >
            <MdClose className="text-white text-xl" />
          </button>
        </div>

        {/* Video Content */}
        <div className="p-3">
          <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
            <AudioReactiveVideo
              src={videoSrc}
              alt={title}
              className="w-full h-full rounded-lg object-cover"
              isPlaying={isPlaying}
              isActive={isActive}
            />
          </div>
        </div>
    </div>,
    document.body
  );
};

export default VideoModal;
