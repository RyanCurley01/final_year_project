import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import Loader from '../components/Loader';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause } from '../redux/features/playerSlice';
import { productService } from '../redux/services';
import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';
import envConfig from '../config/environment';
import { fixTextDeep } from '../utils/fixText';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

const isBadImageUrl = (url) => /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(String(url || ''));

const getSafeCoverUrl = (song, size = '600x600') => {
  const artwork = song?.artworkUrl100 && !isBadImageUrl(song.artworkUrl100)
    ? String(song.artworkUrl100).replace('100x100', size)
    : null;
  const albumCover = song?.albumCoverImageUrl && !isBadImageUrl(song.albumCoverImageUrl)
    ? song.albumCoverImageUrl
    : null;
  const imageUrl = song?.imageUrl && !isBadImageUrl(song.imageUrl) ? song.imageUrl : null;
  const image = song?.image && !isBadImageUrl(song.image) ? song.image : null;
  return artwork || albumCover || imageUrl || image || fallbackImage;
};

const normalizeTrackId = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric !== 0) {
    return String(Math.abs(numeric));
  }
  return String(value ?? '');
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
      <div className="text-xs text-gray-400 leading-tight">{label}</div>
      <div className={`text-xs font-bold leading-tight ${colors.text}`}>{value}</div>
    </div>
  );
};

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, allSongs, onSongNameClick, onArtistClick, onAlbumClick }) => {
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = getSafeCoverUrl(song, '600x600');

  const [isHovered, setIsHovered] = useState(false);
  
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
        className="relative w-full aspect-square"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >      
        {/* Album Art */}
        <img 
          src={albumArt} 
          alt={song.trackName} 
          className="w-full h-full rounded-lg object-cover" 
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

        {/* Always show similarity badge if property exists (even if 0) */}
        {song.similarity !== undefined && song.similarity !== null && (
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
          className="font-semibold text-sm text-gray-300 truncate leading-tight hover:text-cyan-400 transition-colors cursor-pointer"
          onClick={handleSongNameClick}
          title="Click to see similar songs by this artist"
        >
          {song.trackName || song.albumTitle}
        </p>
        <p 
          className="text-xs text-gray-400 truncate hover:text-cyan-400 transition-colors cursor-pointer"
          onClick={handleArtistClick}
          title="Click to view artist details"
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

      {song.matchedDbSong && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <p className="text-[10px] text-cyan-400">Matched via library track:</p>
          <p className="text-[11px] text-white truncate font-medium">{song.matchedDbSong.albumTitle}</p>
        </div>
      )}
    </div>
  );
};

const SimilarSongs = () => {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [songs, setSongs] = useState([]);
  const [dbSongs, setDbSongs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [displayedFeatures, setDisplayedFeatures] = useState(null);
  const [displayedPlaybackRate, setDisplayedPlaybackRate] = useState(1);
  const [cachedAudioFeatures, setCachedAudioFeatures] = useState({});
  
  const intervalRef = useRef(null);
  const matchStartedRef = useRef(false);
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

  // Fetch cached audio features from backend
  useEffect(() => {
    const fetchCachedFeatures = async () => {
      try {
        const audioApiUrl = envConfig.getApiBaseUrl();
        const response = await fetch(`${audioApiUrl}/api/audio/cached-features?artist_only=false`);
        if (response.ok) {
          const data = fixTextDeep(await response.json());
          setCachedAudioFeatures(data.features || {});
          console.log(`[SimilarSongs] Loaded ${data.count} cached audio features`);
        }
      } catch (err) {
        console.warn('Could not fetch cached audio features:', err.message);
      }
    };
    fetchCachedFeatures();
  }, []);

  // Initial data fetch
  useEffect(() => {   
    const fetchAllSongs = async () => {
      setLoading(true);
      setError(null);
      
      // Get API URL from environment config (no hardcoding)
      const apiBaseUrl = `${envConfig.getApiBaseUrl()}/api`;
      
      try {
        const products = await productService.getAllProducts();
        // Only include actual store products (positive IDs), exclude cached iTunes songs
        // Normalize properties to match iTunes format (trackName, artworkUrl100) for consistent rendering
        const musicProducts = products
          .filter(p => p.albumTitle && p.fileUrl && p.id > 0)
          // Ensure we only have unique entries (remove potential duplicates)
          .filter((p, index, self) => 
            index === self.findIndex((t) => (
              t.albumTitle === p.albumTitle && t.artistName === p.artistName
            ))
          )
          // Limit to 47 songs if we have more (as requested for specific library set)
          .slice(0, 47)
          .map(p => ({
            ...p,
            trackName: p.albumTitle || p.productName, // Database songs often use albumTitle as track name
            artworkUrl100: p.albumCoverImageUrl || p.imageUrl || p.image, // Map DB cover image to iTunes format (support var props)
            previewUrl: p.fileUrl,                    // Map DB file URL
            artistName: p.artistName || 'Unknown Artist'
          }));
        setDbSongs(musicProducts);
        
        const allArtistSongs = [];
        
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            // Add small delay between requests to avoid rate limiting
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Use our own proxy to avoid CORS issues from client-side calls to iTunes
            // The audio service has an endpoint for this: /api/itunes/search
            const response = await fetch(
              `${apiBaseUrl}/itunes/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`
            );
            const data = fixTextDeep(await response.json());
            
            // Check if results exist before filtering
            if (!data.results) {
               console.warn(`No results format for ${artist}`, data);
               continue;
            }

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
        
        // Calculate real similarity using cached features logic (same as findSimilarArtistSongs)
        // Note: For iTunes songs without cached features, this will result in NO similarity badge.
        // This is "Real" behavior as requested.
        const calculatedSongs = allArtistSongs.map(song => {
             // We can't calculate real similarity here on mount effectively without active song context easily,
             // but mainly we just want to remove the FAKE matching.
             // We return the song as is. Similarity will be added by the useEffect interval if active song + features exist.
             return song;
        });
        
        // No more fake matching
        setSongs(calculatedSongs);
      } catch (err) {
        console.error('Error in fetchAllSongs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSongs();
  }, []);

  // Visualiser should only appear for an actively playing/selected song.
  const getCurrentTarget = () => {
    if (activeSong && Object.keys(activeSong).length > 0) {
      return activeSong;
    }
    return null;
  };
  
  const currentTargetContext = getCurrentTarget();

  // Reset visualiser state immediately when the active track changes.
  useEffect(() => {
    setDisplayedFeatures(null);
    setDisplayedPlaybackRate(Number(playbackRateRef.current || 1));
    setRecommendations([]);
  }, [activeSong?.trackId || activeSong?.id]);

  // Single useEffect to handle all recommendation updates
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const targetSong = getCurrentTarget();

    if (!targetSong || songs.length === 0) {
      setRecommendations([]);
      return;
    }

    // Helper function to update recommendations
    const updateRecs = async () => {
      try {
        const apiBaseUrl = envConfig.getApiBaseUrl();

        // Construct live features but merge with cache if available for stability
        let featuresToSend = null;
        if (activeSong && audioFeaturesRef.current) {
            featuresToSend = {
                 tempo: audioFeaturesRef.current.tempo ? parseFloat(audioFeaturesRef.current.tempo) : null,
                 energy: audioFeaturesRef.current.energy ? parseFloat(audioFeaturesRef.current.energy) : null,
                 valence: audioFeaturesRef.current.valence ? parseFloat(audioFeaturesRef.current.valence) : null,
                 danceability: audioFeaturesRef.current.danceability ? parseFloat(audioFeaturesRef.current.danceability) : null,
                 acousticness: audioFeaturesRef.current.acousticness ? parseFloat(audioFeaturesRef.current.acousticness) : null,
                 effective_tempo: audioFeaturesRef.current.tempo ? (parseFloat(audioFeaturesRef.current.tempo) * parseFloat(playbackRateRef.current || 1)) : null,
                 playback_rate: parseFloat(playbackRateRef.current || 1)
            };
            
            // Merge with cache if available for current song
            const songIdStr = String(targetSong.trackId || targetSong.id);
            const cached = cachedAudioFeatures[songIdStr] || cachedAudioFeatures[String(-Math.abs(Number(songIdStr)))];
            
            if (cached) {
                // Lock stable features to cache
                featuresToSend.tempo = Number(cached.tempo) || featuresToSend.tempo;
                featuresToSend.acousticness = Number(cached.acousticness);
                // Keep energy/valence live for pulse
            }
        } else {
             // Try to use cache if no live features or no active song
             const songIdStr = String(targetSong.trackId || targetSong.id);
             const cached = cachedAudioFeatures[songIdStr] || cachedAudioFeatures[String(-Math.abs(Number(songIdStr)))];
             if (cached) {
                 featuresToSend = {
                    ...cached,
                    tempo: Number(cached.tempo),
                    energy: Number(cached.energy),
                    valence: Number(cached.valence),
                    playback_rate: 1
                 };
             }
        }

        const payload = {
          source: 'similar_songs', // Always force 'similar_songs' context so iTunes tracks are scored
            current_product_id: String(targetSong.trackId || targetSong.id),
            preview_url: String(targetSong.previewUrl || targetSong.fileUrl || ''),
            audio_features: featuresToSend,
            limit: 150
        };

        console.log('[SimilarSongs] Sending Unified Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${apiBaseUrl}/api/audio/unified-recommendations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
           const data = fixTextDeep(await response.json());
           if (data.recommendations) {
               setRecommendations(data.recommendations);
               setSongs((currentSongs) => {
                 const recMap = new Map(
                   data.recommendations.map((rec) => [normalizeTrackId(rec.product_id || rec.id), rec])
                 );

                 return currentSongs.map((song) => {
                   const matchedRec = recMap.get(normalizeTrackId(song.trackId || song.id));
                   if (!matchedRec) {
                     return {
                       ...song,
                       similarity: null,
                       similarity_score: null,
                       match_reason: null,
                       tempo_match: null,
                       energy_match: null,
                       mood_match: null,
                       dance_match: null,
                     };
                   }

                   return {
                     ...song,
                     similarity: matchedRec.similarity_score,
                     similarity_score: matchedRec.similarity_score,
                     match_reason: matchedRec.reason || matchedRec.match_reason,
                     tempo_match: matchedRec.tempo_match,
                     energy_match: matchedRec.energy_match,
                     mood_match: matchedRec.mood_match,
                     dance_match: matchedRec.danceability_match || matchedRec.dance_match,
                   };
                 });
               });
           }
           if (data.target_features) {
               setDisplayedFeatures({
                   tempo: data.target_features.tempo,
                   energy: data.target_features.energy,
                   valence: data.target_features.valence,
                   danceability: data.target_features.danceability
               });
           }
        }
      } catch (err) {
         // console.warn("ML Similarity update failed", err);
      }
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
  }, [activeSong?.trackId || activeSong?.id, songs.length > 0, dbSongs.length > 0]);

  // Bulk Match Endpoint for caching library song string names
  useEffect(() => {
    // Only run if we have data loaded and haven't already started
    if (loading || dbSongs.length === 0 || songs.length === 0) return;
    const hasCachedFeatures = Object.keys(cachedAudioFeatures || {}).length > 0;
    const hasComputedSongFeatures = songs.some((s) => s.tempo != null || s.energy != null || s.valence != null);
    if (!hasCachedFeatures && !hasComputedSongFeatures) return;
    if (matchStartedRef.current) return;

    matchStartedRef.current = true;
    setAnalyzing(true);

    const matchSongsUsingBulkEndpoint = async () => {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        console.log(`[SimilarSongs] Matching ${songs.length} iTunes songs to Library using Bulk Match...`);
        const BATCH_SIZE = 10;
        const targetIds = dbSongs.map((s) => s.id);
        const matchedByTrack = new Map();

        const runMatchPass = async (candidateSongs) => {
          const batches = [];
          for (let i = 0; i < candidateSongs.length; i += BATCH_SIZE) {
            batches.push(candidateSongs.slice(i, i + BATCH_SIZE));
          }

          for (const batch of batches) {
            const payload = {
              candidates: batch.map((s) => {
                const rawId = String(s.trackId || s.id || '');
                const numericId = Number(rawId);
                const negId = Number.isFinite(numericId) && numericId !== 0 ? String(-Math.abs(numericId)) : null;
                const cached = cachedAudioFeatures[rawId] || (negId ? cachedAudioFeatures[negId] : null);
                const src = cached || s;

                return {
                  trackId: String(s.trackId || s.id),
                  trackName: String(s.trackName || s.albumTitle || 'Unknown'),
                  artistName: String(s.artistName),
                  previewUrl: String(s.previewUrl || s.fileUrl || ''),
                  audio_features: {
                    tempo: Number(src.tempo ?? 120),
                    energy: Number(src.energy ?? 0.5),
                    valence: Number(src.valence ?? 0.5),
                    danceability: Number(src.danceability ?? 0.5),
                    acousticness: Number(src.acousticness ?? 0.5),
                    spectral_centroid: Number(src.spectral_centroid ?? 1500),
                    spectral_rolloff: Number(src.spectral_rolloff ?? 3000),
                    zero_crossing_rate: Number(src.zero_crossing_rate ?? 0.05),
                    instrumentalness: Number(src.instrumentalness ?? 0.5),
                    loudness: Number(src.loudness ?? -14),
                    speechiness: Number(src.speechiness ?? 0.1),
                  },
                };
              }),
              target_ids: targetIds,
              limit: BATCH_SIZE,
            };

            try {
              const response = await fetch(`${apiBaseUrl}/api/audio/match-library`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              if (response.ok) {
                const data = fixTextDeep(await response.json());
                const matches = data.matches || [];

                matches.forEach((match) => {
                  const key = normalizeTrackId(match.input_track_id);
                  const fallbackTitle = match.matched_product_id ? `Track ${match.matched_product_id}` : 'No similar library track found';
                  matchedByTrack.set(key, {
                    id: match.matched_product_id ?? null,
                    albumTitle: match.matched_product_name || fallbackTitle,
                  });
                });
              } else {
                const failText = await response.text();
                console.warn('Bulk match non-200 response', response.status, failText);
              }
            } catch (e) {
              console.warn('Bulk match failed', e);
            }

            await new Promise((r) => setTimeout(r, 50));
          }
        };

        await runMatchPass(songs);

        const unresolved = songs.filter((s) => !matchedByTrack.has(normalizeTrackId(s.trackId || s.id)));
        if (unresolved.length > 0) {
          console.warn(`[SimilarSongs] Retrying library match for ${unresolved.length} unresolved songs`);
          await runMatchPass(unresolved);
        }

        setSongs((currentSongs) =>
          currentSongs.map((song) => {
            const key = normalizeTrackId(song.trackId || song.id);
            const resolved = matchedByTrack.get(key);
            return {
              ...song,
              matchedDbSong:
                resolved ||
                song.matchedDbSong || {
                  id: null,
                  albumTitle: 'No similar library track found',
                },
            };
          })
        );

        setAnalyzing(false);
    };

    matchSongsUsingBulkEndpoint();
  }, [loading, dbSongs.length, songs.length, cachedAudioFeatures]);

    // Filter songs and sort by the same unified score used by the visualizer.
  const filteredSongs = useMemo(() => {
    let filtered;
    if (filter === 'all') {
      filtered = [...songs];
    } else {
      filtered = songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
    }

    return filtered.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
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

  // Handle clicking on artist name - navigate to artist details page
  const handleArtistClick = (artistName) => {
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  // Handle clicking on album name - navigate to album details page
  const handleAlbumClick = (albumName, song) => {
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        song: song,
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
      }
    });
  };

  // Handle clicking on a recommended artist song
  const handleRecommendationClick = (song) => {
    // Backend result uses 'product_id' and 'previewUrl', map to player format
    const songToPlay = {
        ...song,
        id: song.product_id || song.id,
        trackId: song.product_id || song.id,
        fileUrl: song.previewUrl || song.fileUrl,
        artworkUrl100: song.artworkUrl100 || song.albumCoverImageUrl,
        trackName: song.trackName || 'Unknown Track',
        // Ensure albumTitle is present for MusicPlayer visibility check
        albumTitle: song.albumTitle || song.collectionName || song.trackName || 'Single',
        artistName: song.artistName || 'Unknown Artist'
    };

    if (songToPlay.fileUrl) {
      // Find index in current list if possible, otherwise use new list
      let index = songs.findIndex(s => String(s.id) === String(songToPlay.id));
      
      // If the song is not in the current 'songs' list (e.g. it's a library recommendation)
      // we play it as a single song or append to list logic. 
      // For now, simpler to just play it.
      
      dispatch(setActiveSong({ 
          song: songToPlay, 
          data: index !== -1 ? songs : [songToPlay], 
          i: index !== -1 ? index : 0 
      }));
      dispatch(playPause(true));
    } else {
        console.warn("Cannot play recommendation: No preview URL", song);
    }
  };

  // Helper to calculate live match scores for visualizer mode
  const calculateLiveMatch = (rec) => {
    const featuresToUse = displayedFeatures || audioFeatures;

    if (!featuresToUse) {
       return {
         tempo_match: rec.tempo_match,
         energy_match: rec.energy_match,
         mood_match: rec.mood_match,
         danceability_match: rec.danceability_match || rec.dance_match,
         similarity_score: rec.similarity_score
       };
    }

    const rateToUse = displayedPlaybackRate || 1;
    
    // 1. Get Current Features
    let currentTempo = 120;
    if (featuresToUse.effective_tempo) {
        currentTempo = featuresToUse.effective_tempo;
    } else if (featuresToUse.tempo) {
        currentTempo = Number(featuresToUse.tempo) * rateToUse;
    }
    
    // 2. Get Target Features (from rec)
    const targetTempo = Number(rec.tempo) || 120;
    
    // 3. Compute Matches
    const tempoDiff = Math.abs(targetTempo - currentTempo);
    const tempoMatch = Math.max(0, 1 - Math.min(tempoDiff / 100.0, 1.0));
    
    const energyMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.energy) || 0.5) - (Number(rec.energy) || 0.5)));
    const moodMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.valence) || 0.5) - (Number(rec.valence) || 0.5)));
    const danceabilityMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.danceability) || 0.5) - (Number(rec.danceability) || 0.5)));

    // 4. Weighted Score
    let score = (
      tempoMatch * 0.25 +
      energyMatch * 0.30 +
      moodMatch * 0.20 +
      danceabilityMatch * 0.25
    );
    
    if (score > 0.99) score = 0.99;
    if (isNaN(score)) score = 0;
    
    return {
      tempo_match: tempoMatch,
      energy_match: energyMatch,
      mood_match: moodMatch,
      danceability_match: danceabilityMatch,
      similarity_score: score
    };
  };

  if (loading) return <Loader title="Finding similar songs from iTunes..." />;
  // if (analyzing) return <Loader title="Analyzing audio features & matching to library..." />;
  
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
    <div className="flex flex-col lg:flex-row gap-6 scrollbar-hide overflow-x-hidden">
      {/* Main Content */}
      <div className={`flex-1 min-w-0 ${filter === 'visualizer' ? 'hidden' : ''}`}>
        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">Similar Track Information</h1>
          <p className="text-gray-400">Aphex Twin, Squarepusher and Boards of Canada songs ranked by unified ML similarity using the same scoring path as the visualiser.</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <p className="text-xs text-cyan-400">Powered by ML Audio Similarity • {songs.length} artist tracks with 30s previews • Industry-standard feature extraction</p>
            {analyzing && (
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-yellow-500 font-semibold animate-pulse">Loading similar library songs...</span>
                </div>
            )}
          </div>
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
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} allSongs={songs} onSongNameClick={handleSongNameClick} onArtistClick={handleArtistClick} onAlbumClick={handleAlbumClick} />
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
              ← Back to Similar Songs
            </button>
          </div>
        )}
        {/* Empty State - when no song is playing */}
        {!currentTargetContext && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Loading library match...</p>
          </div>
        )}

        {/* Active State - when matching context is available */}
        {currentTargetContext && (
        <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
          <h4 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h4>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{currentTargetContext.trackName || currentTargetContext.albumTitle}</span>
          </p>

          {/* Current Track Analysis */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                {/* Spinning Album Cover */}
                <div className="relative w-12 h-16 flex-shrink-0">
                  <img 
                    key={currentTargetContext?.albumCoverImageUrl || currentTargetContext?.artworkUrl100 || 'no-cover'}
                    src={getSafeCoverUrl(currentTargetContext, '200x200')}
                    alt={currentTargetContext.trackName || currentTargetContext.albumTitle}
                    className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                    <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-white truncate leading-tight">{currentTargetContext.trackName || currentTargetContext.albumTitle}</p>
                  <p className="text-[12px] text-gray-400 truncate -mt-3">{currentTargetContext.artistName || 'Unknown Artist'}</p>
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
              {/* <p className="text-[12px] text-gray-500 mb-2">{recommendations.length} matches • Updates 3s</p> */}
              <div className="space-y-2">
                {recommendations
                  .map(rec => {
                      const liveMatch = calculateLiveMatch(rec);
                    const recNormId = normalizeTrackId(rec.product_id || rec.id || rec.trackId);
                    const fallbackSong = songs.find((s) => normalizeTrackId(s.trackId || s.id) === recNormId);
                      return {
                          ...rec,
                      trackName: rec.trackName || fallbackSong?.trackName || fallbackSong?.albumTitle,
                      artistName: rec.artistName || fallbackSong?.artistName,
                      collectionName: rec.collectionName || fallbackSong?.collectionName,
                      artworkUrl100: rec.artworkUrl100 || fallbackSong?.artworkUrl100 || fallbackSong?.albumCoverImageUrl,
                      albumCoverImageUrl: rec.albumCoverImageUrl || fallbackSong?.albumCoverImageUrl || fallbackSong?.artworkUrl100,
                      previewUrl: rec.previewUrl || fallbackSong?.previewUrl || fallbackSong?.fileUrl,
                          similarity_score: liveMatch ? liveMatch.similarity_score : rec.similarity_score,
                          tempo_match: liveMatch ? liveMatch.tempo_match : rec.tempo_match,
                          energy_match: liveMatch ? liveMatch.energy_match : rec.energy_match,
                          mood_match: liveMatch ? liveMatch.mood_match : rec.mood_match,
                          danceability_match: liveMatch ? liveMatch.danceability_match : (rec.danceability_match || rec.dance_match)
                      };
                  })
                  .sort((a, b) => b.similarity_score - a.similarity_score)
                  .slice(0, 5)
                  .map((rec, idx) => {
                  const recTitle = rec.trackName || rec.albumTitle || rec.collectionName || `Track ${rec.product_id || rec.id || idx + 1}`;
                  const recArtist = rec.artistName || 'Unknown Artist';
                  return (
                  <div 
                    key={String(rec.product_id || rec.id || rec.trackId || `${recTitle}-${idx}`)}
                    onClick={() => handleRecommendationClick(rec)}
                    className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      {/* Album Cover - Support both URL formats */}
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        <img 
                          src={getSafeCoverUrl(rec, '200x200')}
                          alt={recTitle}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = fallbackImage; }}
                        />
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors text-sm leading-tight flex-1">
                            {recTitle}
                          </h4>
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold text-white flex-shrink-0 ${
                            rec.similarity_score >= 0.7 ? 'bg-green-500' : 
                            rec.similarity_score >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(rec.similarity_score * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 truncate font-medium">{recArtist}</p>
                        <p className="text-xs text-gray-400 truncate">{rec.reason || rec.match_reason}</p>
                        
                        {/* Feature Matches */}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Tempo:{Math.round(rec.tempo_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Energy:{Math.round(rec.energy_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Mood:{Math.round(rec.mood_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.danceability_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.danceability_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Dance:{Math.round(rec.danceability_match * 100)}%
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

export default SimilarSongs;
