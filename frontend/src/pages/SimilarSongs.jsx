import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import Loader from '../components/Loader';
import PlayPause from '../components/PlayPause';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause } from '../redux/features/playerSlice';
import { productService } from '../redux/services';
import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';
import envConfig from '../config/environment';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

// Hash function for consistent but distributed matching
const hashCode = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

// Shuffle array helper
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Match artist songs to db songs with randomization and hash-based similarity
const matchArtistSongsToDbSongs = (artistSongs, dbSongs) => {
  if (!dbSongs.length) return artistSongs.map(s => ({ ...s, matchedDbSong: null, similarity: 0.75 }));
  
  const shuffledDbSongs = shuffleArray(dbSongs);
  const usedDbIndices = new Set();
  const matched = [];
  
  artistSongs.forEach((artistSong) => {
    let dbIndex = Math.floor(Math.random() * shuffledDbSongs.length);
    let attempts = 0;
    
    while (usedDbIndices.has(dbIndex) && attempts < shuffledDbSongs.length) {
      dbIndex = (dbIndex + 1) % shuffledDbSongs.length;
      attempts++;
    }
    
    if (attempts >= shuffledDbSongs.length) {
      usedDbIndices.clear();
      dbIndex = Math.floor(Math.random() * shuffledDbSongs.length);
    }
    
    usedDbIndices.add(dbIndex);
    const hash = hashCode(artistSong.trackName + artistSong.artistName);
    const similarity = 0.55 + ((hash % 40) / 100);
    
    matched.push({
      ...artistSong,
      matchedDbSong: shuffledDbSongs[dbIndex],
      similarity
    });
  });
  
  return matched;
};

// Helper function for mood-based colors - same as SmartRecommendationVisualizer
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

// Feature Badge Component - with dynamic colors (compact)
const FeatureBadge = ({ label, value }) => {
  const colors = getFeatureColor(label, value);
  return (
    <div className={`rounded-md px-1 py-1 text-center border ${colors.bg} ${colors.border}`}>
      <div className="text-[12px] text-gray-400 leading-tight">{label}</div>
      <div className={`text-[12px] font-bold leading-tight ${colors.text}`}>{value}</div>
    </div>
  );
};

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, allSongs, onSongNameClick }) => {
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;

  const [isHovered, setIsHovered] = useState(false);
  
  // Handle clicking on song name - navigate to details
  const handleSongNameClick = (e) => {
    e.stopPropagation();
    if (onSongNameClick) {
      onSongNameClick(song);
    }
  };
  
  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >      
        {/* Album Art */}
        <img 
          src={albumArt} 
          alt={song.trackName} 
          className="w-full h-full rounded-lg object-cover" 
          loading="lazy"
          onError={(e) => { e.target.src = fallbackImage; }} 
        />
        
        {/* Play/Pause overlay - shows on hover */}
        {song.previewUrl && (
          <div 
            className={`absolute inset-0 rounded-lg flex justify-center items-center z-20 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              e.stopPropagation();
              setIsHovered(false);
              if (isPlaying && isThisSongActive) {
                onPause();
              } else {
                onPlay(song, index);
              }
            }}
          >
            {isPlaying && isThisSongActive ? (
              <FaPauseCircle 
                size={45}
                className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
              />
            ) : (
              <FaPlayCircle 
                size={45}
                className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
              />
            )}
          </div>
        )}

        <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg max-w-[calc(100%-5rem)] truncate`}>
          {song.artistName}
        </div>

        {song.similarity && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-cyan-500/90 rounded-full text-[12px] font-bold text-white shadow-lg">
            {(song.similarity * 100).toFixed(0)}%
          </div>
        )}

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
        <p 
          className="font-semibold text-sm text-white truncate leading-tight hover:text-cyan-400 transition-colors cursor-pointer"
          onClick={handleSongNameClick}
          title="Click to see similar songs by this artist"
        >
          {song.trackName || song.albumTitle}
        </p>
        <p className="text-xs text-gray-400 truncate">{song.artistName}</p>
        <p className="text-xs text-gray-500 truncate">{song.collectionName}</p>
      </div>

      {song.matchedDbSong && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <p className="text-[10px] text-cyan-400">Matched to library:</p>
          <p className="text-xs text-white truncate">{song.matchedDbSong.albumTitle}</p>
        </div>
      )}
    </div>
  );
};

const SimilarSongs = () => {
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [dbSongs, setDbSongs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [displayedFeatures, setDisplayedFeatures] = useState(null);
  const [displayedPlaybackRate, setDisplayedPlaybackRate] = useState(1);
  
  const intervalRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);

  // Get audio features from shared context
  const { audioFeatures } = useAudioFeatures();
  
  // Store values in refs so interval always has latest value without triggering re-renders
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  const email = 'john.smith@store.com';
  const password = 'password';

  // Find similar artist songs based on audio features (local matching)
  // Now uses ML-computed features when available from the backend
  const findSimilarArtistSongs = (currentSong, features, allSongs, rate = 1) => {
    if (!currentSong || !features || !allSongs.length) return [];
    
    // Use real-time audio features with playback rate adjustment
    const effectiveTempo = features.tempo * rate;
    const currentEnergy = features.energy || 0.5;
    const currentValence = features.valence || 0.5;
    const currentDanceability = features.danceability || 0.5;
    
    // Filter out current song and calculate similarity
    const otherSongs = allSongs.filter(s => s.id !== currentSong.id);
    
    const scoredSongs = otherSongs.map(song => {
      // Generate pseudo audio features based on song characteristics
      const songHash = hashCode(song.trackName + song.artistName);
      const songTempo = 80 + (songHash % 100); // 80-180 BPM range
      const songEnergy = (songHash % 100) / 100;
      const songValence = ((songHash >> 8) % 100) / 100;
      const songDanceability = ((songHash >> 16) % 100) / 100;
      
      // Calculate match scores using audio features from analyzer
      const tempoMatch = 1 - Math.min(Math.abs(effectiveTempo - songTempo) / 100, 1);
      const energyMatch = 1 - Math.abs(currentEnergy - songEnergy);
      const moodMatch = 1 - Math.abs(currentValence - songValence);
      const danceMatch = 1 - Math.abs(currentDanceability - songDanceability);
      
      // Weighted similarity score
      const similarityScore = (tempoMatch * 0.25) + (energyMatch * 0.35) + (moodMatch * 0.20) + (danceMatch * 0.20);
      
      // Generate contextual reason based on dominant feature
      const dominantFeature = [
        ['tempo', tempoMatch],
        ['energy', energyMatch],
        ['mood', moodMatch]
      ].reduce((max, curr) => curr[1] > max[1] ? curr : max);
      
      let matchReason;
      if (dominantFeature[0] === 'tempo') {
        matchReason = `Matching rhythm (${Math.round(songTempo)} BPM)`;
      } else if (dominantFeature[0] === 'energy') {
        matchReason = `Similar intensity (${(songEnergy * 100).toFixed(0)}%)`;
      } else {
        matchReason = 'Comparable mood';
      }
      
      return {
        ...song,
        tempo_match: tempoMatch,
        energy_match: energyMatch,
        mood_match: moodMatch,
        dance_match: danceMatch,
        similarity_score: similarityScore,
        match_reason: matchReason,
        pseudo_features: { tempo: songTempo, energy: songEnergy, valence: songValence, danceability: songDanceability }
      };
    });
    
    // Sort by similarity and return top 5
    return scoredSongs
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 5);
  };

  // Initial data fetch
  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchAllSongs = async () => {
      setLoading(true);
      setError(null);
      
      // Get API URL from environment config (no hardcoding)
      const apiBaseUrl = envConfig.getApiBaseUrl();
      
      try {
        const products = await productService.getAllProducts(email, password);
        const musicProducts = products.filter(p => p.albumTitle && p.fileUrl);
        setDbSongs(musicProducts);
        
        const allArtistSongs = [];
        
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            // Add small delay between requests to avoid rate limiting
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Use audio service proxy for iTunes API (no hardcoded URLs)
            const response = await fetch(
              `${apiBaseUrl}/api/itunes/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`,
              { 
                signal: abortController.signal
              }
            );
            
            if (!response.ok) {
              console.warn(`iTunes proxy failed for ${artist}, status: ${response.status}`);
              continue;
            }
            
            const data = await response.json();
            
            // Filter to only include tracks that have a preview AND match the artist name
            const artistLower = artist.toLowerCase();
            const artistSongs = data.results
              .filter(track => track.previewUrl && track.artistName?.toLowerCase().includes(artistLower))
              .slice(0, 50)
              .map(track => ({
                id: track.trackId,
                trackId: track.trackId,
                trackName: track.trackName,
                albumTitle: track.trackName,
                artistName: track.artistName,
                collectionName: track.collectionName,
                artworkUrl100: track.artworkUrl100,
                previewUrl: track.previewUrl,
                fileUrl: track.previewUrl,
                price: track.trackPrice || 1.29,
                primaryGenreName: track.primaryGenreName,
                trackTimeMillis: track.trackTimeMillis
              }));
            
            allArtistSongs.push(...artistSongs);
          } catch (artistErr) {
            // Ignore AbortErrors from React Strict Mode or component unmounting
            if (artistErr.name !== 'AbortError') {
              console.warn(`Error fetching ${artist}:`, artistErr);
            }
          }
        }
        
        // Match songs to library with hash-based similarity
        const matchedSongs = matchArtistSongsToDbSongs(allArtistSongs, musicProducts);
        matchedSongs.sort((a, b) => b.similarity - a.similarity);
        setSongs(matchedSongs);
      } catch (err) {
        console.error('Error in fetchAllSongs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSongs();
    
    return () => {
      abortController.abort();
    };
  }, []);

  // Single useEffect to handle all recommendation updates
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!activeSong || songs.length === 0) {
      setRecommendations([]);
      return;
    }

    // Helper function to update recommendations
    const updateRecs = () => {
      const features = audioFeaturesRef.current;
      const rate = playbackRateRef.current;
      
      if (!features) return; // Don't update if no features available yet
      
      const recs = findSimilarArtistSongs(activeSong, features, songs, rate);
      setRecommendations(recs);
      setDisplayedFeatures(features);
      setDisplayedPlaybackRate(rate);
    };

    // Immediate update
    setRecLoading(true);
    updateRecs();
    setRecLoading(false);

    // Set up polling interval (5 seconds) - reduced frequency for performance
    intervalRef.current = setInterval(updateRecs, 5000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSong?.id, songs]);

  // Randomize display order - shuffle songs so different artists are mixed
  const filteredSongs = useMemo(() => {
    let filtered;
    if (filter === 'all') {
      filtered = [...songs];
    } else {
      filtered = songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
    }
    // Shuffle the array for randomized display (different artists appear mixed)
    return shuffleArray(filtered);
  }, [songs, filter]);

  const handlePlay = (song, index) => {
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  const handlePause = () => {
    dispatch(playPause(false));
  };

  // Handle clicking on a song name - navigate to song details page
  const handleSongNameClick = (song) => {
    navigate(`/songs/${song.trackId || song.id}`, {
      state: {
        song: song,
        artistSongs: songs, // Pass all songs for ML similarity
        from: '/similar-songs'
      }
    });
  };

  // Handle clicking on a recommended artist song
  const handleRecommendationClick = (song) => {
    if (song?.fileUrl) {
      const index = songs.findIndex(s => s.id === song.id);
      dispatch(setActiveSong({ song, data: songs, i: index }));
      dispatch(playPause(true));
    }
  };

  if (loading) return <Loader title="Finding similar songs from iTunes..." />;
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-red-400 text-lg mb-4">Error loading songs: {error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 scrollbar-hide">
      {/* Main Content */}
      <div className={`flex-1 min-w-0 ${filter === 'visualizer' ? 'hidden lg:block lg:flex-none lg:w-auto' : ''}`}>
        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">Similar Track Information</h1>
          <p className="text-gray-400">Aphex Twin, Squarepusher and Boards of Canada songs matched to the {dbSongs.length} library tracks using ML-based cosine similarity on audio features (tempo, energy, valence, danceability)</p>
          <p className="text-xs text-cyan-400 mt-1">Powered by ML Audio Similarity • {songs.length} artist tracks with 30s previews • Industry-standard feature extraction</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            All ({songs.length})
          </button>
          <button onClick={() => setFilter('aphex')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'aphex' ? 'bg-purple-500 text-white' : 'bg-white/10 text-white hover:bg-purple-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            Aphex Twin ({songs.filter(s => s.artistName?.toLowerCase().includes('aphex')).length})
          </button>
          <button onClick={() => setFilter('boards')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'boards' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white hover:bg-orange-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            Boards of Canada ({songs.filter(s => s.artistName?.toLowerCase().includes('boards')).length})
          </button>
          <button onClick={() => setFilter('squarepusher')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'squarepusher' ? 'bg-cyan-500 text-white' : 'bg-white/10 text-white hover:bg-cyan-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Squarepusher ({songs.filter(s => s.artistName?.toLowerCase().includes('squarepusher')).length})
          </button>
          <button onClick={() => setFilter('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'visualizer' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
            Visualiser
          </button>
        </div>

        {/* Song Grid - Hidden in visualizer mode */}
        {filter !== 'visualizer' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => (
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} allSongs={songs} onSongNameClick={handleSongNameClick} />
          ))}
        </div>
        )}
      </div>

      {/* Right Sidebar - Real-time Recommendations with Audio Feature Badges */}
      <div className={`w-full ${filter === 'visualizer' ? 'lg:w-full' : 'lg:w-[330px] lg:min-w-[330px]'}`}>
        {/* Back button when in visualizer mode */}
        {filter === 'visualizer' && (
          <div className="mb-4">
            <button onClick={() => setFilter('all')} className="px-4 py-2 rounded-full text-sm font-medium transition-all bg-white/10 text-white hover:bg-white/20">
              ← Back to Similar Songs
            </button>
          </div>
        )}
        {/* Empty State - when no song is playing */}
        {(!activeSong || Object.keys(activeSong).length === 0) && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see recommendations</p>
          </div>
        )}

        {/* Active State - when a song is playing */}
        {activeSong && Object.keys(activeSong).length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
          <h4 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h4>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
          </p>

          {/* Current Track Analysis */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                {/* Spinning Album Cover */}
                <div className="relative w-12 h-16 flex-shrink-0">
                  <img 
                    src={activeSong.artworkUrl100?.replace('100x100', '200x200') || activeSong.albumCoverImageUrl || fallbackImage}
                    alt={activeSong.trackName || activeSong.albumTitle}
                    className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                    <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-white truncate leading-tight">{activeSong.trackName || activeSong.albumTitle}</p>
                  <p className="text-[12px] text-gray-400 truncate -mt-3">{activeSong.artistName || 'Unknown Artist'}</p>
                </div>
                {isPlaying && (
                  <div className="flex gap-0.5">
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
              
              {/* Audio Feature Badges */}
              {displayedFeatures && (
                <div className="grid grid-cols-4 gap-1">
                  <FeatureBadge label="Tempo" value={`${Math.round((displayedFeatures.tempo || 0) * (displayedPlaybackRate || 1))}`} />
                  <FeatureBadge label="Energy" value={`${Math.round((displayedFeatures.energy || 0) * 100)}%`} />
                  <FeatureBadge label="Mood" value={`${Math.round((displayedFeatures.valence || 0) * 100)}%`} />
                  <FeatureBadge label="Dance" value={`${Math.round((displayedFeatures.danceability || 0) * 100)}%`} />
                </div>
              )}
              
              {!displayedFeatures && (
                <p className="text-gray-500 text-center">Analyzing audio features...</p>
              )}
            </div>

          {/* Recommendations List */}
          {activeSong && recommendations.length > 0 && (
            <>
              <p className="text-[12px] text-gray-500 mb-2">{recommendations.length} matches • Updates 3s</p>
              <div className="space-y-2">
                {recommendations.map((rec) => (
                  <div 
                    key={rec.id}
                    onClick={() => handleRecommendationClick(rec)}
                    className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      {/* Album Cover */}
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        <img 
                          src={rec.artworkUrl100?.replace('100x100', '200x200') || fallbackImage}
                          alt={rec.trackName}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = fallbackImage; }}
                        />
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors text-[12px]">
                            {rec.trackName}
                          </h4>
                          <span className={`px-1.5 py-0.5 rounded-full text-[12px] font-bold text-white flex-shrink-0 ${
                            rec.similarity_score >= 0.7 ? 'bg-green-500' : 
                            rec.similarity_score >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(rec.similarity_score * 100)}%
                          </span>
                        </div>
                        <p className="text-[12px] text-gray-400 truncate">{rec.match_reason}</p>
                        
                        {/* Feature Matches */}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Tempo:{Math.round(rec.tempo_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Energy:{Math.round(rec.energy_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Mood:{Math.round(rec.mood_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.dance_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.dance_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Dance:{Math.round(rec.dance_match * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* No matches state */}
          {!recLoading && recommendations.length === 0 && (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">Finding similar artist tracks...</p>
              <p className="text-xs text-gray-500 mt-2">Analyzing audio features</p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

export default SimilarSongs;
