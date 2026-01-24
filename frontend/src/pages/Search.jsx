import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';

import Loader from '../components/Loader';
import AudioReactiveVideo from '../components/AudioReactiveVideo';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import { productService } from '../redux/services';
import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';
import { FiShoppingCart } from 'react-icons/fi';
import envConfig from '../config/environment';
import blissImage from '../assets/bliss.png';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

// Hash function for consistent but distributed matching (used in visualizer)
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

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, onSongNameClick, onArtistClick, onAlbumClick, playbackRate }) => {
  const dispatch = useDispatch();
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  // Check if matched database song has a video cover
  const dbCoverMedia = song.matchedDbSong?.albumCoverImageUrl;
  const isVideo = dbCoverMedia && dbCoverMedia.toLowerCase().includes('.mp4');
  const coverMedia = isVideo ? dbCoverMedia : albumArt;
  
  const [isHovered, setIsHovered] = useState(false);

  // Handle playback rate change for videos
  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };

  // Handle clicking on song name - navigate to details
  const handleSongNameClick = (e) => {
    e.stopPropagation();
    if (onSongNameClick) {
      onSongNameClick(song);
    }
  };

  // Handle clicking on artist name - navigate to artist details
  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (onArtistClick) {
      onArtistClick(song.artistName);
    }
  };

  // Handle clicking on album name - navigate to album details
  const handleAlbumClick = (e) => {
    e.stopPropagation();
    if (onAlbumClick && song.collectionName) {
      onAlbumClick(song.collectionName, song);
    }
  };

  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden outline-none border-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >      
        {/* Album Art or Video */}
        {isVideo ? (
          <AudioReactiveVideo
            src={coverMedia}
            alt={song.trackName}
            className="w-full h-full rounded-lg object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
            playbackRate={isThisSongActive ? (playbackRate || 1.0) : 1.0}
          />
        ) : (
          <img 
            src={coverMedia} 
            alt={song.trackName} 
            className="w-full h-full rounded-lg object-cover" 
            onError={(e) => { e.target.src = fallbackImage; }} 
          />
        )}
        
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

        {/* Artist Badge - only show for songs with valid artist names (not database songs) */}
        {song.artistName && song.artistName !== 'Unknown Artist' && song.source !== 'database' && (
          <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg max-w-[calc(100%-5rem)] truncate`}>
            {song.artistName}
          </div>
        )}

        {/* Similarity Badge - for artist songs with similarity score */}
        {song.similarity && song.source !== 'database' && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-cyan-500/90 rounded-full text-[12px] font-bold text-white shadow-lg">
            {(song.similarity * 100).toFixed(0)}%
          </div>
        )}

        {isThisSongActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-green-500/90 px-2 py-1 rounded-full z-30">
            <div className="flex gap-0.5">
              <span className="w-1 h-3 bg-white rounded-full animate-pulse"></span>
              <span className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
      </div>

      {/* Tempo Slider - shown only for videos when this song is active */}
      {isVideo && isThisSongActive && (
        <div className="mt-2 px-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-white/70">Playback Speed</label>
            <span className="text-xs text-white font-mono">{(playbackRate || 1.0).toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.05"
            value={playbackRate || 1.0}
            onChange={handlePlaybackRateChange}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer hover:bg-gray-500 transition-colors"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(((playbackRate || 1.0) - 0.1) / 1.9) * 100}%, #4b5563 ${(((playbackRate || 1.0) - 0.1) / 1.9) * 100}%, #4b5563 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-white/50 mt-0.5">
            <span>0.1x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>
      )}

      {/* Song Info - Different layout for database songs vs artist songs */}
      {song.source === 'database' ? (
        /* Database song layout - same as Discover page */
        <div className="flex flex-col mt-4">
          <p className="font-semibold text-lg text-gray-300">
            <span 
              onClick={handleSongNameClick}
              className="block break-words hover:text-cyan-400 transition-colors cursor-pointer"
              title="Click to see 20 most similar songs"
            >
              {song.trackName || song.albumTitle || 'Unknown'}
            </span>
          </p>
          <div className="flex justify-between items-center mt-2">
            <p className="text-sm text-white">Music</p>
            <p className="text-sm font-bold text-white">
              ${(song.matchedDbSong?.albumPrice || song.price || 0).toFixed(2)}
            </p>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              dispatch(addToCart(song.matchedDbSong || song));
            }}
            className="mt-2 w-full px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center justify-center gap-2"
          >
            <FiShoppingCart />
            Add to Cart
          </button>
        </div>
      ) : (
        /* Artist song layout - with similarity info like SimilarSongs page */
        <>
          <div className="mt-3 flex flex-col gap-1">
            <p 
              className="font-semibold text-sm text-gray-300 truncate leading-tight hover:text-cyan-400 transition-colors cursor-pointer"
              onClick={handleSongNameClick}
              title="Click to see similar songs by this artist"
            >
              {song.trackName || song.albumTitle}
            </p>
            <p 
              className="text-xs text-gray-400 truncate hover:text-cyan-400 transition-colors cursor-pointer"
              onClick={handleArtistClick}
              title="Click to see artist details"
            >
              {song.artistName}
            </p>
            <p 
              className="text-xs text-gray-500 truncate hover:text-cyan-400 transition-colors cursor-pointer"
              onClick={handleAlbumClick}
              title="Click to view album songs and similarity"
            >
              {song.collectionName}
            </p>
          </div>
          {/* Matched to library section - like SimilarSongs page */}
          {song.matchedDbSong && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-[10px] text-cyan-400">Matched to library:</p>
              <p className="text-xs text-white truncate">{song.matchedDbSong.albumTitle}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Search = () => {
  const { searchTerm } = useParams();
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
      
      // Generate contextual reason based on dominant feature (backend-style)
      const dominantFeature = [
        ['tempo', tempoMatch],
        ['energy', energyMatch],
        ['mood', moodMatch]
      ].reduce((max, curr) => curr[1] > max[1] ? curr : max);
      
      let matchReason;
      if (dominantFeature[0] === 'tempo') {
        matchReason = `Matching rhythm (${Math.round(pseudoTempo)} BPM)`;
      } else if (dominantFeature[0] === 'energy') {
        matchReason = `Similar intensity (${(pseudoEnergy * 100).toFixed(0)}%) and vibe`;
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
        pseudo_features: { tempo: pseudoTempo, energy: pseudoEnergy, valence: pseudoValence, danceability: pseudoDanceability }
      };
    });
    
    // Sort by similarity and return top 5
    return scoredSongs
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 5);
  };

  // Initial data fetch - searches database songs and iTunes artist songs based on searchTerm
  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchSearchResults = async () => {
      setLoading(true);
      setError(null);
      
      // If no search term, show empty state
      if (!searchTerm || searchTerm.trim() === '') {
        setSongs([]);
        setLoading(false);
        return;
      }
      
      const searchLower = searchTerm.toLowerCase().trim();
      
      try {
        // Fetch database songs
        const products = await productService.getAllProducts(email, password);
        const musicProducts = products.filter(p => p.albumTitle && p.fileUrl);
        setDbSongs(musicProducts);
        
        // Also fetch iTunes songs for the 3 artists (same as TopCharts)
        const allArtistSongs = [];
        
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            const response = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`,
              { signal: abortController.signal }
            );
            const data = await response.json();
            
            const artistLower = artist.toLowerCase();
            const artistSongs = data.results
              .filter(track => track.previewUrl && track.artistName?.toLowerCase().includes(artistLower))
              .slice(0, 50)
              .map((track, artistIndex) => ({
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
                trackTimeMillis: track.trackTimeMillis,
                artistRank: artistIndex + 1,
                popularityScore: 51 - artistIndex,
                source: 'itunes'
              }));
            
            allArtistSongs.push(...artistSongs);
          } catch (artistErr) {
            if (artistErr.name !== 'AbortError') {
              console.warn(`Error fetching ${artist}:`, artistErr);
            }
          }
        }
        
        // Filter database songs based on search term
        const filteredDbSongs = musicProducts.filter(song => {
          const albumMatch = song.albumTitle?.toLowerCase().includes(searchLower);
          const artistMatch = song.artistName?.toLowerCase().includes(searchLower);
          const nameMatch = song.productName?.toLowerCase().includes(searchLower);
          const genreMatch = song.genre?.toLowerCase().includes(searchLower);
          return albumMatch || artistMatch || nameMatch || genreMatch;
        }).map((song, index) => ({
          id: song.productId || `db-${index}`,
          trackId: song.productId || `db-${index}`,
          trackName: song.albumTitle || song.productName,
          albumTitle: song.albumTitle || song.productName,
          artistName: song.artistName || 'Unknown Artist',
          collectionName: song.albumTitle,
          artworkUrl100: song.coverImage || fallbackImage,
          previewUrl: song.fileUrl,
          fileUrl: song.fileUrl,
          price: song.unitPrice || 1.29,
          primaryGenreName: song.genre || 'Electronic',
          trackTimeMillis: song.duration || 0,
          matchedDbSong: song,
          source: 'database'
        }));
        
        // Filter iTunes artist songs based on search term
        const filteredArtistSongs = allArtistSongs.filter(song => {
          const trackMatch = song.trackName?.toLowerCase().includes(searchLower);
          const artistMatch = song.artistName?.toLowerCase().includes(searchLower);
          const albumMatch = song.collectionName?.toLowerCase().includes(searchLower);
          const genreMatch = song.primaryGenreName?.toLowerCase().includes(searchLower);
          return trackMatch || artistMatch || albumMatch || genreMatch;
        });
        
        // Match iTunes songs to db songs
        const matchedArtistSongs = matchArtistSongsToDbSongs(filteredArtistSongs, musicProducts);
        
        // Combine results and calculate relevance scores
        const allResults = [...filteredDbSongs, ...matchedArtistSongs].map(song => {
          let similarity = song.similarity || 0.5;
          const title = (song.trackName || song.albumTitle || '').toLowerCase();
          const artist = (song.artistName || '').toLowerCase();
          
          // Boost exact matches
          if (title === searchLower) similarity = Math.max(similarity, 1.0);
          else if (artist === searchLower) similarity = Math.max(similarity, 0.95);
          else if (title.startsWith(searchLower)) similarity = Math.max(similarity, 0.9);
          else if (artist.startsWith(searchLower)) similarity = Math.max(similarity, 0.85);
          else if (title.includes(searchLower)) similarity = Math.max(similarity, 0.75);
          else if (artist.includes(searchLower)) similarity = Math.max(similarity, 0.7);
          
          // Database songs get a small boost
          if (song.source === 'database') similarity += 0.05;
          
          return { ...song, similarity };
        });
        
        // Remove duplicates (prefer database version)
        const seen = new Set();
        const uniqueResults = allResults.filter(song => {
          const key = `${song.trackName?.toLowerCase()}-${song.artistName?.toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        // Sort by relevance
        uniqueResults.sort((a, b) => b.similarity - a.similarity);
        setSongs(uniqueResults);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
    
    return () => {
      abortController.abort();
    };
  }, [searchTerm]); // Re-fetch when search term changes

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

    // Set up polling interval (3 seconds) - same as SmartRecommendationVisualizer
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

  // Handle clicking on a song name - navigate to song details page
  const handleSongNameClick = (song) => {
    // For database songs, navigate like Discover page with full product data
    if (song.source === 'database') {
      const dbSong = song.matchedDbSong || song;
      navigate(`/songs/${dbSong.productId || dbSong.id || song.id}`, {
        state: {
          song: {
            trackId: dbSong.productId || dbSong.id || song.id,
            trackName: dbSong.albumTitle || song.trackName,
            artistName: dbSong.artistName || 'Unknown Artist',
            collectionName: dbSong.albumTitle || song.trackName,
            artworkUrl100: dbSong.albumCoverImageUrl,
            albumCoverImageUrl: dbSong.albumCoverImageUrl,
            previewUrl: dbSong.fileUrl,
            fileUrl: dbSong.fileUrl,
            price: dbSong.albumPrice,
            primaryGenreName: 'Electronic'
          },
          artistSongs: songs.filter(s => s.id !== song.id).map(s => {
            const matched = s.matchedDbSong || s;
            return {
              trackId: matched.productId || matched.id || s.id,
              trackName: matched.albumTitle || s.trackName,
              artistName: matched.artistName || s.artistName || 'Unknown Artist',
              collectionName: matched.albumTitle || s.collectionName,
              artworkUrl100: matched.albumCoverImageUrl || s.artworkUrl100,
              albumCoverImageUrl: matched.albumCoverImageUrl,
              previewUrl: matched.fileUrl || s.previewUrl,
              fileUrl: matched.fileUrl || s.fileUrl,
              price: matched.albumPrice || s.price,
              primaryGenreName: 'Electronic'
            };
          }),
          fromDiscover: true
        }
      });
    } else {
      // For artist songs, navigate with iTunes data - only use songs from the 3 main artists for similarity
      const mainArtistSongs = songs.filter(s => {
        if (s.id === song.id) return false; // Exclude current song
        const artistLower = (s.artistName || '').toLowerCase();
        return artistLower.includes('aphex') || 
               artistLower.includes('boards of canada') || 
               artistLower.includes('squarepusher');
      });
      
      navigate(`/songs/${song.trackId || song.id}`, {
        state: {
          song: song,
          artistSongs: mainArtistSongs, // Only pass songs from the 3 main artists
          fromDiscover: true // Use all passed songs for similarity (not filtered by artist)
        }
      });
    }
  };

  // Handle clicking on artist name - navigate to artist details page
  const handleArtistClick = (artistName) => {
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  // Handle clicking on album name - navigate to album details page
  const handleAlbumClick = (albumName, song) => {
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        // Pass artist name to filter album songs by artist
        artistName: song.artistName,
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
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

  if (loading) return <Loader title={searchTerm ? `Searching for "${searchTerm}"...` : "Loading..."} />;
  
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

  // Show empty state if no search term
  if (!searchTerm || searchTerm.trim() === '') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Search for Music</h2>
          <p className="text-gray-400 mb-2">Enter a song, artist, or album name in the search bar above</p>
          <p className="text-sm text-gray-500">Try searching for "Aphex Twin", "Boards of Canada", or any artist</p>
        </div>
      </div>
    );
  }

  // Show no results state
  if (songs.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">No Results Found</h2>
          <p className="text-gray-400 mb-2">No songs found for "{searchTerm}"</p>
          <p className="text-sm text-gray-500">Try searching for a different artist or song</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 scrollbar-hide overflow-x-hidden">
      {/* Main Content */}
      <div className={`flex-1 min-w-0 ${filter === 'visualizer' ? 'hidden' : ''}`}>
        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">
            Search Results for "{searchTerm}"
          </h1>
          <p className="text-gray-400">Found {songs.length} {songs.length === 1 ? 'song' : 'songs'} matching your search</p>
          <p className="text-xs text-cyan-400 mt-1">Powered by iTunes API - Preview songs before purchasing</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            All Results ({songs.length})
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
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} onSongNameClick={handleSongNameClick} onArtistClick={handleArtistClick} onAlbumClick={handleAlbumClick} playbackRate={playbackRate} />
          ))}
        </div>
        )}
      </div>

      {/* Right Sidebar - Real-time Recommendations with Audio Feature Badges */}
      <div className={`w-full ${filter === 'visualizer' ? 'lg:w-full lg:max-w-full' : 'lg:w-[330px] lg:min-w-[330px]'}`}>
        {/* Back button when in visualizer mode */}
        {filter === 'visualizer' && (
          <div className="mb-4">
            <button onClick={() => setFilter('all')} className="px-4 py-2 rounded-full text-sm font-medium transition-all bg-white/10 text-white hover:bg-white/20">
              ← Back to Search Results
            </button>
          </div>
        )}
        
        {/* Single Song Mode - when only 1 song found, show its analysis only */}
        {songs.length === 1 && activeSong && Object.keys(activeSong).length > 0 && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
            <h3 className="text-sm font-bold text-white mb-1">Now Playing - Audio Analysis</h3>
            <p className="text-[12px] text-gray-400 leading-tight mb-3">
              Analyzing <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
            </p>

            {/* Current Track Analysis */}
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                {/* Spinning Album Cover - handle video covers like SmartRecommendationVisualizer */}
                {(() => {
                  const coverMedia = activeSong.matchedDbSong?.albumCoverImageUrl || activeSong.albumCoverImageUrl || activeSong.artworkUrl100?.replace('100x100', '200x200');
                  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  
                  return (
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <img 
                        src={isVideo ? blissImage : (coverMedia || fallbackImage)}
                        alt={activeSong.trackName || activeSong.albumTitle}
                        className={`w-16 h-16 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                        style={{ animationDuration: '3s' }}
                        onError={(e) => { e.target.src = fallbackImage; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-4 h-4 rounded-full bg-gray-900 border border-gray-700"></div>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-white truncate leading-tight">{activeSong.trackName || activeSong.albumTitle}</p>
                  <p className="text-sm text-gray-400 truncate">{activeSong.artistName || 'Unknown Artist'}</p>
                </div>
                {isPlaying && (
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-3 bg-cyan-400 rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
              
              {/* Audio Feature Badges - Larger for single song view */}
              {displayedFeatures && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Tempo</div>
                    <div className="text-xl font-bold text-cyan-400">{Math.round((displayedFeatures.tempo || 0) * (displayedPlaybackRate || 1))} BPM</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Energy</div>
                    <div className="text-xl font-bold text-green-400">{Math.round((displayedFeatures.energy || 0) * 100)}%</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Mood</div>
                    <div className="text-xl font-bold text-yellow-400">{Math.round((displayedFeatures.valence || 0) * 100)}%</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Danceability</div>
                    <div className="text-xl font-bold text-purple-400">{Math.round((displayedFeatures.danceability || 0) * 100)}%</div>
                  </div>
                </div>
              )}
              
              {!displayedFeatures && (
                <p className="text-sm text-gray-500 text-center py-4">Analyzing audio features...</p>
              )}
            </div>
            
            <p className="text-xs text-gray-500 mt-3 text-center">Only one result found - showing audio analysis only</p>
          </div>
        )}
        
        {/* Empty State - when no song is playing */}
        {(!activeSong || Object.keys(activeSong).length === 0) && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see {songs.length === 1 ? 'audio analysis' : 'recommendations'}</p>
          </div>
        )}

        {/* Active State - when a song is playing AND more than 1 result */}
        {activeSong && Object.keys(activeSong).length > 0 && songs.length > 1 && (
        <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
          <h3 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h3>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
          </p>

          {/* Current Track Analysis */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                {/* Spinning Album Cover - handle video covers like SmartRecommendationVisualizer */}
                {(() => {
                  const coverMedia = activeSong.matchedDbSong?.albumCoverImageUrl || activeSong.albumCoverImageUrl || activeSong.artworkUrl100?.replace('100x100', '200x200');
                  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  
                  return (
                    <div className="relative w-12 h-16 flex-shrink-0">
                      <img 
                        src={isVideo ? blissImage : (coverMedia || fallbackImage)}
                        alt={activeSong.trackName || activeSong.albumTitle}
                        className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                        style={{ animationDuration: '3s' }}
                        onError={(e) => { e.target.src = fallbackImage; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                        <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                      </div>
                    </div>
                  );
                })()}
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
                <p className="text-[17px] text-gray-500 text-center">Analyzing audio features...</p>
              )}
            </div>

          {/* Recommendations List */}
          {activeSong && recommendations.length > 0 && (
            <>
              <p className="text-[12px] text-gray-500 mb-2">{recommendations.length} matches • Updates 3s</p>
              <div className="space-y-2">
                {recommendations.map((rec) => {
                  return (
                  <div 
                    key={rec.id}
                    onClick={() => handleRecommendationClick(rec)}
                    className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      {/* Album Cover - Use gradient placeholder icon for all searched song recommendations (same as Discover page) */}
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        <div className="w-full h-full bg-gradient-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center">
                          <svg className="w-8 h-8 text-blue-900" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
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
                  );
                })}
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

export default Search;
