import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import Loader from '../components/Loader';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause } from '../redux/features/playerSlice';
import { mergeMatchData, setMatchEntry } from '../redux/features/matchCacheSlice';
import { productService } from '../redux/services';
import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';
import OnsetImageCard from '../components/OnsetImageCard';
import envConfig from '../config/environment';
import { fixTextDeep } from '../utils/fixText';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

// Normalised lowercase fragments used to filter songs returned by the
// topcharts endpoint down to the three IDM artists only.
const IDM_ARTIST_FRAGMENTS = ['aphex twin', 'boards of canada', 'squarepusher'];

const isIdmArtist = (artistName) => {
  const lower = String(artistName || '').toLowerCase();
  return IDM_ARTIST_FRAGMENTS.some((fragment) => lower.includes(fragment));
};

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

const buildAudioFeaturePayload = (features) => {
  if (!features) {
    return null;
  }

  return {
    tempo: Number(features.tempo ?? 120),
    energy: Number(features.energy ?? 0.5),
    valence: Number(features.valence ?? 0.5),
    danceability: Number(features.danceability ?? 0.5),
    acousticness: Number(features.acousticness ?? 0.5),
    spectral_centroid: Number(features.spectral_centroid ?? features.spectralCentroid ?? 1500),
    spectral_rolloff: Number(features.spectral_rolloff ?? features.spectralRolloff ?? 3000),
    zero_crossing_rate: Number(features.zero_crossing_rate ?? features.zeroCrossingRate ?? 0.05),
    instrumentalness: Number(features.instrumentalness ?? 0.5),
    loudness: Number(features.loudness ?? -14),
    speechiness: Number(features.speechiness ?? 0.1),
  };
};

const MATCH_PENDING_STATE = {
  id: null,
  albumTitle: 'Matching library...',
};

const MATCH_NOT_FOUND_STATE = {
  id: null,
  albumTitle: 'No similar library track found',
};

const MATCH_WARMING_STATE = {
  id: null,
  albumTitle: 'Loading song matches...',
};

const MATCH_STATUS = {
  pending: 'pending',
  resolved: 'resolved',
  warming: 'warming',
  notFound: 'not_found',
};

const isPlaceholderArtist = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === 'unknown artist' || n === 'library artist';
};

const isPlaceholderTrack = (name) => {
  const n = String(name || '').trim();
  if (!n) return true;
  return /^track\s*-?\d+$/i.test(n);
};

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

const FeatureBadge = ({ label, value }) => {
  const colors = getFeatureColor(label, value);
  return (
    <div className={`rounded-md px-1 py-1 text-center border ${colors.bg} ${colors.border}`}>
      <div className="text-xs text-gray-400 leading-tight">{label}</div>
      <div className={`text-xs font-bold leading-tight ${colors.text}`}>{value}</div>
    </div>
  );
};

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, onSongNameClick, onArtistClick, onAlbumClick }) => {
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = getSafeCoverUrl(song, '600x600');
  const [isHovered, setIsHovered] = useState(false);

  const handleSongNameClick = (e) => {
    e.stopPropagation();
    if (onSongNameClick) {
      onSongNameClick(song);
    }
  };

  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (onArtistClick) {
      onArtistClick(song.artistName);
    }
  };

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
        <img 
          src={albumArt} 
          alt={song.trackName} 
          className="w-full h-full rounded-lg object-cover" 
          onError={(e) => { e.target.src = fallbackImage; }} 
        />
        
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

      {(song.matchedDbSong || song.matchStatus === MATCH_STATUS.pending || song.matchStatus === MATCH_STATUS.warming) && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <p className="text-[10px] text-cyan-400">Matched via library track:</p>
          {song.matchStatus === MATCH_STATUS.warming ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2.5 h-2.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[11px] text-yellow-400 truncate font-medium">
                {MATCH_WARMING_STATE.albumTitle}
              </p>
            </div>
          ) : (
          <p className="text-[11px] text-white truncate font-medium">
            {song.matchStatus === MATCH_STATUS.pending
              ? MATCH_PENDING_STATE.albumTitle
              : song.matchedDbSong?.albumTitle}
          </p>
          )}
          {song.matchStatus === MATCH_STATUS.resolved && song.matchedDbSong?.tempo_match != null && (
            <div className="flex gap-1 mt-1 flex-wrap">
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.matchedDbSong.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.matchedDbSong.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Tempo:{Math.round(song.matchedDbSong.tempo_match * 100)}%
              </span>
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.matchedDbSong.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.matchedDbSong.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Energy:{Math.round(song.matchedDbSong.energy_match * 100)}%
              </span>
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.matchedDbSong.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.matchedDbSong.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Mood:{Math.round(song.matchedDbSong.mood_match * 100)}%
              </span>
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.matchedDbSong.dance_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.matchedDbSong.dance_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Dance:{Math.round(song.matchedDbSong.dance_match * 100)}%
              </span>
            </div>
          )}
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
  const [cachedAudioFeatures, setCachedAudioFeatures] = useState(null);

  // Tracks which trackIds belong to this component mount so we surface only
  // the relevant slice of the global cache in the grid.
  const [localTrackIds, setLocalTrackIds] = useState(new Set());

  // Global match cache shared with Search — keyed by trackId string.
  const globalMatchCache = useSelector((state) => state.matchCache.entries);

  // Derived Map for this component's songs, rebuilt whenever the global
  // cache updates or the local ID set changes.
  const songMatchData = useMemo(() => {
    const map = new Map();
    localTrackIds.forEach((id) => {
      if (globalMatchCache[id]) map.set(id, globalMatchCache[id]);
    });
    return map;
  }, [globalMatchCache, localTrackIds]);

  const intervalRef = useRef(null);
  const matchStartedRef = useRef(false);
  
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);

  const { audioFeatures } = useAudioFeatures();
  
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  // --- Initialization Hook 1: Fetch Pre-computed Features ---
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
        setCachedAudioFeatures({});
      }
    };

    fetchCachedFeatures();

    // Re-sync every hour to match backend refresh cycle
    const interval = setInterval(fetchCachedFeatures, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Initialization Hook 2: Fetch and Assemble Song Data ---
  useEffect(() => {   
    const fetchAllSongs = async () => {
      setLoading(true);
      setError(null);
      
      const apiBaseUrl = `${envConfig.getApiBaseUrl()}/api`;
      
      try {
        const products = await productService.getAllProducts();

        const musicProducts = products
          .filter(p => p.albumTitle && p.fileUrl && p.id > 0)
          .filter((p, index, self) => 
            index === self.findIndex((t) => (
              t.albumTitle === p.albumTitle && t.artistName === p.artistName
            ))
          )
          .slice(0, 47)         
          .map(p => ({
            ...p,
            trackName: p.albumTitle || p.productName, 
            artworkUrl100: p.albumCoverImageUrl || p.imageUrl || p.image, 
            previewUrl: p.fileUrl,                    
            artistName: p.artistName || 'Unknown Artist'
          }));
        
        setDbSongs(musicProducts);
        
        let allArtistSongs = [];
        try {
          const resp = await fetch(`${apiBaseUrl}/itunes/topcharts?limit_per_artist=50`);
          if (resp.ok) {
            const data = fixTextDeep(await resp.json());
            if (data.songs) {
              // ── KEY FILTER ────────────────────────────────────────────────
              // The topcharts endpoint returns up to 225 songs (150 IDM artist
              // tracks + 75 broad popular tracks). This page is exclusively
              // about the three IDM artists, so we discard anything whose
              // artistName doesn't match one of them.
              allArtistSongs = data.songs.filter((song) => isIdmArtist(song.artistName));
              console.log(
                `[SimilarSongs] topcharts returned ${data.songs.length} songs; ` +
                `kept ${allArtistSongs.length} IDM artist tracks after filtering.`
              );
            }
            if (data.features) {
              // Merge the full feature map so similarity scoring works for all
              // songs, including the broad ones (even though we don't show them).
              setCachedAudioFeatures(prev => ({ ...(prev || {}), ...data.features }));
            }
          } else {
            console.warn('[SimilarSongs] topcharts proxy failed, falling back to client-side search');
          }
        } catch (e) {
          console.warn('[SimilarSongs] topcharts fetch error:', e.message || e);
        }
        
        const calculatedSongs = allArtistSongs.map(song => song);

        // Seed ALL IDM songs as warming in the global store and register
        // their IDs immediately — before the bulk match hook fires — so cards
        // never flash blank or "not found" while waiting for API results.
        const itunesCandidates = calculatedSongs.filter(s => s.source !== 'database');
        const allIds = new Set(itunesCandidates.map(s => normalizeTrackId(s.trackId || s.id)));
        setLocalTrackIds(allIds);

        // Only seed warming for songs not already resolved in the global cache.
        // This preserves resolved/notFound entries from a previous visit.
        const warmingBatch = {};
        itunesCandidates.forEach(s => {
          const key = normalizeTrackId(s.trackId || s.id);
          const existing = globalMatchCache[key];
          const alreadyDone = existing && (
            existing.matchStatus === MATCH_STATUS.resolved ||
            existing.matchStatus === MATCH_STATUS.notFound
          );
          if (!alreadyDone) {
            warmingBatch[key] = { matchStatus: MATCH_STATUS.warming };
          }
        });
        if (Object.keys(warmingBatch).length > 0) {
          dispatch(mergeMatchData(warmingBatch));
        }

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

  const getCurrentTarget = () => {
    if (activeSong && Object.keys(activeSong).length > 0) {
      return activeSong;
    }
    return null;
  };
  
  const currentTargetContext = getCurrentTarget();

  useEffect(() => {
    setDisplayedFeatures(null);
    setDisplayedPlaybackRate(Number(playbackRateRef.current || 1));
    setRecommendations([]);
  }, [activeSong?.trackId || activeSong?.id]);

  // --- Recommendations polling hook ---
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const targetSong = getCurrentTarget();

    if (!targetSong || songs.length === 0 || cachedAudioFeatures === null) {
      setRecommendations([]);
      return;
    }

    const updateRecs = async () => {
      try {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        console.log('[SimilarSongs] updateRecs tick — cachedAudioFeatures:', cachedAudioFeatures ? Object.keys(cachedAudioFeatures).length + ' keys' : 'null');

        const live = audioFeaturesRef.current;
        const liveRate = Number(playbackRateRef.current || 1);
        
        setDisplayedPlaybackRate(liveRate);
        
        const songIdStr = String(targetSong.trackId || targetSong.id);
        const cachedForDisplay = cachedAudioFeatures?.[songIdStr] || cachedAudioFeatures?.[String(-Math.abs(Number(songIdStr)))];
        if (cachedForDisplay && live) {
          setDisplayedFeatures({
            tempo: cachedForDisplay.tempo ? Number(cachedForDisplay.tempo) : (live.tempo ? Number(live.tempo) : null),
            energy: live.energy != null ? Number(live.energy) : (cachedForDisplay.energy ? Number(cachedForDisplay.energy) : null),
            valence: live.valence != null ? Number(live.valence) : (cachedForDisplay.valence ? Number(cachedForDisplay.valence) : null),
            danceability: live.danceability != null ? Number(live.danceability) : (cachedForDisplay.danceability ? Number(cachedForDisplay.danceability) : null),
          });
        } else if (cachedForDisplay) {
          setDisplayedFeatures({
            tempo: cachedForDisplay.tempo ? Number(cachedForDisplay.tempo) : null,
            energy: cachedForDisplay.energy ? Number(cachedForDisplay.energy) : null,
            valence: cachedForDisplay.valence ? Number(cachedForDisplay.valence) : null,
            danceability: cachedForDisplay.danceability ? Number(cachedForDisplay.danceability) : null,
          });
        } else if (live) {
          setDisplayedFeatures({
            tempo: live.tempo ? Number(live.tempo) : null,
            energy: live.energy ? Number(live.energy) : null,
            valence: live.valence ? Number(live.valence) : null,
            danceability: live.danceability ? Number(live.danceability) : null,
          });
        }

        let featuresToSend = null;
        const cached = cachedAudioFeatures?.[songIdStr] || cachedAudioFeatures?.[String(-Math.abs(Number(songIdStr)))];

        if (cached) {
          featuresToSend = {
            ...cached,
            tempo: Number(cached.tempo),
            energy: Number(cached.energy),
            valence: Number(cached.valence),
            danceability: Number(cached.danceability),
            acousticness: Number(cached.acousticness),
            playback_rate: 1, 
          };
        } else if (activeSong && audioFeaturesRef.current) {
          featuresToSend = {
            tempo: audioFeaturesRef.current.tempo ? parseFloat(audioFeaturesRef.current.tempo) : null,
            energy: audioFeaturesRef.current.energy ? parseFloat(audioFeaturesRef.current.energy) : null,
            valence: audioFeaturesRef.current.valence ? parseFloat(audioFeaturesRef.current.valence) : null,
            danceability: audioFeaturesRef.current.danceability ? parseFloat(audioFeaturesRef.current.danceability) : null,
            acousticness: audioFeaturesRef.current.acousticness ? parseFloat(audioFeaturesRef.current.acousticness) : null,
            effective_tempo: audioFeaturesRef.current.tempo ? (parseFloat(audioFeaturesRef.current.tempo) * parseFloat(playbackRateRef.current || 1)) : null,
            playback_rate: parseFloat(playbackRateRef.current || 1),
          };
        }

        const payload = {
            source: 'similar_songs', 
            current_product_id: String(targetSong.trackId || targetSong.id),
            preview_url: String(targetSong.previewUrl || targetSong.fileUrl || ''),
            audio_features: featuresToSend,
            limit: 50
        };

        console.log('[SimilarSongs] Sending Unified Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${apiBaseUrl}/api/audio/unified-recommendations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
           const data = fixTextDeep(await response.json());
           
           if (data.recommendations) {
               let enrichedRecommendations = data.recommendations;

               const unresolvedArtistRecs = (data.recommendations || []).filter((rec) =>
                 isPlaceholderArtist(rec.artistName)
               );
               
               if (unresolvedArtistRecs.length > 0) {
                 try {
                   const lookupIds = Array.from(
                     new Set(
                       unresolvedArtistRecs
                         .map((rec) => Number(rec.product_id || rec.id || rec.trackId))
                         .filter((id) => Number.isFinite(id) && Math.abs(id) >= 1000000)
                         .map((id) => Math.abs(id))
                     )
                   ).slice(0, 50);

                   if (lookupIds.length > 0) {
                     const lookupResp = await fetch(
                       `https://itunes.apple.com/lookup?id=${lookupIds.join(',')}`,
                       { signal: AbortSignal.timeout(5000) }
                     );
                     
                     if (lookupResp.ok) {
                       const lookupData = fixTextDeep(await lookupResp.json());
                       
                       const itunesMap = new Map(
                         (lookupData.results || [])
                           .filter((item) => item.trackId)
                           .map((item) => [Math.abs(Number(item.trackId)), item])
                       );

                       enrichedRecommendations = data.recommendations.map((rec) => {
                         const rawId = Number(rec.product_id || rec.id || rec.trackId);
                         const lookup = Number.isFinite(rawId) ? itunesMap.get(Math.abs(rawId)) : null;
                         
                         if (!lookup) return rec;
                         
                         return {
                           ...rec,
                           artistName: isPlaceholderArtist(rec.artistName) ? (lookup.artistName || rec.artistName) : rec.artistName,
                           trackName: isPlaceholderTrack(rec.trackName) ? (lookup.trackName || rec.trackName) : rec.trackName,
                           collectionName: rec.collectionName || lookup.collectionName,
                           artworkUrl100: rec.artworkUrl100 || lookup.artworkUrl100,
                           previewUrl: rec.previewUrl || lookup.previewUrl,
                         };
                       });
                     }
                   }
                 } catch {
                   // Retain original recommendations if iTunes lookup fails.
                 }
               }

               setRecommendations(enrichedRecommendations);
               
               // Only update similarity scores — never touch matchedDbSong or matchStatus here.
               setSongs((currentSongs) => {              
                 const recMap = new Map(
                   enrichedRecommendations.map((rec) => [normalizeTrackId(rec.product_id || rec.id), rec])
                 );

                 return currentSongs.map((song) => {
                   const key = normalizeTrackId(song.trackId || song.id);
                   const matchedRec = recMap.get(key);

                   if (!matchedRec) {
                     return {
                       ...song,
                       similarity: null,
                       similarity_score: null,
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
                     tempo_match: matchedRec.tempo_match,
                     energy_match: matchedRec.energy_match,
                     mood_match: matchedRec.mood_match,
                     dance_match: matchedRec.danceability_match || matchedRec.dance_match,
                   };
                 });
               });
           }
           if (data.target_features && !live) {
             setDisplayedFeatures({
                 tempo: data.target_features.tempo,
                 energy: data.target_features.energy,
                 valence: data.target_features.valence,
                 danceability: data.target_features.danceability
             });
         }
        }
      } catch (err) {
         console.warn("[SimilarSongs] ML Similarity update failed:", err);
      }
    };

    setRecLoading(true);
    updateRecs().finally(() => setRecLoading(false));

    intervalRef.current = setInterval(updateRecs, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSong?.trackId || activeSong?.id, dbSongs.length, cachedAudioFeatures !== null]);


  // --- Bulk Match Hook ---
  useEffect(() => {
    if (loading || dbSongs.length === 0 || songs.length === 0 || cachedAudioFeatures === null) return;
    if (matchStartedRef.current) return;

    matchStartedRef.current = true;
    setAnalyzing(true);
    const matchStartedAt = Date.now();

    const finishAnalyzing = async () => {
      const elapsed = Date.now() - matchStartedAt;
      const minVisibleMs = 700;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      setAnalyzing(false);
    };

    const matchSongsUsingBulkEndpoint = async () => {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        console.log(`[SimilarSongs] Matching ${songs.length} IDM songs to 47 library songs using Bulk Match...`);
        const candidateSongs = songs.filter((song) => song.source !== 'database');
        if (candidateSongs.length === 0) {
          await finishAnalyzing();
          return;
        }

        // --- Cache-hit fast path ---
        const alreadyCached = candidateSongs.filter(s => {
          const cached = globalMatchCache[normalizeTrackId(s.trackId || s.id)];
          return cached && (
            cached.matchStatus === MATCH_STATUS.resolved ||
            cached.matchStatus === MATCH_STATUS.notFound
          );
        });
        const uncachedCandidates = candidateSongs.filter(s => {
          const cached = globalMatchCache[normalizeTrackId(s.trackId || s.id)];
          return !cached || (
            cached.matchStatus !== MATCH_STATUS.resolved &&
            cached.matchStatus !== MATCH_STATUS.notFound
          );
        });

        console.log(`[SimilarSongs] Cache hits: ${alreadyCached.length}, uncached: ${uncachedCandidates.length}`);

        if (uncachedCandidates.length === 0) {
          await finishAnalyzing();
          return;
        }
        
        const BATCH_SIZE = 50;
        
        const targetIds = Array.from(
          new Set(
            dbSongs
              .map((song) => Number(song.id))
              .filter((id) => Number.isFinite(id) && id > 0)
          )
        );
        
        const matchedByTrack = new Map();

        const applyResolvedMatches = () => {
          const batch = {};
          matchedByTrack.forEach((resolved, key) => {
            batch[key] = {
              matchedLibraryTrack: resolved.matchedLibraryTrack || resolved.albumTitle,
              matchedDbSong: resolved,
              matchStatus: MATCH_STATUS.resolved,
            };
          });
          if (Object.keys(batch).length > 0) {
            dispatch(mergeMatchData(batch));
          }
        };

        const runMatchPass = async (candidates) => {
          const batches = [];
          const skippedIds = new Set();
          
          for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            batches.push(candidates.slice(i, i + BATCH_SIZE));
          }

          for (const batch of batches) {
            const payload = {
              candidates: batch.map((s) => {
                const rawId = String(s.trackId || s.id || '');
                const numericId = Number(rawId);
                const negId = Number.isFinite(numericId) && numericId !== 0 ? String(-Math.abs(numericId)) : null;
                const cached = cachedAudioFeatures[rawId] || (negId ? cachedAudioFeatures[negId] : null);
                const audioFeatures = buildAudioFeaturePayload(cached);
                const candidate = {
                  trackId: String(s.trackId || s.id),
                  trackName: String(s.trackName || s.albumTitle || 'Unknown'),
                  artistName: String(s.artistName),
                  previewUrl: String(s.previewUrl || s.fileUrl || ''),
                };
                if (audioFeatures) {
                  candidate.audio_features = audioFeatures;
                }
                return candidate;
              }),
              limit: BATCH_SIZE,
            };

            if (targetIds.length > 0) {
              payload.target_ids = targetIds;
            }

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
                  const name = match.matched_product_name || fallbackTitle;

                  matchedByTrack.set(key, {
                    id: match.matched_product_id ?? null,
                    albumTitle: name,
                    matchedLibraryTrack: name,
                    similarity_score: match.similarity_score ?? null,
                    tempo_match: match.tempo_match ?? null,
                    energy_match: match.energy_match ?? null,
                    mood_match: match.mood_match ?? null,
                    dance_match: match.dance_match ?? null,
                  });
                });

                const skipped = data.skipped || [];
                skipped.forEach((id) => skippedIds.add(normalizeTrackId(id)));

                applyResolvedMatches();
              } else {
                const failText = await response.text();
                console.warn('Bulk match non-200 response', response.status, failText);
              }
            } catch (e) {
              console.warn('Bulk match failed', e);
            }

            await new Promise((r) => setTimeout(r, 50));
          }

          return skippedIds;
        };

        const skippedIds = await runMatchPass(uncachedCandidates);

        const unresolved = uncachedCandidates.filter((s) => !matchedByTrack.has(normalizeTrackId(s.trackId || s.id)));
        const networkFailures = unresolved.filter((s) => !skippedIds.has(normalizeTrackId(s.trackId || s.id)));
        const cacheMisses = unresolved.filter((s) => skippedIds.has(normalizeTrackId(s.trackId || s.id)));

        if (networkFailures.length > 0) {
          console.warn(`[SimilarSongs] Retrying library match for ${networkFailures.length} network failures`);
          await runMatchPass(networkFailures);
          applyResolvedMatches(); 
        }

        const allStillUnresolved = uncachedCandidates.filter(
          (s) => !matchedByTrack.has(normalizeTrackId(s.trackId || s.id))
        );

        const allTrackIds = candidateSongs.map((s) => Number(s.trackId || s.id)).filter(Boolean);
        const warmSongs = cacheMisses.map((s) => ({
          trackId: Number(s.trackId || s.id),
          previewUrl: s.previewUrl || s.fileUrl || '',
          trackName: s.trackName || s.albumTitle || 'Unknown',
          artistName: s.artistName || 'Unknown Artist',
          artworkUrl100: s.artworkUrl100 || '',
        })).filter((s) => s.trackId && s.previewUrl);

        console.log(`[SimilarSongs] Syncing cache: ${warmSongs.length} to warm (in-memory only), ${allTrackIds.length} active trackIds for pruning`);

        fetch(`${apiBaseUrl}/api/audio/warm-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songs: warmSongs,
            current_track_ids: allTrackIds,
          }),
        }).then((res) => {
          if (res.ok) return res.json();
          throw new Error(`warm-cache ${res.status}`);
        }).then((data) => {
          console.log(`[SimilarSongs] Cache sync response:`, data);
        }).catch((err) => {
          console.warn('[SimilarSongs] Cache sync failed:', err.message);
        });

        if (allStillUnresolved.length > 0) {
          console.log(`[SimilarSongs] ${allStillUnresolved.length} songs still unresolved — polling (${cacheMisses.length} cache misses, ${allStillUnresolved.length - cacheMisses.length} unmatched)`);

          const MAX_POLL_ATTEMPTS = 15;
          const POLL_INTERVAL_MS = 20_000;
          let remaining = [...allStillUnresolved];
          let attempt = 0;

          const pollForNewMatches = async () => {
            while (remaining.length > 0 && attempt < MAX_POLL_ATTEMPTS) {
              attempt++;
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

              console.log(`[SimilarSongs] Poll ${attempt}/${MAX_POLL_ATTEMPTS}: retrying ${remaining.length} songs...`);
              const pollSkipped = await runMatchPass(remaining);

              const newlyMatched = remaining.filter((s) => matchedByTrack.has(normalizeTrackId(s.trackId || s.id)));
              if (newlyMatched.length > 0) {
                console.log(`[SimilarSongs] Poll ${attempt}: ${newlyMatched.length} new matches found!`);
              }

              remaining = remaining.filter((s) => pollSkipped.has(normalizeTrackId(s.trackId || s.id)));

              if (remaining.length === 0) {
                console.log(`[SimilarSongs] All songs resolved — polling complete.`);
              }
            }

            const allNowUnresolved = allStillUnresolved.filter(
              (s) => !matchedByTrack.has(normalizeTrackId(s.trackId || s.id))
            );
            if (allNowUnresolved.length > 0) {
              console.log(`[SimilarSongs] Polling ended with ${allNowUnresolved.length} songs unresolved after ${attempt} attempts.`);
              const exhaustedBatch = {};
              allNowUnresolved.forEach((s) => {
                exhaustedBatch[normalizeTrackId(s.trackId || s.id)] = {
                  matchedDbSong: { ...MATCH_NOT_FOUND_STATE },
                  matchStatus: MATCH_STATUS.notFound,
                };
              });
              dispatch(mergeMatchData(exhaustedBatch));
            }
          };

          pollForNewMatches().catch((err) =>
            console.warn('[SimilarSongs] Poll loop error:', err)
          );
        }

        await finishAnalyzing();
    };

    matchSongsUsingBulkEndpoint().catch(async (err) => {
      console.warn('SimilarSongs bulk matching aborted:', err);
      await finishAnalyzing();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dbSongs.length, songs.length, cachedAudioFeatures]);

  const [shuffleSeed] = useState(() => Math.random());

  const filteredSongs = useMemo(() => {
    let filtered;
    
    if (filter === 'all') {
      filtered = [...songs];
    } else {
      filtered = songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
    }

    const seeded = [...filtered];
    let seed = shuffleSeed;
    for (let i = seeded.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
    return seeded;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, filter, shuffleSeed, songMatchData]);

  const handlePlay = (song, index) => {
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  const handlePause = () => {
    dispatch(playPause(false));
  };

  const handleSongNameClick = (song) => {
    navigate(`/songs/${song.trackId || song.id}`, {
      state: {
        song: song,
        artistSongs: [...songs, ...dbSongs],
        fromDiscover: true,
        from: '/similar-songs'
      }
    });
  };

  const handleArtistClick = (artistName) => {
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  const handleAlbumClick = (albumName, song) => {
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        song: song,
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
      }
    });
  };

  const handleRecommendationClick = (song) => {
    const songToPlay = {
        ...song,
        id: song.product_id || song.id,
        trackId: song.product_id || song.id,
        fileUrl: song.previewUrl || song.fileUrl,
        artworkUrl100: song.artworkUrl100 || song.albumCoverImageUrl,
        trackName: song.trackName || 'Unknown Track',
        albumTitle: song.albumTitle || song.collectionName || song.trackName || 'Single',
        artistName: song.artistName || 'Unknown Artist'
    };

    if (songToPlay.fileUrl) {
      const recNormId = normalizeTrackId(song.product_id || song.id || song.trackId);
      let index = filteredSongs.findIndex(s =>
        normalizeTrackId(s.trackId || s.id) === recNormId
        || (song.trackName && s.trackName && song.trackName === s.trackName
            && song.artistName && s.artistName && song.artistName === s.artistName)
      );
      
      const queueData = index !== -1 ? filteredSongs : [...filteredSongs, songToPlay];
      const queueIndex = index !== -1 ? index : filteredSongs.length;
      
      dispatch(setActiveSong({ 
          song: songToPlay, 
          data: queueData, 
          i: queueIndex 
      }));
      
      dispatch(playPause(true));
    } else {
        console.warn("Cannot play recommendation: No preview URL", song);
    }
  };

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

    let currentTempo = 120;
    if (featuresToUse.effective_tempo) {
      currentTempo = featuresToUse.effective_tempo;
    } else if (featuresToUse.tempo) {
      currentTempo = Number(featuresToUse.tempo) * rateToUse;
    }

    const targetTempo = Number(rec.tempo) || 120;
    const targetEnergy = Number(rec.energy) || 0;
    const targetValence = Number(rec.valence) || 0;
    const targetDanceability = Number(rec.danceability) || Number(rec.dance) || 0;

    const tempoDiff = Math.abs(targetTempo - currentTempo);
    const tempoMatch = Math.max(0, 1 - Math.min(tempoDiff / 100.0, 1.0));
    const energyMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.energy) || 0.5) - targetEnergy));
    const moodMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.valence) || 0.5) - targetValence));
    const danceabilityMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.danceability) || 0.5) - targetDanceability));

    const coreMatchLive = (
      tempoMatch * 0.25 +
      energyMatch * 0.30 +
      moodMatch * 0.20 +
      danceabilityMatch * 0.25
    );

    const genreBonus = rec.genre_match ? 0.10 : 0.0;

    let cosineNormEstimate = null;
    if (typeof rec.similarity_score === 'number') {
      const recTempo = Number(rec.tempo_match || rec.tempo_match === 0 ? rec.tempo_match : rec.tempo_match) || 0;
      const recEnergy = Number(rec.energy_match || rec.energy_match === 0 ? rec.energy_match : rec.energy_match) || 0;
      const recMood = Number(rec.mood_match || rec.mood_match === 0 ? rec.mood_match : rec.mood_match) || 0;
      const recDance = Number(rec.danceability_match || rec.dance_match || 0) || 0;
      const coreMatchOriginal = (recTempo * 0.25) + (recEnergy * 0.30) + (recMood * 0.20) + (recDance * 0.25);

      cosineNormEstimate = (rec.similarity_score - (0.10 * coreMatchOriginal) - genreBonus) / 0.80;
      if (!isFinite(cosineNormEstimate) || Number.isNaN(cosineNormEstimate)) cosineNormEstimate = null;
      if (cosineNormEstimate !== null) {
        cosineNormEstimate = Math.max(0, Math.min(1, cosineNormEstimate));
      }
    }

    if (cosineNormEstimate === null) {
      let fallback = coreMatchLive;
      if (fallback > 0.99) fallback = 0.99;
      return {
        tempo_match: tempoMatch,
        energy_match: energyMatch,
        mood_match: moodMatch,
        danceability_match: danceabilityMatch,
        similarity_score: fallback
      };
    }

    let blended = (cosineNormEstimate * 0.80) + (coreMatchLive * 0.10) + genreBonus;

    const targetId = currentTargetContext?.id || activeSong?.id || activeSong?.productId || '';
    const candId = rec.product_id || rec.productId || rec.id || '';
    const seedStr = `${targetId}:${candId}`;
    let h = 5381;
    for (let i = 0; i < seedStr.length; i++) {
      h = ((h << 5) + h) + seedStr.charCodeAt(i);
      h = h & h;
    }
    const tieJitter = (Math.abs(h) % 1000) / 1_000_000.0;
    blended = blended + tieJitter;

    blended = Math.max(0.0, Math.min(0.999, blended));

    return {
      tempo_match: tempoMatch,
      energy_match: energyMatch,
      mood_match: moodMatch,
      danceability_match: danceabilityMatch,
      similarity_score: blended
    };
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
    <div className="flex flex-col lg:flex-row gap-6 pb-10 sm:pb-14 scrollbar-hide overflow-x-hidden">

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
          
          <button onClick={() => setFilter('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'visualizer' ? 'bg-linear-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-linear-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-linear-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
            Visualiser
          </button>
        </div>

        {filter !== 'visualizer' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => {
            const key = normalizeTrackId(song.trackId || song.id);
            const matchData = songMatchData.get(key);
            const songWithMatch = matchData ? { ...song, ...matchData } : song;
            return (
              <SongCard
                key={song.id}
                song={songWithMatch}
                isPlaying={isPlaying}
                activeSong={activeSong}
                onPlay={handlePlay}
                onPause={handlePause}
                index={i}
                onSongNameClick={handleSongNameClick}
                onArtistClick={handleArtistClick}
                onAlbumClick={handleAlbumClick}
              />
            );
          })}
        </div>
        )}
      </div>

      <div className={`w-full ${filter === 'visualizer' ? 'lg:w-full lg:max-w-full' : 'lg:w-[330px] lg:min-w-[330px]'}`}>
        
        {filter === 'visualizer' && (
          <div className="mb-4">
            <button onClick={() => setFilter('all')} className="px-4 py-2 rounded-full text-sm font-medium transition-all bg-white/10 text-white hover:bg-white/20">
              ← Back to Similar Songs
            </button>
          </div>
        )}
        
        {!currentTargetContext && (
          <div className="bg-linear-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see recommendations</p>
          </div>
        )}

        {currentTargetContext && (
        <div className="bg-linear-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
          <h4 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h4>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{currentTargetContext.trackName || currentTargetContext.albumTitle}</span>
          </p>

          <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-12 h-16 shrink-0">
                {(() => {
                  const coverMedia = currentTargetContext?.albumCoverImageUrl || currentTargetContext?.artworkUrl100;
                  const ctxIsVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  const ctxIsLibrary = (currentTargetContext?.source === 'database') || (Number(currentTargetContext?.id) > 0 && Number(currentTargetContext?.id) < 1000000);
                  const ctxCoverUrl = getSafeCoverUrl(currentTargetContext, '200x200');
                  const ctxHasBadCover = ctxIsVideo || (ctxIsLibrary && ctxCoverUrl === fallbackImage);
                  return (
                    <>
                      <img 
                        key={ctxHasBadCover ? `cloud-${currentTargetContext?.id}` : (coverMedia || 'no-cover')}
                        src={ctxHasBadCover ? '/cloud-cover.webp' : ctxCoverUrl}
                        alt={currentTargetContext.trackName || currentTargetContext.albumTitle}
                        className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                        style={{ animationDuration: '3s' }}
                        onError={(e) => { e.target.src = fallbackImage; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                        <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                      </div>
                    </>
                  );
                })()}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-semibold text-white truncate leading-tight">{currentTargetContext.trackName || currentTargetContext.albumTitle}</p>
                <p className="text-[12px] text-gray-400 truncate -mt-3">{currentTargetContext.artistName && currentTargetContext.artistName !== 'Unknown Artist' ? currentTargetContext.artistName : (currentTargetContext.albumTitle || 'Library Song')}</p>
              </div>
              
              {isPlaying && (
                <div className="flex gap-0.5">
                  <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                  <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                </div>
              )}
            </div>
            
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

          {activeSong && recommendations.length > 0 && (
            <>
              <div className="space-y-2">
                {recommendations
                  .map(rec => {
                    const liveMatch = calculateLiveMatch(rec);
                    
                    const recNormId = normalizeTrackId(rec.product_id || rec.id || rec.trackId);
                    const fallbackSongById = songs.find((s) => normalizeTrackId(s.trackId || s.id) === recNormId);
                    const fallbackSong = fallbackSongById;

                    const resolvedTrackName = !isPlaceholderTrack(rec.trackName)
                      ? rec.trackName
                      : (fallbackSong?.trackName || fallbackSong?.albumTitle || rec.albumTitle || rec.collectionName);
                    const resolvedArtistName = !isPlaceholderArtist(rec.artistName)
                      ? rec.artistName
                      : 'Unknown Artist';

                    return {
                      ...rec,
                      trackName: resolvedTrackName,
                      artistName: resolvedArtistName,
                      collectionName: rec.collectionName || fallbackSong?.collectionName,
                      artworkUrl100: rec.artworkUrl100 || fallbackSong?.artworkUrl100 || fallbackSong?.albumCoverImageUrl,
                      albumCoverImageUrl: rec.albumCoverImageUrl || fallbackSong?.albumCoverImageUrl || fallbackSong?.artworkUrl100,
                      previewUrl: rec.previewUrl || fallbackSong?.previewUrl || fallbackSong?.fileUrl,
                      similarity_score: rec.similarity_score,
                      live_similarity_score: liveMatch ? liveMatch.similarity_score : rec.similarity_score,
                      tempo_match: liveMatch ? liveMatch.tempo_match : rec.tempo_match,
                      energy_match: liveMatch ? liveMatch.energy_match : rec.energy_match,
                      mood_match: liveMatch ? liveMatch.mood_match : rec.mood_match,
                      danceability_match: liveMatch ? liveMatch.danceability_match : (rec.danceability_match || rec.dance_match)
                    };
                  })
                  .sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0))
                  .slice(0, 5)
                  .sort((a, b) => (b.live_similarity_score ?? b.similarity_score ?? 0) - (a.live_similarity_score ?? a.similarity_score ?? 0))
                  .map((rec, idx) => {
                  
                  const recTitle = rec.trackName || rec.albumTitle || rec.collectionName || `Track ${rec.product_id || rec.id || idx + 1}`;
                  const isLibrarySong = rec.product_id > 0 && rec.product_id < 1000000;
                  const recArtist = isLibrarySong ? (rec.artistName && rec.artistName !== 'Unknown Artist' ? rec.artistName : 'Library Song') : (rec.artistName || 'Unknown Artist');
                  const recCoverUrl = getSafeCoverUrl(rec, '200x200');
                  const recHasArt = recCoverUrl && recCoverUrl !== fallbackImage;
                  const scoreForDisplay = rec.live_similarity_score ?? rec.similarity_score ?? 0;
                  
                  return (
                  <div 
                    key={String(rec.product_id || rec.id || rec.trackId || `${recTitle}-${idx}`)}
                    onClick={() => handleRecommendationClick(rec)}
                    className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        {isLibrarySong && !recHasArt ? (
                          <div className="w-full h-full bg-linear-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center">
                            <svg className="w-8 h-8 text-blue-900" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                            </svg>
                          </div>
                        ) : (
                          <img 
                            src={recCoverUrl}
                            alt={recTitle}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = fallbackImage; }}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors text-sm leading-tight flex-1">
                            {recTitle}
                          </h4>
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold text-white shrink-0 ${
                            scoreForDisplay >= 0.7 ? 'bg-green-500' : 
                            scoreForDisplay >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(scoreForDisplay * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 truncate font-medium">{recArtist}</p>
                        <p className="text-xs text-gray-400 truncate">{rec.reason || rec.match_reason}</p>
                        
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
