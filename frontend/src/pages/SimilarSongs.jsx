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

// Feature Badge Component
const FeatureBadge = ({ label, value, color = 'cyan' }) => (
  <div className="bg-gray-800/80 rounded-lg p-2 text-center">
    <p className="text-xs text-gray-400">{label}</p>
    <p className={`text-sm font-bold text-${color}-400`}>{value}</p>
  </div>
);

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index }) => {
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  return (
    <div className="flex flex-col w-[250px] p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div className="relative w-full h-48 group">
        <img src={albumArt} alt={song.trackName} className="w-full h-full rounded-lg object-cover" onError={(e) => { e.target.src = fallbackImage; }} />
        
        {song.previewUrl && (
          <div className={`absolute inset-0 rounded-lg flex justify-center items-center bg-black/50 ${isThisSongActive && isPlaying ? 'flex' : 'hidden group-hover:flex'}`}>
            <PlayPause isPlaying={isPlaying && isThisSongActive} activeSong={activeSong} handlePause={onPause} handlePlay={() => onPlay(song, index)} song={song} />
          </div>
        )}

        <div className={`absolute top-2 left-1 px-1 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-xs font-bold text-white shadow-lg max-w-[60%] truncate`}>
          {song.artistName}
        </div>

        {song.similarity && (
          <div className="absolute top-2 right-2 px-1 py-1 bg-cyan-500/90 rounded-full text-xs font-bold text-white shadow-lg">
            {(song.similarity * 100).toFixed(0)}% Match
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

      <div className="mt-3 flex flex-col">
        <p className="font-semibold text-base text-white truncate">{song.trackName || song.albumTitle}</p>
        <p className="text-sm text-gray-400 truncate">{song.artistName}</p>
        <p className="text-xs text-gray-500 truncate">{song.collectionName}</p>
      </div>

      {song.matchedDbSong && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <p className="text-xs text-cyan-400">Similar to my library:</p>
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
  
  const intervalRef = useRef(null);
  const dispatch = useDispatch();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);
  
  // Get audio features from shared context
  const { audioFeatures } = useAudioFeatures();

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
      .slice(0, 6);
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
            `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=20`
          );
          
          if (!response.ok) throw new Error(`Failed to fetch ${artist}`);
          
          const data = await response.json();
          
          const artistSongs = data.results
            .filter(track => track.previewUrl)
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
      const features = audioFeatures || {
        tempo: 120,
        energy: 0.5,
        valence: 0.5,
        danceability: 0.5
      };
      
      console.log('🔄 Updating recommendations:', {
        song: activeSong.trackName || activeSong.albumTitle,
        hasRealFeatures: !!audioFeatures,
        tempo: features.tempo,
        playbackRate
      });
      
      const recs = findSimilarArtistSongs(activeSong, features, songs, playbackRate);
      setRecommendations(recs);
    };

    // Immediate update
    console.log('⚡ INSTANT UPDATE for:', activeSong.trackName || activeSong.albumTitle);
    setRecLoading(true);
    updateRecs();
    setRecLoading(false);

    // Set up polling interval
    console.log('⏱️ Starting 2s polling interval');
    intervalRef.current = setInterval(updateRecs, 2000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSong?.id, audioFeatures, songs, playbackRate]);

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
    <div className="flex flex-col xl:flex-row gap-6">
      {/* Main Content */}
      <div className="flex-1">
        <div className="mb-6">
          <h1 className="font-bold text-3xl text-white mb-2">Similar Tracks</h1>
          <p className="text-gray-400">Aphex Twin, Squarepusher and Boards of Canada songs matched to my {dbSongs.length} library tracks from the Discover page based on a simlarity score on the top right of the song</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredSongs.map((song, i) => (
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} />
          ))}
        </div>
      </div>

      {/* Right Sidebar - Real-time Recommendations with Audio Feature Badges */}
      <div className="xl:w-[400px] 2xl:w-[450px]">
        <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800 sticky top-6">
          <h3 className="text-lg font-bold text-white mb-1">Similar Artist Tracks</h3>
          <p className="text-xs text-gray-400 mb-4">
            {activeSong ? (
              <>Similar tracks based on <span className="text-cyan-400">{activeSong.trackName || activeSong.albumTitle}</span></>
            ) : (
              'Play a song to see similar artist tracks'
            )}
          </p>

          {/* Current Track Analysis */}
          {activeSong && Object.keys(activeSong).length > 0 && (
            <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                {/* Spinning Album Cover */}
                <div className="relative w-14 h-14 flex-shrink-0">
                  <img 
                    src={activeSong.artworkUrl100?.replace('100x100', '200x200') || activeSong.albumCoverImageUrl || fallbackImage}
                    alt={activeSong.trackName || activeSong.albumTitle}
                    className={`w-14 h-14 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 rounded-full bg-gray-900 border border-gray-700"></div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{activeSong.trackName || activeSong.albumTitle}</p>
                  <p className="text-xs text-gray-400 truncate">{activeSong.artistName || 'Unknown Artist'}</p>
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
              {audioFeatures && (
                <div className="grid grid-cols-4 gap-2">
                  <FeatureBadge label="Tempo" value={`${Math.round(audioFeatures.tempo * (playbackRate || 1))} BPM`} />
                  <FeatureBadge label="Energy" value={`${Math.round(audioFeatures.energy * 100)}%`} />
                  <FeatureBadge label="Mood" value={`${Math.round(audioFeatures.valence * 100)}%`} />
                  <FeatureBadge label="Dance" value={`${Math.round(audioFeatures.danceability * 100)}%`} />
                </div>
              )}
              
              {!audioFeatures && (
                <p className="text-xs text-gray-500 text-center">Analyzing audio features...</p>
              )}
              
              {playbackRate && playbackRate !== 1.0 && (
                <p className="text-xs text-yellow-400 mt-2">
                  ⚡ Tempo adjusted for {playbackRate.toFixed(2)}x speed
                </p>
              )}
            </div>
          )}

          {/* Loading State */}
          {recLoading && recommendations.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
          )}

          {/* Recommendations List */}
          {activeSong && recommendations.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mb-3">{recommendations.length} similar artist tracks • Updates every 5s</p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recommendations.map((rec) => (
                  <div 
                    key={rec.id}
                    onClick={() => handleRecommendationClick(rec)}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-all group"
                  >
                    <img 
                      src={rec.artworkUrl100?.replace('100x100', '200x200') || fallbackImage}
                      alt={rec.trackName}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-cyan-400 transition-colors">
                        {rec.trackName}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{rec.artistName}</p>
                      <p className="text-xs text-gray-500">{rec.match_reason}</p>
                      {/* Match Badges */}
                      <div className="flex gap-1 mt-1">
                        <span className="px-1.5 py-0.5 bg-purple-500/30 rounded text-[10px] text-purple-300">
                          Tempo:{Math.round(rec.tempo_match * 100)}%
                        </span>
                        <span className="px-1.5 py-0.5 bg-green-500/30 rounded text-[10px] text-green-300">
                          Energy:{Math.round(rec.energy_match * 100)}%
                        </span>
                        <span className="px-1.5 py-0.5 bg-yellow-500/30 rounded text-[10px] text-yellow-300">
                          Mood:{Math.round(rec.mood_match * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 ${getArtistBadgeColor(rec.artistName)} rounded-full text-xs font-bold text-white`}>
                        {Math.round(rec.similarity_score * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {!activeSong && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🎧</div>
              <p className="text-gray-400 text-sm">Play a song to see recommendations</p>
              <div className="mt-4 text-xs text-gray-500">
                <p>Your library: {dbSongs.length} tracks</p>
                <p>Artist songs: {songs.length} tracks</p>
              </div>
            </div>
          )}

          {/* No matches state */}
          {activeSong && !recLoading && recommendations.length === 0 && (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">Finding similar artist tracks...</p>
              <p className="text-xs text-gray-500 mt-2">Analyzing audio features</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimilarSongs;
