import { useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import PlayPause from './PlayPause';  
import AudioReactiveVideo from './AudioReactiveVideo';
import { playPause, setActiveSong } from '../redux/features/playerSlice';
import { useGetTopPlayedSongsQuery } from '../redux/services/apiService';
import placeholders from '../utils/placeholderImage';

import Loader from './Loader';
import Error from './Error';

const TopChartCard = ({ song, i, isPlaying, activeSong, handlePauseClick, handlePlayClick, songEnded }) => {
  const coverMedia = song?.albumCoverImageUrl || song?.images?.coverart;
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  const isThisSongActive = activeSong?.albumTitle === song?.albumTitle;

  return (
  <>
    <div className="w-full flex flex-row items-center 
    hover:bg-[#4c426e] py-2 p-4 rounded-lg cursor-pointer mb-2">
      <h3 className="font-bold text-base text-white mr-3">{i + 1}.</h3>
      <div className="flex-1 flex flex-row justify-between items-center">
        <div className="relative w-20 h-20 group">
        {isVideo ? (
          <AudioReactiveVideo
            src={coverMedia}
            alt={song?.albumTitle || song?.title}
            className="w-full h-full rounded-lg object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
            onError={(e) => {
              console.error('Video failed to load:', coverMedia, e);
            }}
          />
        ) : (
          <img
            src={coverMedia || placeholders.small}
            alt={song?.albumTitle || song?.title}
            className="w-full h-full rounded-lg object-cover"
            onError={(e) => {
              if (e.target.src !== placeholders.small) {
                e.target.src = placeholders.small;
              }
            }}
          />
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center mx-3">
        <p className="text-xl font-bold text-white">
          {song.albumTitle || song.title}
        </p>
        <p className="text-base text-gray-300 mt-1">
          {song.playCount || 0} {song.playCount === 1 ? 'play' : 'plays'}
        </p>
      </div>
    </div>
    {song.fileUrl && (
      <PlayPause
        isPlaying={isPlaying && activeSong?.albumTitle === song.albumTitle}
        activeSong={activeSong}
        handlePause={handlePauseClick}
        handlePlay={() => handlePlayClick(song, i)}
        song={song}
      />
    )}
  </div>
  </>
  );
};

const TopPlay = () => {
  const dispatch = useDispatch();
  const { activeSong, isPlaying, songEnded } = useSelector((state) => state.player);
  const divRef = useRef(null);

  // Fetch top played songs based on user play count from UserInteractions
  const { data: topPlayedData, isLoading, error } = useGetTopPlayedSongsQuery(5);

  // Extract songs array from API response
  const topSongs = topPlayedData?.data || [];
  const topPlays = topSongs;
  
  const handlePauseClick = () => {
    console.log('🔴 TopPlay pause clicked');
    dispatch(playPause(false));
  };

  const handlePlayClick = (song, i) => {
    console.log('▶️ TopPlay play clicked for:', song.albumTitle, 'fileUrl:', song.fileUrl);
    // Only play if the song has a fileUrl (matched with database)
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: topSongs, i }));
      dispatch(playPause(true));
    } else {
      console.warn('⚠️ No fileUrl available for song:', song.albumTitle);
    }
  };

  // Render content based on state
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-4"></div>
          <p className="text-gray-400 text-sm">Loading top songs...</p>
        </div>
      );
    }

    if (error || topPlays.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <p className="text-gray-400 text-sm">
            {error ? 'Unable to load top songs' : 'No songs played yet'}
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Play a song to see it appear here!
          </p>
        </div>
      );
    }

    return (
      <div className="mt-4 flex flex-col gap-1">
        {topPlays.map((song, i) => (
          <TopChartCard 
            key={song.productId || song.id || `song-${i}`}
            song={song}
            i={i}
            isPlaying={isPlaying}
            activeSong={activeSong}
            songEnded={songEnded}
            handlePauseClick={handlePauseClick}
            handlePlayClick={handlePlayClick}
          />
        ))}
      </div>
    );
  };

  return (
    <div ref={divRef} className="xl:ml-16 mr-30 xl:mb-0 mb-6 
    flex-1 xl:max-w-[500px] max-w-full flex flex-col">
      <div className="w-full flex flex-col">
        <div className="flex flex-row justify-between items-center">
          <h2 className="text-white font-bold text-2xl ml-5">Popular Songs</h2>
        </div>
        {renderContent()}
      </div>
    </div>
  )
};

export default TopPlay;
