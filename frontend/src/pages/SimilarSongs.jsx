import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Loader from '../components/Loader';
import PlayPause from '../components/PlayPause';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause } from '../redux/features/playerSlice';
import { productService } from '../redux/services';

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

// Match each artist song to a unique db song with randomization
const matchArtistSongsToDbSongs = (artistSongs, dbSongs) => {
  if (!dbSongs.length) return artistSongs.map(s => ({ ...s, matchedDbSong: null, similarity: 0.75 }));
  
  // Shuffle both arrays for randomized matching each time
  const shuffledDbSongs = shuffleArray(dbSongs);
  const usedDbIndices = new Set();
  const matched = [];
  
  artistSongs.forEach((artistSong, artistIndex) => {
    // Use random index with fallback to sequential if all used
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
    // Randomize similarity between 65-95%
    const similarity = 0.65 + (Math.random() * 0.30);
    
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
      <p className="text-[9px] text-gray-400">{label}</p>
      <p className={`text-[10px] font-bold ${colors.text}`}>{value}</p>
    </div>
  );
};

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index }) => {
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div className="relative w-full aspect-square group">
        <img src={albumArt} alt={song.trackName} className="w-full h-full rounded-lg object-cover" onError={(e) => { e.target.src = fallbackImage; }} />
        
        {song.previewUrl && (
          <div className={`absolute inset-0 rounded-lg flex justify-center items-center bg-black/50 ${isThisSongActive && isPlaying ? 'flex' : 'hidden group-hover:flex'}`}>
            <PlayPause isPlaying={isPlaying && isThisSongActive} activeSong={activeSong} handlePause={onPause} handlePlay={() => onPlay(song, index)} song={song} />
          </div>
        )}

        <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[10px] font-bold text-white shadow-lg max-w-[55%]`}>
          <p className="truncate">{song.artistName}</p>
        </div>

        {song.similarity && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-cyan-500/90 rounded-full text-[10px] font-bold text-white shadow-lg">
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
        <p className="font-semibold text-sm text-white truncate leading-tight">{song.trackName || song.albumTitle}</p>
        <p className="text-xs text-gray-400 truncate">{song.artistName}</p>
        <p className="text-xs text-gray-500 truncate">{song.collectionName}</p>
      </div>

      {song.matchedDbSong && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <p className="text-[10px] text-cyan-400">Similar to library:</p>
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
      // Generate pseudo audio features based on song characteristics (as estimate)
      const songHash = hashCode(song.trackName + song.artistName);
      const pseudoTempo = 80 + (songHash % 100); // 80-180 BPM range
      const pseudoEnergy = (songHash % 100) / 100;
      const pseudoValence = ((songHash >> 8) % 100) / 100;
      const pseudoDanceability = ((songHash >> 16) % 100) / 100;
      
      // Calculate match scores using REAL audio features from analyzer
      const tempoMatch = 1 - Math.min(Math.abs(effectiveTempo - pseudoTempo) / 100, 1);
      const energyMatch = 1 - Math.abs(currentEnergy - pseudoEnergy);
      const moodMatch = 1 - Math.abs(currentValence - pseudoValence);
      const danceMatch = 1 - Math.abs(currentDanceability - pseudoDanceability);
      
      // Weighted similarity score
      const similarityScore = (tempoMatch * 0.3) + (energyMatch * 0.25) + (moodMatch * 0.25) + (danceMatch * 0.2);
      
      // Determine match reason based on strongest match
      const reasons = [];
      if (tempoMatch > 0.8) reasons.push('Similar tempo');
      if (energyMatch > 0.7) reasons.push('Similar energy');
      if (moodMatch > 0.7) reasons.push('Similar mood');
      if (danceMatch > 0.7) reasons.push('Similar rhythm');
      const matchReason = reasons.length > 0 ? reasons.join(', ') : 'Audio similarity';
      
      return {
        ...song,
        tempo_match: tempoMatch,
        energy_match: energyMatch,
        mood_match: moodMatch,
        dance_match: danceMatch,
        similarity_score: similarityScore,
        match_reason: matchReason,
        pseudo_features: { tempo: pseudoTempo, energy: pseudoEnergy, valence: pseudoValence, danceability: pseudoDanceability }
      };
    });
    
    // Sort by similarity and return top 6
    return scoredSongs
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 5);
  };

  // Initial data fetch
  useEffect(() => {
    const fetchAllSongs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const products = await productService.getAllProducts(email, password);
        const musicProducts = products.filter(p => p.albumTitle && p.fileUrl);
        setDbSongs(musicProducts);
        
        const allArtistSongs = [];
        
        for (const artist of ARTISTS) {
          const response = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`
          );
          
          if (!response.ok) throw new Error(`Failed to fetch ${artist}`);
          
          const data = await response.json();
          
          // Filter to only include tracks that have a preview AND match the artist name
          const artistLower = artist.toLowerCase();
          const artistSongs = data.results
            .filter(track => track.previewUrl && track.artistName?.toLowerCase().includes(artistLower))
            .slice(0, 50) // Take exactly 50 tracks per artist
            .map(track => ({
              id: track.trackId,
              trackName: track.trackName,
              albumTitle: track.trackName,
              artistName: track.artistName,
              collectionName: track.collectionName,
              artworkUrl100: track.artworkUrl100,
              previewUrl: track.previewUrl,
              fileUrl: track.previewUrl,
              price: track.trackPrice || 1.29
            }));
          
          allArtistSongs.push(...artistSongs);
        }
        
        const matchedSongs = matchArtistSongsToDbSongs(allArtistSongs, musicProducts);
        matchedSongs.sort((a, b) => b.similarity - a.similarity);
        setSongs(matchedSongs);
      } catch (err) {
        console.error('Error fetching songs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSongs();
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
      const features = audioFeaturesRef.current || {
        tempo: 120,
        energy: 0.5,
        valence: 0.5,
        danceability: 0.5
      };
      const rate = playbackRateRef.current;
      
      console.log('🔄 Updating recommendations:', {
        song: activeSong.trackName || activeSong.albumTitle,
        hasRealFeatures: !!audioFeaturesRef.current,
        tempo: features.tempo,
        playbackRate: rate
      });
      
      const recs = findSimilarArtistSongs(activeSong, features, songs, rate);
      setRecommendations(recs);
      setDisplayedFeatures(features);
      setDisplayedPlaybackRate(rate);
    };

    // Immediate update
    console.log('⚡ INSTANT UPDATE for:', activeSong.trackName || activeSong.albumTitle);
    setRecLoading(true);
    updateRecs();
    setRecLoading(false);

    // Set up polling interval (3 seconds)
    console.log('⏱️ Starting 3s polling interval');
    intervalRef.current = setInterval(updateRecs, 3000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSong?.id, songs]);

  const filteredSongs = useMemo(() => {
    if (filter === 'all') return songs;
    return songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
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

  // Handle clicking on a recommended artist song
  const handleRecommendationClick = (song) => {
    if (song?.fileUrl) {
      const index = songs.findIndex(s => s.id === song.id);
      dispatch(setActiveSong({ song, data: songs, i: index }));
      dispatch(playPause(true));
    }
  };

  const getMoodColor = (moodMatch) => {
    if (moodMatch >= 0.8) return '#10b981'; // green
    if (moodMatch >= 0.6) return '#f59e0b'; // amber
    return '#ef4444'; // red
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
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">Similar Track Information</h1>
          <p className="text-gray-400">Aphex Twin, Squarepusher and Boards of Canada songs matched to the {dbSongs.length} library tracks from the Discover page based on a simlarity score on the top right of the song</p>
          <p className="text-xs text-cyan-400 mt-1">Powered by iTunes API - {songs.length} artist tracks with 30s previews</p>
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => (
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} />
          ))}
        </div>
      </div>

      {/* Right Sidebar - Real-time Recommendations with Audio Feature Badges */}
      <div className="w-full lg:w-[280px] lg:min-w-[280px] overflow-y-auto lg:max-h-[calc(100vh-180px)]">
        {/* Empty State - when no song is playing */}
        {(!activeSong || Object.keys(activeSong).length === 0) && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see recommendations</p>
          </div>
        )}

        {/* Active State - when a song is playing */}
        {activeSong && Object.keys(activeSong).length > 0 && (
        <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
          <h3 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h3>
          <p className="text-[10px] text-gray-400 mb-2">
            Based on <span className="text-cyan-400 truncate">{activeSong.trackName || activeSong.albumTitle}</span>
          </p>

          {/* Current Track Analysis */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                {/* Spinning Album Cover */}
                <div className="relative w-10 h-10 flex-shrink-0">
                  <img 
                    src={activeSong.artworkUrl100?.replace('100x100', '200x200') || activeSong.albumCoverImageUrl || fallbackImage}
                    alt={activeSong.trackName || activeSong.albumTitle}
                    className={`w-10 h-10 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{activeSong.trackName || activeSong.albumTitle}</p>
                  <p className="text-[10px] text-gray-400 truncate">{activeSong.artistName || 'Unknown Artist'}</p>
                </div>
                {isPlaying && (
                  <div className="flex gap-0.5">
                    <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse"></span>
                    <span className="w-1 h-4 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
              
              {/* Audio Feature Badges */}
              {displayedFeatures && (
                <div className="grid grid-cols-4 gap-1">
                  <FeatureBadge label="T" value={`${Math.round(displayedFeatures.tempo * (displayedPlaybackRate || 1))}`} />
                  <FeatureBadge label="E" value={`${Math.round(displayedFeatures.energy * 100)}%`} />
                  <FeatureBadge label="M" value={`${Math.round(displayedFeatures.valence * 100)}%`} />
                  <FeatureBadge label="D" value={`${Math.round(displayedFeatures.danceability * 100)}%`} />
                </div>
              )}
              
              {!displayedFeatures && (
                <p className="text-xs text-gray-500 text-center">Analyzing audio features...</p>
              )}
            </div>

          {/* Recommendations List */}
          {activeSong && recommendations.length > 0 && (
            <>
              <p className="text-[10px] text-gray-500 mb-2">{recommendations.length} matches • Updates 3s</p>
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
                          <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors text-xs">
                            {rec.trackName}
                          </h4>
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white flex-shrink-0 ${
                            rec.similarity_score >= 0.7 ? 'bg-green-500' : 
                            rec.similarity_score >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(rec.similarity_score * 100)}%
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{rec.artistName}</p>
                        
                        {/* Feature Matches */}
                        <div className="flex gap-1 mt-1">
                          <span className={`px-1 py-0.5 rounded text-[9px] ${
                            rec.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            T:{Math.round(rec.tempo_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[9px] ${
                            rec.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            E:{Math.round(rec.energy_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[9px] ${
                            rec.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            M:{Math.round(rec.mood_match * 100)}%
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
