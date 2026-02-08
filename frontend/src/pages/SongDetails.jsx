import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { FaPauseCircle, FaPlayCircle, FaArrowLeft, FaMusic } from 'react-icons/fa';
import { useRef } from 'react';

import { setActiveSong, playPause } from '../redux/features/playerSlice';
import Loader from '../components/Loader';
import AudioReactiveVideo from '../components/AudioReactiveVideo';
import envConfig from '../config/environment';
import { productService } from '../redux/services';
import { useAudioFeatures } from '../context/AudioFeaturesContext';

// Fallback image for missing album art
const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

// Artist badge colors
const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

// Feature color based on value
const getFeatureColor = (label, value) => {
  const numericValue = parseInt(value);
  
  if (label === 'Tempo') {
    if (numericValue < 90) return { bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-500/50' };
    if (numericValue < 130) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
    return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
  }
  
  if (numericValue >= 70) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
  if (numericValue >= 50) return { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-500/50' };
  return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
};

// Feature Badge Component
const FeatureBadge = ({ label, value }) => {
  const colors = getFeatureColor(label, value);
  return (
    <div className={`rounded-md px-1 py-1 text-center border ${colors.bg} ${colors.border}`}>
      <div className="text-[12px] text-gray-400 leading-tight">{label}</div>
      <div className={`text-[12px] font-bold leading-tight ${colors.text}`}>{value}</div>
    </div>
  );
};

// Similar Song Card Component
const SimilarSongCard = ({ song, isPlaying, activeSong, onPlay, onPause, rank, playbackRate }) => {
  const isThisSongActive = (activeSong?.trackId && String(activeSong.trackId) === String(song.trackId)) || 
                           (activeSong?.id && String(activeSong.id) === String(song.trackId));
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || song.albumCoverImageUrl || fallbackImage;
  const [isHovered, setIsHovered] = useState(false);
  
  // Check if the cover media is a video
  const isVideo = albumArt && albumArt.toLowerCase().includes('.mp4');

  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isVideo ? (
          <AudioReactiveVideo
            src={albumArt}
            alt={song.trackName}
            className="w-full h-full object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
            playbackRate={isThisSongActive ? playbackRate : 1.0}
          />
        ) : (
          <img 
            src={albumArt} 
            alt={song.trackName} 
            className="w-full h-full object-cover" 
            onError={(e) => { e.target.src = fallbackImage; }} 
          />
        )}
        
        {/* Play/Pause overlay */}
        {(song.previewUrl || song.fileUrl) && (
          <div 
            className={`absolute inset-0 rounded-lg flex justify-center items-center z-20 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              e.stopPropagation();
              setIsHovered(false);
              if (isPlaying && isThisSongActive) {
                onPause();
              } else {
                onPlay(song);
              }
            }}
          >
            {isPlaying && isThisSongActive ? (
              <FaPauseCircle size={45} className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform" />
            ) : (
              <FaPlayCircle size={45} className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform" />
            )}
          </div>
        )}

        {/* Rank badge */}
        <div className="absolute top-2 left-2 w-7 h-7 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg border-2 border-white/30">
          {rank}
        </div>

        {/* Similarity score */}
        <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-[12px] font-bold text-white shadow-lg ${
          song.similarity_score >= 0.8 ? 'bg-green-500' : 
          song.similarity_score >= 0.6 ? 'bg-yellow-500' : 
          'bg-orange-500'
        }`}>
          {(song.similarity_score * 100).toFixed(0)}%
        </div>

        {/* Playing indicator */}
        {isThisSongActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-green-500/90 px-2 py-1 rounded-full">
            <div className="flex gap-0.5">
              <span className="w-1 h-3 bg-white rounded-full animate-pulse"></span>
              <span className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <p className="font-semibold text-sm text-white truncate leading-tight">{song.trackName}</p>
        <p className="text-xs text-gray-400 truncate">{song.collectionName}</p>
        <p className="text-xs text-cyan-400 truncate">{song.match_reason}</p>
      </div>

      {/* Feature match badges */}
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1">
        <div className={`px-1 py-1 rounded text-[9px] sm:text-[10px] text-center leading-tight truncate ${
          song.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
          song.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
          'bg-red-500/30 text-red-300'
        }`}>
          <span className="hidden sm:inline">Tempo:</span><span className="sm:hidden">T:</span>{Math.round(song.tempo_match * 100)}%
        </div>
        <div className={`px-1 py-1 rounded text-[9px] sm:text-[10px] text-center leading-tight truncate ${
          song.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
          song.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
          'bg-red-500/30 text-red-300'
        }`}>
          <span className="hidden sm:inline">Energy:</span><span className="sm:hidden">E:</span>{Math.round(song.energy_match * 100)}%
        </div>
        <div className={`px-1 py-1 rounded text-[9px] sm:text-[10px] text-center leading-tight truncate ${
          song.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
          song.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
          'bg-red-500/30 text-red-300'
        }`}>
          <span className="hidden sm:inline">Mood:</span><span className="sm:hidden">M:</span>{Math.round(song.mood_match * 100)}%
        </div>
        <div className={`px-1 py-1 rounded text-[9px] sm:text-[10px] text-center leading-tight truncate ${
          song.dance_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
          song.dance_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
          'bg-red-500/30 text-red-300'
        }`}>
          <span className="hidden sm:inline">Dance:</span><span className="sm:hidden">D:</span>{Math.round(song.dance_match * 100)}%
        </div>
      </div>
    </div>
  );
};

const SongDetails = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { songid } = useParams();
  const location = useLocation();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);
  const { audioFeatures } = useAudioFeatures();
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [targetSong, setTargetSong] = useState(null);
  const [artistSongs, setArtistSongs] = useState([]);
  const [similarSongs, setSimilarSongs] = useState([]);
  const [targetFeatures, setTargetFeatures] = useState(null);
  const [mlInfo, setMlInfo] = useState(null);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  // Parse song data from URL state or fetch it
  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get song data from location state (passed from SimilarSongs/TopCharts/Discover)
        let songData = location.state?.song;
        
        // If no state (direct navigation), fetch from API
        if (!songData && songid) {
           try {
              // Public fetch
              const fetchedSong = await productService.getProductById(songid);
              if (fetchedSong) {
                  // Normalize DB product to Song format
                  songData = {
                      id: fetchedSong.productId,
                      trackId: fetchedSong.productId,
                      trackName: fetchedSong.albumTitle,
                      artistName: fetchedSong.artistName,
                      collectionName: fetchedSong.albumTitle,
                      artworkUrl100: fetchedSong.albumCoverImageUrl,
                      previewUrl: fetchedSong.fileUrl,
                      fileUrl: fetchedSong.fileUrl,
                      price: fetchedSong.albumPrice,
                      source: 'database'
                  };
              }
           } catch (e) {
               console.warn("Failed to fetch song by ID:", e);
           }
        }
        
        const allArtistSongsData = location.state?.artistSongs || [];
        const fromDiscover = location.state?.fromDiscover || false;
        
        if (!songData) {
          setError('Song not found.');
          setLoading(false);
          return;
        }
        
        setTargetSong(songData);
        
        if (fromDiscover) {
          // Filter out zip files and non-audio content
          const validSongs = allArtistSongsData.filter(s => {
             const url = s.previewUrl || s.fileUrl;
             return url && !url.toLowerCase().includes('.zip');
          });

          const targetUrl = songData.previewUrl || songData.fileUrl;
          const isTargetAudio = targetUrl && !targetUrl.toLowerCase().includes('.zip');

          setArtistSongs(validSongs);
          if (validSongs.length > 0 && isTargetAudio) {
            await computeMLSimilarity(songData, validSongs);
          } else {
            console.log("Skipping ML similarity: Target is not audio or no valid comparison songs");
            setLoading(false);
             if (!isTargetAudio) {
                 setError('ML Similarity not available for non-audio (ZIP) content.');
            } else {
                 setError('No other songs available for comparison.');
            }
          }
        } else {
          // Filter artist songs to only include songs from the same artist
          const artistName = songData.artistName?.toLowerCase() || '';
          const filteredArtistSongs = allArtistSongsData.filter(s => {
            const url = s.previewUrl || s.fileUrl;
            const isAudio = url && !url.toLowerCase().includes('.zip');
            const isSameArtist = s.artistName?.toLowerCase().includes(artistName.split(' ')[0]);
            
            return isAudio && isSameArtist && s.trackId !== songData.trackId;
          });
          
          setArtistSongs(filteredArtistSongs);

          const targetUrl = songData.previewUrl || songData.fileUrl;
          const isTargetAudio = targetUrl && !targetUrl.toLowerCase().includes('.zip');
          
          // Compute ML similarity if we have artist songs
          if (filteredArtistSongs.length > 0 && isTargetAudio) {
            await computeMLSimilarity(songData, filteredArtistSongs);
          } else {
             // If no context, just try to get features for the target song
             if (isTargetAudio) {
                 await computeMLSimilarity(songData, []);
             } else {
                 console.log("Skipping ML similarity: Target is not audio");
                 setLoading(false);
                 if (!isTargetAudio) {
                     setError('ML Similarity not available for non-audio (ZIP) content.');
                 } else {
                     setError('No other songs from this artist available for comparison.');
                 }
             }
          }
        }
      } catch (err) {
        console.error('Error initializing page:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initializePage();
  }, [songid, location.state]);

  // Real-time update loop DISABLED (Static loading only)
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const liveFeatures = audioFeaturesRef.current;
      
  //     // Only update if we are playing the song that is being displayed
  //     const isCurrentSongActive = activeSong && targetSong && (
  //         String(activeSong.trackId || activeSong.id) === String(targetSong.trackId || targetSong.id)
  //     );
      
  //     if (isPlaying && isCurrentSongActive && liveFeatures && targetSong && artistSongs.length > 0) {
  //       // Prepare adjusted features
  //       const featuresToSend = {
  //            tempo: Number(liveFeatures.tempo),
  //            energy: Number(liveFeatures.energy),
  //            valence: Number(liveFeatures.valence),
  //            danceability: Number(liveFeatures.danceability),
  //            acousticness: Number(liveFeatures.acousticness),
  //       };

  //       computeMLSimilarity(targetSong, artistSongs, featuresToSend).catch(err => {
  //           console.warn("[SongDetails] Real-time update failed:", err);
  //       });
  //     }
  //   }, 3000);

  //   return () => clearInterval(interval);
  // }, [isPlaying, activeSong, targetSong, artistSongs]);

  // Compute ML similarity using the backend
  const computeMLSimilarity = async (targetSong, comparisonSongs, overrideFeatures = null) => {
    const apiBaseUrl = envConfig.getApiBaseUrl();
    
    try {
      // Use Unified Endpoint instead of legacy search-similarity
      
      const payload = {
          source: 'search_component', // Use search mode to enable candidates comparison
          current_product_id: String(targetSong.trackId || targetSong.id),
          preview_url: String(targetSong.previewUrl || targetSong.fileUrl || ''),
          limit: 50,
          audio_features: overrideFeatures, // Pass live features if available
          // Map comparison songs to 'candidates'
          candidates: comparisonSongs.map(song => ({
            trackId: String(song.trackId || song.id || 0),
            trackName: String(song.trackName || song.albumTitle || 'Unknown Track'),
            artistName: String(song.artistName || 'Unknown Artist'),
            collectionName: song.collectionName || song.albumTitle ? String(song.collectionName || song.albumTitle) : null,
            artworkUrl100: song.artworkUrl100 || song.albumCoverImageUrl ? String(song.artworkUrl100 || song.albumCoverImageUrl) : null,
            previewUrl: song.previewUrl || song.fileUrl ? String(song.previewUrl || song.fileUrl) : null
          }))
      };

      // Only log if not an update loop to avoid spam
      if (!overrideFeatures) {
         console.log('[SongDetails] Sending Unified Payload:', JSON.stringify(payload, null, 2));
      }

      const response = await fetch(`${apiBaseUrl}/api/audio/unified-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`ML Service Error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        // Backend returns "recommendations" which are the scored candidates
        // Filter out songs with 0 or negative similarity scores and map product_id to trackId
        const validRecommendations = (data.recommendations || [])
            .filter(song => song.similarity_score > 0)
            .map(song => ({
                ...song,
                trackId: song.product_id,
                id: song.product_id
            }));
        setSimilarSongs(validRecommendations);
        
        // It also returns "target_features" (or source_features)
        if (data.source_features) {
            setTargetFeatures(data.source_features);
            
            // Construct ML info for display
            setMlInfo({
                algorithm: "Hybrid Audio Analysis",
                features: data.source_features
            });
        }
      } else {
        throw new Error(data.message || 'Failed to analyze songs');
      }
    } catch (err) {
      console.error('ML Similarity error:', err);
      // Don't set global error if just ML fails, allow basic display
      if (!targetFeatures) {
         // Fallback if we completely failed
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle play
  const handlePlay = (song) => {
    const songToPlay = {
      id: song.trackId || song.id,
      trackId: song.trackId || song.id,
      trackName: song.trackName,
      albumTitle: song.trackName,
      artistName: song.artistName,
      artworkUrl100: song.artworkUrl100,
      albumCoverImageUrl: song.albumCoverImageUrl || song.artworkUrl100?.replace('100x100', '600x600'),
      previewUrl: song.previewUrl || song.fileUrl,
      fileUrl: song.previewUrl || song.fileUrl,
      collectionName: song.collectionName
    };
    
    dispatch(setActiveSong({ song: songToPlay, data: similarSongs.map(s => ({
      id: s.trackId,
      trackId: s.trackId,
      trackName: s.trackName,
      albumTitle: s.trackName,
      artistName: s.artistName,
      artworkUrl100: s.artworkUrl100,
      albumCoverImageUrl: s.albumCoverImageUrl || s.artworkUrl100?.replace('100x100', '600x600'),
      previewUrl: s.previewUrl || s.fileUrl,
      fileUrl: s.previewUrl || s.fileUrl,
      collectionName: s.collectionName
    })), i: similarSongs.findIndex(s => s.trackId === song.trackId) }));
    dispatch(playPause(true));
  };

  // Handle pause
  const handlePause = () => {
    dispatch(playPause(false));
  };

  // Handle play target song
  const handlePlayTarget = () => {
    if (!targetSong) return;
    
    const songToPlay = {
      id: targetSong.trackId || targetSong.id,
      trackId: targetSong.trackId || targetSong.id,
      trackName: targetSong.trackName || targetSong.albumTitle,
      albumTitle: targetSong.trackName || targetSong.albumTitle,
      artistName: targetSong.artistName,
      artworkUrl100: targetSong.artworkUrl100,
      albumCoverImageUrl: targetSong.albumCoverImageUrl || targetSong.artworkUrl100?.replace('100x100', '600x600'),
      previewUrl: targetSong.previewUrl || targetSong.fileUrl,
      fileUrl: targetSong.previewUrl || targetSong.fileUrl,
      collectionName: targetSong.collectionName
    };
    
    dispatch(setActiveSong({ song: songToPlay, data: [songToPlay], i: 0 }));
    dispatch(playPause(true));
  };

  const isTargetPlaying = activeSong?.trackId === (targetSong?.trackId || targetSong?.id) || 
                          activeSong?.id === (targetSong?.trackId || targetSong?.id);

  if (loading) {
    return <Loader title="Computing ML similarity..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <FaMusic className="text-gray-500 text-6xl mb-4" />
        <p className="text-red-400 text-lg mb-4 text-center">{error}</p>
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Back navigation */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
        >
          ← Back
        </button>

        {/* Header Section - Target Song */}
        <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/50 rounded-xl p-6 border border-gray-700">
          <div className="flex flex-col md:flex-row gap-1">
            {/* Song Info */}
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {targetSong?.trackName || targetSong?.albumTitle}
              </h1>
              <p className="text-gray-400 mb-1">{targetSong?.collectionName}</p>
            </div>

            {/* Album Art with Play */}
            <div 
              className="relative w-48 h-48 flex-shrink-0 mx-auto md:mx-0"
              onMouseEnter={() => setIsHeaderHovered(true)}
              onMouseLeave={() => setIsHeaderHovered(false)}
            >
              {(() => {
                const coverMedia = targetSong?.albumCoverImageUrl || targetSong?.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
                const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                
                return isVideo ? (
                  <AudioReactiveVideo
                    src={coverMedia}
                    alt={targetSong?.trackName}
                    className="w-full h-full rounded-lg object-cover shadow-xl"
                    isPlaying={isPlaying && isTargetPlaying}
                    isActive={isTargetPlaying}
                    playbackRate={playbackRate}
                  />
                ) : (
                  <img 
                    src={coverMedia}
                    alt={targetSong?.trackName}
                    className="w-full h-full rounded-lg object-cover shadow-xl"
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                );
              })()}
              {/* Play button overlay - only shows on hover */}
              {isHeaderHovered && (
                <div 
                  className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg cursor-pointer hover:bg-black/50 transition-colors z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHeaderHovered(false);
                    if (isPlaying && isTargetPlaying) {
                      handlePause();
                    } else {
                      handlePlayTarget();
                    }
                  }}
                >
                  {isPlaying && isTargetPlaying ? (
                    <FaPauseCircle size={45} className="text-white drop-shadow-lg hover:scale-110 transition-transform" />
                  ) : (
                    <FaPlayCircle size={45} className="text-white drop-shadow-lg hover:scale-110 transition-transform" />
                  )}
                </div>
              )}
              {/* Artist badge */}
              <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 ${getArtistBadgeColor(targetSong?.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg whitespace-nowrap`}>
                {targetSong?.artistName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Similar Songs Section */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-white">
            Top {similarSongs.length} Most Similar Songs by {targetSong?.artistName}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Ranked by ML cosine similarity in normalized audio feature space (tempo, energy, valence, danceability, acousticness)
          </p>
        </div>

        {similarSongs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {similarSongs.map((song, index) => (
              <SimilarSongCard
                key={song.trackId}
                song={song}
                isPlaying={isPlaying}
                activeSong={activeSong}
                onPlay={handlePlay}
                onPause={handlePause}
                rank={index + 1}
                playbackRate={playbackRate}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FaMusic className="text-gray-600 text-5xl mx-auto mb-4" />
            <p className="text-gray-400">No similar songs found from this artist.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SongDetails;
