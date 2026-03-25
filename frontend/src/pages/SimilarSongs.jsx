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

// Artists this page should fetch from iTunes.
const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

// Determines which background color class (from Tailwind CSS) to apply to an artist's UI badge.
const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

// If a song is missing artwork or the image fails to load, this base64-encoded SVG string is used directly 
// as the src attribute for the image tag to ensure something visual is always displayed.
const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

// Takes a URL string and checks if it ends with (or contains, before a query string ?) file extensions associated with audio or video files instead 
// of image files. If it matches, the function returns true, indicating the URL shouldn't be used as an image source.
const isBadImageUrl = (url) => /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(String(url || ''));


// Attempts to find the best available image URL from a song object, 
// as different APIs/databases might use different property names for the cover art.
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

// Converts track IDs into a consistent string format
const normalizeTrackId = (value) => {
  const numeric = Number(value);

  // If the ID is a valid number, it ensures it represents 
  // a positive integer (Math.abs(numeric)) and casts it to a string.
  if (Number.isFinite(numeric) && numeric !== 0) {
    return String(Math.abs(numeric));
  }

  // Returns empty for for null or undefined values
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

const MATCH_STATUS = {
  pending: 'pending',
  resolved: 'resolved',
  notFound: 'not_found',
};


// Determines if an artist name string is missing 
// or represents a generic system placeholder like "unknown artist" or "library artist".
const isPlaceholderArtist = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === 'unknown artist' || n === 'library artist';
};

// Checks if a track name is empty or matches variations of 
// generic labels like "Track 1" or "track-42" using regex (/^track\s*-?\d+$/i).
const isPlaceholderTrack = (name) => {
  const n = String(name || '').trim();
  if (!n) return true;
  return /^track\s*-?\d+$/i.test(n);
};

// Calculates CSS styling themes that represent the
// "mood" or intensity of audio machine-learning features Tempo, Energy, Valance and Danceability.
const getFeatureColor = (label, value) => {

  // Parses the feature's value to an integer
  const numericValue = parseInt(value);
  
  // If the feature is Tempo
  if (label === 'Tempo') {
    // if bpm is < 90, is slow (blue), 90-130 is medium (green), > 130 is fast (red).
    if (numericValue < 90) return { bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-500/50' };
    if (numericValue < 130) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
    return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
  }
  
  // For all other features (typically scored 0-100 or 0.0-1.0 converted to percentages): 
  // >= 70 is high (green), 50-70 is medium (yellow), and < 50 is low (red).
  if (numericValue >= 70) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
  if (numericValue >= 50) return { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-500/50' };
  return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
};


// Displays a single audio feature (e.g., "Tempo: 120")
// passes its label and value props into the getFeatureColor helper function to 
// derive the correct theme, then renders a small, dynamically colored, 
// bordered box containing the label in subtle gray text and the bolded value in thematic text.
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
  
  // Evaluates to true if the ID of the globally active song matches the ID of this card's song.
  const isThisSongActive = activeSong?.id === song.id;

  // Extract the highest quality image available for the song
  const albumArt = getSafeCoverUrl(song, '600x600');

  // tracks whether the user's mouse cursor is currently over the album artwork.
  const [isHovered, setIsHovered] = useState(false);
  

  // These functions wrap the incoming prop callbacks.
  // e.stopPropagation(): This is crucial because It stops 
  // the click event from "bubbling up" the DOM tree.

  // Handle clicking on song name - navigate to details
  const handleSongNameClick = (e) => {
    e.stopPropagation();

    if (onSongNameClick) {
      // Goes to SongDetails if global song name is clicked
      onSongNameClick(song);
    }
  };

  // Handle clicking on artist name - navigate to artist details
  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (onArtistClick) {
      // Goes to ArtistDetails if global song's artist name is clicked
      onArtistClick(song.artistName);
    }
  };

  // Handle clicking on album name - navigate to album details
  const handleAlbumClick = (e) => {
    e.stopPropagation();

    if (onAlbumClick && song.collectionName) {
      // Goes to AlbumDetails if global song's album name is clicked
      onAlbumClick(song.collectionName, song);
    }
  };
  
  // Main wrapper of the card. Styles as a flexible column with padding, frosted glass effect, rounded corners, and brightens on hover.
  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      {/* div.relative... A square container (aspect-square) for the image. It uses onMouseEnter 
      and onMouseLeave to toggle the isHovered state to true/false. */}
      <div 
        className="relative w-full aspect-square"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >      
        {/* img: Displays the album cover. object-cover ensures the image fills the square without distorting. 
        The onError event provides a failsafe: if the image URL is broken and fails to load in the browser, it actively swaps the src to the fallbackImage. */}
        <img 
          src={albumArt} 
          alt={song.trackName} 
          className="w-full h-full rounded-lg object-cover" 
          onError={(e) => { e.target.src = fallbackImage; }} 
        />
        
        {/* Play/Pause overlay - Renders only if song has a previewUrl. Semi-transparent dark overlay.
            Visibility switches based on isHovered state. Clicking toggles play/pause without bubbling up. */}
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

        {/* Artist Badge - Overlaid pill-shaped label at the top-left, 
        dynamically colored based on artist name */}
        <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg max-w-[calc(100%-5rem)] truncate`}>
          {song.artistName}
        </div>

        {/* Active Playing Animation - If this exact song is playing, 
        shows an animated equalizer badge at the bottom-right */}
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

      {/* Text Metadata Section - Renders beneath the artwork. 
      Displays Track, Artist, and Album names with custom click handlers */}
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

      {/* Database Matching Footer - If an iTunes song was matched with a 
      library track via similarity, display the linked local track info */}
      {(song.matchedDbSong || song.matchStatus === MATCH_STATUS.pending) && (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <p className="text-[10px] text-cyan-400">Matched via library track:</p>
          <p className="text-[11px] text-white truncate font-medium">
            {song.matchStatus === MATCH_STATUS.pending
              ? MATCH_PENDING_STATE.albumTitle
              : song.matchedDbSong?.albumTitle}
          </p>
        </div>
      )}
    </div>
  );
};

const SimilarSongs = () => {
  // --- Local Component State ---
  // Tracks if the initial song data is currently being fetched
  const [loading, setLoading] = useState(true);
  
  // Tracks if the app is currently running the bulk similarity analysis
  const [analyzing, setAnalyzing] = useState(false);
  
  // Stores the combined list of external iTunes songs to display
  const [songs, setSongs] = useState([]);
  
  // Stores the native library/DB songs used as targets for similarity matching
  const [dbSongs, setDbSongs] = useState([]);
  
  // Holds the current artist filter selection ('all' or a specific artist)
  const [filter, setFilter] = useState('all');
  
  // Stores any error messages encountered during API requests
  const [error, setError] = useState(null);
  
  // Stores the list of AI-generated song recommendations based on audio features
  const [recommendations, setRecommendations] = useState([]);
  
  // Tracks if recommendation data is currently being fetched/updated
  const [recLoading, setRecLoading] = useState(false);
  
  // Holds the specific audio features (tempo, energy, etc.) currently shown in the UI
  const [displayedFeatures, setDisplayedFeatures] = useState(null);
  
  // Tracks the playback rate to adjust feature visualization (e.g., effective tempo)
  const [displayedPlaybackRate, setDisplayedPlaybackRate] = useState(1);
  
  // A dictionary mapping song IDs to their pre-computed audio features to save processing
  const [cachedAudioFeatures, setCachedAudioFeatures] = useState({});
  
  // --- Refs & External Hooks ---
  // Stores the polling interval ID so it can be reliably cleared on unmount
  const intervalRef = useRef(null);
  // A mutable flag used to ensure the bulk matching process only triggers exactly once
  const matchStartedRef = useRef(false);
  
  // Redux hook to dispatch actions (like play/pause) to the global store
  const dispatch = useDispatch();
  // React Router hook for programmatic navigation (e.g., clicking to a song/artist page)
  const navigate = useNavigate();
  // Redux selector to grab the current state of the global audio player
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);

  // Get audio features from shared context
  const { audioFeatures } = useAudioFeatures();
  
  // Store values in refs so interval always has latest value without triggering re-renders
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  // --- Initialization Hook 1: Fetch Pre-computed Features ---
  // This useEffect runs exactly once when the component first mounts (due to the [] dependency array).
  // It fetches machine-learning audio features (tempo, energy, etc.) previously cached in the backend DB.
  useEffect(() => {
    const fetchCachedFeatures = async () => {
      try {
        const audioApiUrl = envConfig.getApiBaseUrl();
        
        // Calls the audio service cached-features API endpoint. 'artist_only=false' explicitly requests features for individual songs.
        const response = await fetch(`${audioApiUrl}/api/audio/cached-features?artist_only=false`);
        
        if (response.ok) {
          
          // fixTextDeep sanitizes the response text to avoid encoding corruption.
          const data = fixTextDeep(await response.json());
          
          // Stores the returned dictionary into component state. 
          // If it's missing, it defaults to an empty object.
          setCachedAudioFeatures(data.features || {});
          console.log(`[SimilarSongs] Loaded ${data.count} cached audio features`);
        }
      } catch (err) {
        console.warn('Could not fetch cached audio features:', err.message);
      }
    };
    fetchCachedFeatures();
  }, []);

  // --- Initialization Hook 2: Fetch and Assemble Song Data ---
  // This hook also runs exactly once on mount. It is responsible for grabbing both the local library products 
  // and the designated iTunes artist songs, then structuring them identically for the UI.
  useEffect(() => {   
    const fetchAllSongs = async () => {
      // Signals to the UI that data is currently loading so a spinner or skeleton can be shown
      setLoading(true);
      setError(null);
      
      // Get API URL from environment config
      const apiBaseUrl = `${envConfig.getApiBaseUrl()}/api`;
      
      try {
        // --- Step 1: Load Local Database Songs ---
        const products = await productService.getAllProducts();

        // Only include actual store products (positive IDs), exclude cached iTunes songs
        // Normalize properties to match iTunes format (trackName, artworkUrl100) for consistent rendering
        const musicProducts = products
          // Filter 1: Ensure it has audio (fileUrl), a title, and is a native DB product (ID > 0)      
          .filter(p => p.albumTitle && p.fileUrl && p.id > 0)
          
          // Filter 2: Deduplication. Ensures unique entries by comparing album title and artist name.
          .filter((p, index, self) => 
            index === self.findIndex((t) => (
              t.albumTitle === p.albumTitle && t.artistName === p.artistName
            ))
          )
          // Limit to 47 songs if the library set size must be down-selected
          .slice(0, 47)         
          // Map DB columns to standardized "iTunes style" component props (e.g., artworkUrl100, previewUrl)
          .map(p => ({
            ...p,
            trackName: p.albumTitle || p.productName, 
            artworkUrl100: p.albumCoverImageUrl || p.imageUrl || p.image, 
            previewUrl: p.fileUrl,                    
            artistName: p.artistName || 'Unknown Artist'
          }));
        
        // Store the mapped database songs in local state to act as a core library target pool
        setDbSongs(musicProducts);
        
        // --- Step 2: Load iTunes Artist Songs ---
        const allArtistSongs = [];
        
        // Loop over the predefined ARTISTS constants array (e.g., Aphex Twin, Boards of Canada)
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            // Add a 300ms delay between requests (except the first one) to avoid rate limiting or flooding the backend proxy
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Uses proxy to avoid CORS issues from client-side calls to iTunes
            const response = await fetch(
              `${apiBaseUrl}/itunes/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`
            );
            const data = fixTextDeep(await response.json());
            
            // Validation: Check if results exist before filtering, skip to next artist if malformed
            if (!data.results) {
               console.warn(`No results format for ${artist}`, data);
               continue;
            }

            // Filter to only include tracks that have a playable preview AND strictly match the exact artist name requested
            const artistLower = artist.toLowerCase();
            const artistSongs = data.results
              .filter(track => track.previewUrl && track.artistName?.toLowerCase().includes(artistLower))
              // Cap at 50 valid tracks per artist
              .slice(0, 50)
              // Normalize the iTunes API raw payload into a simplified component object structural model
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
                trackTimeMillis: track.trackTimeMillis,
                matchedDbSong: null,
                matchStatus: MATCH_STATUS.pending,
              }));
            
            // Push this chunk of 50 artist songs into the aggregator array
            allArtistSongs.push(...artistSongs);
          } catch (artistErr) {
            // Ignore AbortErrors from React Strict Mode or component unmounting
            if (artistErr.name !== 'AbortError') {
              console.warn(`Error fetching ${artist}:`, artistErr);
            }
          }
        }
        
        // --- Step 3: Finalize External Songs List ---
        // Pass songs through directly to avoid fake mapping, real similarity calculation is triggered dynamically
        const calculatedSongs = allArtistSongs.map(song => {
             return song;
        });
        
        // Updates the external song list and triggers a re-render to display the cards
        setSongs(calculatedSongs);
      } catch (err) {
        console.error('Error in fetchAllSongs:', err);
        // Catches outer-level API failures and safely stores the error message to display in UI
        setError(err.message);
      } finally {
        // Ensures the loading spinner goes away, regardless of success or error outcome
        setLoading(false);
      }
    };

    fetchAllSongs();
  }, []);


  // Helper function to extract a valid song object from the global audio player state.
  // The Visualiser and Recommendation engine should only run if a valid, 
  // non-empty song object is currently playing or selected.
  const getCurrentTarget = () => {
    // Check if activeSong exists and has at least one property to ensure it's not an empty placeholder object.
    if (activeSong && Object.keys(activeSong).length > 0) {
      return activeSong;
    }
    return null;
  };
  
  // Evaluate and store the active target song for use in UI toggles and dependency checks.
  const currentTargetContext = getCurrentTarget();

  // Hook to reset UI visualiser state immediately whenever the user switches to a different track.
  // Watches the trackId or id to detect song changes.
  useEffect(() => {
    // Clear visual features (tempo, energy, etc.) from the display.
    setDisplayedFeatures(null);
    
    // Reset the displayed playback speed to the currently active default.
    setDisplayedPlaybackRate(Number(playbackRateRef.current || 1));
    
    // Empty the recommendation list so stale matches do not flash on screen while data loads.
    setRecommendations([]);
  }, [activeSong?.trackId || activeSong?.id]);


  // Main polling orchestration hook to handle continuous recommendation updates while audio plays.
  // Handles interval polling to keep dynamic feature badges and lists fresh.
  useEffect(() => {
    // Clear any pre-existing polling intervals to prevent multiple timer loops executing simultaneously.
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Identify the currently selected or playing track.
    const targetSong = getCurrentTarget();

    // Abort execution and clear the UI if no valid target song exists,
    //  or if the global song list is empty.
    if (!targetSong || songs.length === 0) {
      setRecommendations([]);
      return;
    }

    // Internal async function handling the API request to fetch updated recommendation matches.
    const updateRecs = async () => {
      try {
        const apiBaseUrl = envConfig.getApiBaseUrl();

        // Snapshot the current live audio analysis features and playback rate from mutable refs.
        const live = audioFeaturesRef.current;
        const liveRate = Number(playbackRateRef.current || 1);
        
        // Update the visual component state with the current playback speed.
        setDisplayedPlaybackRate(liveRate);
        
        // If live analysis features exist, securely cast and push them into state for real-time visual UI rendering.
        if (live) {
          setDisplayedFeatures({
            tempo: live.tempo ? Number(live.tempo) : null,
            energy: live.energy ? Number(live.energy) : null,
            valence: live.valence ? Number(live.valence) : null,
            danceability: live.danceability ? Number(live.danceability) : null,
          });
        }

        // Determine the best source of audio features for the similarity scoring algorithm.
        // For SimilarSongs, always prefer deterministic, static cache features over volatile live analysis.
        // This prevents the AI recommendation list from continuously shuffling due to live audio processing fluctuations.
        let featuresToSend = null;
        
        // Ensure the reference song ID is parsed into a standardized string format.
        const songIdStr = String(targetSong.trackId || targetSong.id);
        
        // Lookup previously computed feature sets in local cache memory (checking both normal and matched negative ID keys).
        const cached = cachedAudioFeatures[songIdStr] || cachedAudioFeatures[String(-Math.abs(Number(songIdStr)))];

        if (cached) {
          // If a static cache copy exists, enforce strict numerical types and ignore any active playback speed adjustments.
          featuresToSend = {
            ...cached,
            tempo: Number(cached.tempo),
            energy: Number(cached.energy),
            valence: Number(cached.valence),
            danceability: Number(cached.danceability),
            acousticness: Number(cached.acousticness),
            
            // Fix rate to 1.0 to guarantee stable comparison mapping against other static tracks.
            playback_rate: 1, 
          };
        } else if (activeSong && audioFeaturesRef.current) {
         
          // Fallback strategy: Pass live, rolling-average audio feature measurements forward if no static cache exists.
          featuresToSend = {
            tempo: audioFeaturesRef.current.tempo ? parseFloat(audioFeaturesRef.current.tempo) : null,
            energy: audioFeaturesRef.current.energy ? parseFloat(audioFeaturesRef.current.energy) : null,
            valence: audioFeaturesRef.current.valence ? parseFloat(audioFeaturesRef.current.valence) : null,
            danceability: audioFeaturesRef.current.danceability ? parseFloat(audioFeaturesRef.current.danceability) : null,
            acousticness: audioFeaturesRef.current.acousticness ? parseFloat(audioFeaturesRef.current.acousticness) : null,
            
            // Multiply base tempo against the current user-modified playback speed to derive the effective listening tempo.
            effective_tempo: audioFeaturesRef.current.tempo ? (parseFloat(audioFeaturesRef.current.tempo) * parseFloat(playbackRateRef.current || 1)) : null,
            playback_rate: parseFloat(playbackRateRef.current || 1),
          };
        }

        // Construct the rigid data structure for the backend Python ML engine.
        const payload = {
            // Force the target label to "similar_songs" allowing the backend to scan cross-referenced iTunes tracks.
            source: 'similar_songs', 
            
            // Forward the active track identity map.
            current_product_id: String(targetSong.trackId || targetSong.id),
            
            // Forward the audio binary URL directly to allow fallback remote-extraction on the backend if DB queries fail.
            preview_url: String(targetSong.previewUrl || targetSong.fileUrl || ''),
            
            // Attach the chosen features (cached or live) representing the active audio.
            audio_features: featuresToSend,
            
            // Request a wide net of up to 150 potential mathematical similarity matches.
            limit: 150
        };

        // Output structural payload logging for system inspection and debugging.
        console.log('[SimilarSongs] Sending Unified Payload:', JSON.stringify(payload, null, 2));

        // Transmit the fully formed payload block via HTTP POST to the central scoring application protocol array.
        // Implement a strict 5000ms fetch delay abort constraint to safeguard against hung asynchronous networking threads.
        const response = await fetch(`${apiBaseUrl}/api/audio/unified-recommendations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
           // Parse and sanitize the JSON response from the recommendation API.
           const data = fixTextDeep(await response.json());
           
           if (data.recommendations) {
               // Initialize a mutable array to hold the recommendation list, 
               // preparing it for optional iTunes hydration.
               let enrichedRecommendations = data.recommendations;

               // When backend returns generic placeholder artists (e.g., "unknown artist"), 
               // attempt to hydrate missing metadata via a direct iTunes API lookup by track ID.
               const unresolvedArtistRecs = (data.recommendations || []).filter((rec) =>
                 isPlaceholderArtist(rec.artistName)
               );
               
               if (unresolvedArtistRecs.length > 0) {
                 try {
                   // Extract a unique list of valid positive numerical IDs from the unresolved recommendations.
                   // The iTunes lookup API accepts a maximum of 50 IDs per request.
                   const lookupIds = Array.from(
                     new Set(
                       unresolvedArtistRecs
                         .map((rec) => Number(rec.product_id || rec.id || rec.trackId))
                         .filter((id) => Number.isFinite(id) && Math.abs(id) >= 1000000)
                         .map((id) => Math.abs(id))
                     )
                   ).slice(0, 50);

                   if (lookupIds.length > 0) {
                     // Perform a bulk lookup against the public iTunes API using the collected IDs.
                     const lookupResp = await fetch(
                       `https://itunes.apple.com/lookup?id=${lookupIds.join(',')}`,
                       { signal: AbortSignal.timeout(5000) }
                     );
                     
                     if (lookupResp.ok) {
                       const lookupData = fixTextDeep(await lookupResp.json());
                       
                       // Build a quick-access Map linking the integer Track ID to the iTunes track metadata.
                       const itunesMap = new Map(
                         (lookupData.results || [])
                           .filter((item) => item.trackId)
                           .map((item) => [Math.abs(Number(item.trackId)), item])
                       );

                       // Map over the original recommendations, merging in the pristine iTunes data 
                       // where placeholder values existed previously.
                       enrichedRecommendations = data.recommendations.map((rec) => {
                         const rawId = Number(rec.product_id || rec.id || rec.trackId);
                         const lookup = Number.isFinite(rawId) ? itunesMap.get(Math.abs(rawId)) : null;
                         
                         // If no matching iTunes record was found, return the recommendation unchanged.
                         if (!lookup) return rec;
                         
                         // Stitch together the final recommendation object, prioritizing the lookup data 
                         // over placeholder strings.
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
                   // Failsafe: Retain the original un-enriched recommendations if the iTunes lookup request fails.
                 }
               }

               // Update the component state with the finalized recommendations list.
               setRecommendations(enrichedRecommendations);
               
               // Map the freshly fetched similarity scores directly back into the master iTunes 'songs' array.
               // This ensures UI components updating via the master array reflect newly discovered matches.
               setSongs((currentSongs) => {              
                // Build a lookup map holding the specific similarity scores and tags.
                 const recMap = new Map(
                   enrichedRecommendations.map((rec) => [normalizeTrackId(rec.product_id || rec.id), rec])
                 );

                 return currentSongs.map((song) => {
                   const matchedRec = recMap.get(normalizeTrackId(song.trackId || song.id));
                   
                   // If this master song has no match in the new recommendation payload, clear its similarity UI stats.
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

                   // If it does match, inject the similarity scoring matrices into the song object.
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
             // Fallback application: if the client lacks a live analyser, use the static target features 
             // calculated by the backend for visual badge rendering.
             if (data.target_features && !live) {
               setDisplayedFeatures({
                   tempo: data.target_features.tempo,
                   energy: data.target_features.energy,
                   valence: data.target_features.valence,
                   danceability: data.target_features.danceability
               });
           }
        }
      } catch {
         // console.warn("ML Similarity update failed", err);
      }
    };

    // Trigger an immediate UI update the first time the hook runs.
    setRecLoading(true);
    updateRecs();
    setRecLoading(false);

    // Set up continuous polling interval (3 seconds) to handle active playback modifications
    // (e.g., pulling fresh live analyser features or adjusting to playback rate changes).
    intervalRef.current = setInterval(updateRecs, 3000);

    // Hook unmount cleanup routine.
    return () => {
      // Guaranteed teardown of the interval timer when the active song changes or component unmounts
      // to prevent memory leaks and orphaned network requests.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSong?.trackId || activeSong?.id, songs.length > 0, dbSongs.length > 0]);


  // --- Bulk Match Hook: Correlate external iTunes songs with internal Database tracks ---
  // This hook silently pipelines all loaded iTunes songs through the ML matching backend 
  // so the UI can display which specific local library track was deemed "most visually/musically similar".
  useEffect(() => {
    // Early exit guard clause: Do not execute if core data is missing or still fetching.
    if (loading || dbSongs.length === 0 || songs.length === 0) return;
    
    // Thread safety flag constraint: Enforce strict single-execution concurrency. 
    // Prevents duplicate expensive bulk matching loops across aggressive React strict-mode re-renders.
    if (matchStartedRef.current) return;

    // Lock the execution mutex state and display loading indicators in the UI.
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

    // Internal async closure handling the bulk networking request logic.
    const matchSongsUsingBulkEndpoint = async () => {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        console.log(`[SimilarSongs] Matching ${songs.length} iTunes songs to 47 library songs using Bulk Match...`);
        const candidateSongs = songs.filter((song) => song.source !== 'database');
        if (candidateSongs.length === 0) {
          await finishAnalyzing();
          return;
        }
        
        // Define rate limits: process a maximum of 5 external songs per API transmission.
        const BATCH_SIZE = 5;
        
        // Restrict matching to the curated 47-song internal library pool for this page.
        const targetIds = Array.from(
          new Set(
            dbSongs
              .map((song) => Number(song.id))
              .filter((id) => Number.isFinite(id) && id > 0)
          )
        );
        
        // Initialize a runtime dictionary map holding successful positive track correlations.
        const matchedByTrack = new Map();

        const applyResolvedMatches = () => {
          setSongs((currentSongs) =>
            currentSongs.map((song) => {
              const resolved = matchedByTrack.get(normalizeTrackId(song.trackId || song.id));
              if (!resolved) {
                return song;
              }

              return {
                ...song,
                matchedDbSong: resolved,
                matchStatus: MATCH_STATUS.resolved,
              };
            })
          );
        };

        // Sub-function orchestrating the chunking protocol constraints and network calls.
        const runMatchPass = async (candidateSongs) => {
          const batches = [];
          
          // Slice the large candidate array into smaller, manageable subarrays dictated by BATCH_SIZE.
          for (let i = 0; i < candidateSongs.length; i += BATCH_SIZE) {
            batches.push(candidateSongs.slice(i, i + BATCH_SIZE));
          }

          // Iteratively send each sliced cluster to the remote backend service synchronously.
          for (const batch of batches) {
            const payload = {
              // Map the external candidate structures to fit backend schema expectations
              candidates: batch.map((s) => {
                // Ensure Track ID casts predictably to a string baseline
                const rawId = String(s.trackId || s.id || '');
                const numericId = Number(rawId);
                
                // Account for potential negative integer mappings used for internal cache differentiation.
                const negId = Number.isFinite(numericId) && numericId !== 0 ? String(-Math.abs(numericId)) : null;
                
                // Determine whether static cached features exist for the song identity.
                const cached = cachedAudioFeatures[rawId] || (negId ? cachedAudioFeatures[negId] : null);
                
                const audioFeatures = buildAudioFeaturePayload(cached);
                const candidate = {
                  trackId: String(s.trackId || s.id),
                  trackName: String(s.trackName || s.albumTitle || 'Unknown'),
                  artistName: String(s.artistName),
                  previewUrl: String(s.previewUrl || s.fileUrl || ''),
                };

                // Only send real cached features. Otherwise let the backend extract from preview audio.
                if (audioFeatures) {
                  candidate.audio_features = audioFeatures;
                }

                return candidate;
              }),
              // Configure computational boundaries limits for the backend logic model.
              limit: BATCH_SIZE,
            };

            if (targetIds.length > 0) {
              // Attach the active pool of native DB targets when valid IDs exist.
              payload.target_ids = targetIds;
            }

            try {
              // Initiate POST payload mapping correlation matrices on the python application layer over local proxy.
              const response = await fetch(`${apiBaseUrl}/api/audio/match-library`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              if (response.ok) {
                // Read matched output safely mapped via Unicode normalizers.
                const data = fixTextDeep(await response.json());
                const matches = data.matches || [];

                // Store positive matches by hashing their normalized ID locally for instant UI referencing.
                matches.forEach((match) => {
                  const key = normalizeTrackId(match.input_track_id);
                  const fallbackTitle = match.matched_product_id ? `Track ${match.matched_product_id}` : 'No similar library track found';
                  
                  // Retain structured relationship details containing native application identifiers.
                  matchedByTrack.set(key, {
                    id: match.matched_product_id ?? null,
                    albumTitle: match.matched_product_name || fallbackTitle,
                  });
                });

                applyResolvedMatches();
              } else {
                // Log non-200 protocol codes effectively without halting execution arrays.
                const failText = await response.text();
                console.warn('Bulk match non-200 response', response.status, failText);
              }
            } catch (e) {
              // Silently trap and log total network failures, allowing subsequent iteration batches continuity.
              console.warn('Bulk match failed', e);
            }

            // Implement a deliberate 50ms pacing delay between loop triggers to act as network back-pressure protection.
            await new Promise((r) => setTimeout(r, 50));
          }
        };

        // Execute the main bulk matching pass for all loaded external artists.
        await runMatchPass(candidateSongs);

        // Identify any songs that failed to return a valid local library match during the primary run.
        const unresolved = candidateSongs.filter((s) => !matchedByTrack.has(normalizeTrackId(s.trackId || s.id)));
        
        // If orphaned tracks exist, trigger a secondary fallback network pass specifically targeting those failures.
        if (unresolved.length > 0) {
          console.warn(`[SimilarSongs] Retrying library match for ${unresolved.length} unresolved songs`);
          await runMatchPass(unresolved);
        }

        // Commit the final resolution matrix back to the master song array in component state.
        setSongs((currentSongs) =>
          currentSongs.map((song) => {
            // Re-normalize identifiers to ensure strict map lookups avoid type or whitespace mismatches.
            const key = normalizeTrackId(song.trackId || song.id);
            const resolved = matchedByTrack.get(key);
            
            // Merge the resolved local database ID and Title directly onto the external iTunes object.
            // Assign a dummy fallback object string if the track completely failed similarity thresholding.
            return {
              ...song,
              matchedDbSong:
                resolved ||
                song.matchedDbSong || {
                  ...MATCH_NOT_FOUND_STATE,
                },
              matchStatus: resolved ? MATCH_STATUS.resolved : MATCH_STATUS.notFound,
            };
          })
        );

        // Remove the visual loading flag indicating network bulk-analysis completion.
        await finishAnalyzing();
    };

    // Invoke the asynchronous bulk match logic tree on mount.
    matchSongsUsingBulkEndpoint().catch(async (err) => {
      console.warn('SimilarSongs bulk matching aborted:', err);
      await finishAnalyzing();
    });
  }, [loading, dbSongs.length, songs.length, cachedAudioFeatures]);

  // --- UI Presentation Layer Helpers ---

  // useMemo hook dynamically builds the filtered sub-array of songs displayed in the main grid grid.
  // Using useMemo prevents expensive array filtering operations from re-running unnecessarily upon every render cycle.
  const filteredSongs = useMemo(() => {
    let filtered;
    
    // Check if the global 'All' toggle is active.
    if (filter === 'all') {
      // Create a shallow copy of the full array to satisfy React state immutability patterns.
      filtered = [...songs];
    } else {
      // Filter out songs unless their standardized artist tag matches the currently defined active filter token.
      filtered = songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
    }

    return filtered;
  }, [songs, filter]);

  // Global Audio Player Hooks 
  
  // Dispatches an action setting the clicked track as globally active.
  const handlePlay = (song, index) => {
    // Only execute if a valid streaming audio URL exists to prevent player crash states.
    if (song.fileUrl) {
      // Push the song object, full playlist context vector, and current index into Redux state.
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      // Issue play command directly.
      dispatch(playPause(true));
    }
  };

  // Dispatches the pause command directly to the Redux global audio player context.
  const handlePause = () => {
    dispatch(playPause(false));
  };

  // --- Router Navigation Definitions ---

  // Triggered when a user clicks a song title text string. Navigates to a dedicated full-page song view.
  const handleSongNameClick = (song) => {
    navigate(`/songs/${song.trackId || song.id}`, {
      state: {
        song: song,
        // Pass the broader external song matrix forward to allow subsequent pages to generate ML graphs.
        artistSongs: songs, 
        
        // Implement breadcrumb tracking for 'Back' button routing logic.
        from: '/similar-songs'
      }
    });
  };

  // Triggered when a user clicks the artist name text string.
  const handleArtistClick = (artistName) => {
    // Formulate an SEO friendly URL slug tag (e.g. "aphex twin" -> "aphex-twin") before routing.
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  // Triggered when a user clicks the album title text string.
  const handleAlbumClick = (albumName, song) => {
    // URL encode strings to ensure mathematical characters properly resolve in HTTP headers without crashing routers.
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        song: song,
        // Upgrade low resolution iTunes thumbnails (100x100) to high resolution versions (600x600) via URL string replacement.
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
      }
    });
  };

  // Action handler for the Recommendation Sidebar links.
  // Translates clicked backend-generated recommendation items into actionable Redux player track objects.
  const handleRecommendationClick = (song) => {
    
    // Normalizes differing JSON schema formats between the backend recommendation engine 
    // and the strict React generic player component interface.
    const songToPlay = {
        ...song,
        id: song.product_id || song.id,
        trackId: song.product_id || song.id,
        fileUrl: song.previewUrl || song.fileUrl,
        artworkUrl100: song.artworkUrl100 || song.albumCoverImageUrl,
        trackName: song.trackName || 'Unknown Track',
        
        // Coalesce album titles to ensure the global audio player UI 
        // does not collapse due to missing text boundaries.
        albumTitle: song.albumTitle || song.collectionName || song.trackName || 'Single',
        artistName: song.artistName || 'Unknown Artist'
    };

    // Validates that MP3 audio metadata actually exists before dispatching playback states.
    if (songToPlay.fileUrl) {
      // Look up the clicked track inside the actively 
      // rendered grid array to maintain global playlist indexing.
      let index = songs.findIndex(s => String(s.id) === String(songToPlay.id));
      
      // Dispatch payload to Redux. If the track exists in the main grid, 
      // pass the full grid context vector. If the track is an isolated 
      // external library recommendation not visible in the grid, pass it as a singleton array.
      dispatch(setActiveSong({ 
          song: songToPlay, 
          data: index !== -1 ? songs : [songToPlay], 
          i: index !== -1 ? index : 0 
      }));
      
      // Trigger media playback immediately upon loading state.
      dispatch(playPause(true));
    } else {
        // Output failure to system console if the recommendation lacks playable audio preview strings.
        console.warn("Cannot play recommendation: No preview URL", song);
    }
  };

  // Local helper function evaluating the live contextual playback state against candidate recommendation tracks.
  // Drives the mathematical matching UI rendered in Visualiser Mode.
  const calculateLiveMatch = (rec) => {
    // Prioritize dynamic visual features derived from real-time playback updates. 
    // Fallback to static contextual track features if the visualiser polling hook is uninitialized.
    const featuresToUse = displayedFeatures || audioFeatures;

    // Fast-fail: Return cached similarity computations directly from the backend if live UI mapping data is entirely absent.
    if (!featuresToUse) {
       return {
         tempo_match: rec.tempo_match,
         energy_match: rec.energy_match,
         mood_match: rec.mood_match,
         danceability_match: rec.danceability_match || rec.dance_match,
         similarity_score: rec.similarity_score
       };
    }

    // Safely parse the active UI speed multiplier context.
    const rateToUse = displayedPlaybackRate || 1;
    
    // Step 1: Establish baseline metrics for the active reference track.
    let currentTempo = 120;
    if (featuresToUse.effective_tempo) {
        // Favor pre-calculated effective tempo if provided by upstream hooks.
        currentTempo = featuresToUse.effective_tempo;
    } else if (featuresToUse.tempo) {
        // Otherwise, manually scale the base track tempo coefficient against the active playback multiplier modifier.
        currentTempo = Number(featuresToUse.tempo) * rateToUse;
    }
    
    // Step 2: Extract candidate track tempo bounds, defaulting to typical 120 BPM mapping if missing.
    const targetTempo = Number(rec.tempo) || 120;
    
    // Step 3: Compute localized individual dimension distance metrics manually.
    
    // Calculate the absolute integer distance between modified playback speed and the static target BPM.
    const tempoDiff = Math.abs(targetTempo - currentTempo);
    
    // Normalize tempo deviation into a predictable 0.0 - 1.0 scoring constraint via linear scaling.
    const tempoMatch = Math.max(0, 1 - Math.min(tempoDiff / 100.0, 1.0));
    
    // Calculate fractional distance deviations for remaining core ML characteristics (Energy, Valence, Danceability).
    const energyMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.energy) || 0.5) - (Number(rec.energy) || 0.5)));
    const moodMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.valence) || 0.5) - (Number(rec.valence) || 0.5)));
    const danceabilityMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.danceability) || 0.5) - (Number(rec.danceability) || 0.5)));

    // Step 4: Execute a localized Weighted Combinatorial heuristic.
    // Mimics the remote backend python regression weights without initiating a new HTTP request thread.
    let score = (
      tempoMatch * 0.25 +
      energyMatch * 0.30 +
      moodMatch * 0.20 +
      danceabilityMatch * 0.25
    );
    
    // Impose strict sanity bounds on the final scalar. Prevents rounding errors from exposing scores above 99% accuracy models.
    if (score > 0.99) score = 0.99;
    
    // Coalesce fatal null operations back to origin zero mathematically avoiding visual cascade failures.
    if (isNaN(score)) score = 0;
    
    // Return structured matching vectors standardized for downstream React view consumption mapping.
    return {
      tempo_match: tempoMatch,
      energy_match: energyMatch,
      mood_match: moodMatch,
      danceability_match: danceabilityMatch,
      similarity_score: score
    };
  };

  // Primary Conditional Block Render Guards
  
  // Halts render entirely and displays a custom UI spinner animation when initial API fetching passes are incomplete.
  if (loading) return <Loader title="Finding similar songs from iTunes..." />;
  
  // Displays structured fallback failure views containing actionable reload hooks if HTTP/Networking exceptions are raised.
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
    // Main Container encapsulating the entire page view.
    // Uses horizontal flexbox on large screens and vertical stacking on mobile.
    <div className="flex flex-col lg:flex-row gap-6 scrollbar-hide overflow-x-hidden">

      {/* Main Left Content Area - Contains Title, Filter Buttons, and Song Grid */}
      {/* Hide this entire area completely if the UI is toggled into 'visualizer' mode. */}
      <div className={`flex-1 min-w-0 ${filter === 'visualizer' ? 'hidden' : ''}`}>
        
        {/* Page Header Section */}
        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">Similar Track Information</h1>
          <p className="text-gray-400">Aphex Twin, Squarepusher and Boards of Canada songs ranked by unified ML similarity using the same scoring path as the visualiser.</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <p className="text-xs text-cyan-400">Powered by ML Audio Similarity • {songs.length} artist tracks with 30s previews • Industry-standard feature extraction</p>
            
            {/* Conditional Loading Spinner - Renders while the background `matchSongsUsingBulkEndpoint` pass executes. */}
            {analyzing && (
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-yellow-500 font-semibold animate-pulse">Loading similar library songs...</span>
                </div>
            )}
          </div>
        </div>

        {/* Filter Navigation row. Provides dynamic state toggling to select the displayed subsets of external songs. */}
        <div className="mb-6 flex flex-wrap gap-3">
          
          {/* Default 'All' Button */}
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            All ({songs.length})
          </button>
          
          {/* Aphex Twin Filter Button */}
          <button onClick={() => setFilter('aphex')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'aphex' ? 'bg-purple-500 text-white' : 'bg-white/10 text-white hover:bg-purple-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            Aphex Twin ({songs.filter(s => s.artistName?.toLowerCase().includes('aphex')).length})
          </button>
          
          {/* Boards of Canada Filter Button */}
          <button onClick={() => setFilter('boards')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'boards' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white hover:bg-orange-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            Boards of Canada ({songs.filter(s => s.artistName?.toLowerCase().includes('boards')).length})
          </button>
          
          {/* Squarepusher Filter Button */}
          <button onClick={() => setFilter('squarepusher')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'squarepusher' ? 'bg-cyan-500 text-white' : 'bg-white/10 text-white hover:bg-cyan-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Squarepusher ({songs.filter(s => s.artistName?.toLowerCase().includes('squarepusher')).length})
          </button>
          
          {/* Visualiser Mode Toggle Button - Applies special gradient styling when active. */}
          <button onClick={() => setFilter('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'visualizer' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
            Visualiser
          </button>
        </div>

        {/* Dynamic Song Grid Map Rendering - Hidden entirely when the user clicks the "Visualiser" button. */}
        {filter !== 'visualizer' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => (
            // Passes necessary state bindings and click router handlers to independent reusable child components.
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} onSongNameClick={handleSongNameClick} onArtistClick={handleArtistClick} onAlbumClick={handleAlbumClick} />
          ))}
        </div>
        )}
      </div>

      {/* Right Sidebar - Real-time Target Track Context and Matrix Visualiser rendering logic */}
      {/* Allows the sidebar to consume all available width if the visualizer mode is engaged removing the left grid */}
      <div className={`w-full ${filter === 'visualizer' ? 'lg:w-full lg:max-w-full' : 'lg:w-[330px] lg:min-w-[330px]'}`}>
        
        {/* Render a navigation back-button exclusively when in expanded visualizer mode */}
        {filter === 'visualizer' && (
          <div className="mb-4">
            <button onClick={() => setFilter('all')} className="px-4 py-2 rounded-full text-sm font-medium transition-all bg-white/10 text-white hover:bg-white/20">
              ← Back to Similar Songs
            </button>
          </div>
        )}
        
        {/* Empty State Fallback Panel - Rendered only when the global Redux playback state represents zero tracks */}
        {!currentTargetContext && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see recommendations</p>
          </div>
        )}

        {/* Active Context Panel - Renders the analysis readout of the currently playing track */}
        {currentTargetContext && (
        <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
          <h4 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h4>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{currentTargetContext.trackName || currentTargetContext.albumTitle}</span>
          </p>

          {/* Current Track Live Analysis Box */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                
                {/* Visual implementation of a spinning vinyl-record album cover */}
                <div className="relative w-12 h-16 flex-shrink-0">
                  <img 
                    key={currentTargetContext?.albumCoverImageUrl || currentTargetContext?.artworkUrl100 || 'no-cover'}
                    src={getSafeCoverUrl(currentTargetContext, '200x200')}
                    alt={currentTargetContext.trackName || currentTargetContext.albumTitle}
                    // Attaches a custom CSS `animate-spin` class only when Redux claims `isPlaying` flag is active.
                    className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  {/* Decorative vinyl record center hole punched via z-indexing and absolute positioning */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                    <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                  </div>
                </div>
                
                {/* Truncated text wrappers mapping standard Track & Artist definitions */}
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-white truncate leading-tight">{currentTargetContext.trackName || currentTargetContext.albumTitle}</p>
                  <p className="text-[12px] text-gray-400 truncate -mt-3">{currentTargetContext.artistName || 'Unknown Artist'}</p>
                </div>
                
                {/* Floating equalizer pulse bars mapped directly alongside track playback activity */}
                {isPlaying && (
                  <div className="flex gap-0.5">
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
              
              {/* Conditional Data Display: Sub-renders 4 dynamic feature badges executing parsed scale multipliers. */}
              {displayedFeatures && (
                <div className="grid grid-cols-4 gap-1">
                  <FeatureBadge label="Tempo" value={`${Math.round((displayedFeatures.tempo || 0) * (displayedPlaybackRate || 1))}`} />
                  <FeatureBadge label="Energy" value={`${Math.round((displayedFeatures.energy || 0) * 100)}%`} />
                  <FeatureBadge label="Mood" value={`${Math.round((displayedFeatures.valence || 0) * 100)}%`} />
                  <FeatureBadge label="Dance" value={`${Math.round((displayedFeatures.danceability || 0) * 100)}%`} />
                </div>
              )}
              
              {/* Fallback loading output provided whenever polling hooks cannot secure API return structs. */}
              {!displayedFeatures && (
                <p className="text-gray-500 text-center">Analyzing audio features...</p>
              )}
            </div>

          {/* Recommendations List Container - Renders only when an active track is selected and recommendations exist */}
          {activeSong && recommendations.length > 0 && (
            <>
              {/* <p className="text-[12px] text-gray-500 mb-2">{recommendations.length} matches • Updates 3s</p> */}
              <div className="space-y-2">
                {/* Dynamically maps and structures recommendation data retrieved from the backend API */}
                {recommendations
                  .map(rec => {
                    // Calculates real-time similarity alignment against live playback metrics.
                    const liveMatch = calculateLiveMatch(rec);
                    
                    // Normalizes track identification strings to support consistent fallback comparisons.
                    const recNormId = normalizeTrackId(rec.product_id || rec.id || rec.trackId);
                    const fallbackSongById = songs.find((s) => normalizeTrackId(s.trackId || s.id) === recNormId);
                    const fallbackSong = fallbackSongById;

                    // Resolves metadata fields by deferring to base cache models if API returns placeholders.
                    const resolvedTrackName = !isPlaceholderTrack(rec.trackName)
                      ? rec.trackName
                      : (fallbackSong?.trackName || fallbackSong?.albumTitle || rec.albumTitle || rec.collectionName);
                    const resolvedArtistName = !isPlaceholderArtist(rec.artistName)
                      ? rec.artistName
                      : 'Unknown Artist';

                    // Constructs a unified data structure combining static library info with live ML variance scoring.
                    return {
                      ...rec,
                      trackName: resolvedTrackName,
                      artistName: resolvedArtistName,
                      collectionName: rec.collectionName || fallbackSong?.collectionName,
                      artworkUrl100: rec.artworkUrl100 || fallbackSong?.artworkUrl100 || fallbackSong?.albumCoverImageUrl,
                      albumCoverImageUrl: rec.albumCoverImageUrl || fallbackSong?.albumCoverImageUrl || fallbackSong?.artworkUrl100,
                      previewUrl: rec.previewUrl || fallbackSong?.previewUrl || fallbackSong?.fileUrl,
                      // Preserves backend cosine score logic for ranking order consistency.
                      similarity_score: rec.similarity_score,
                      live_similarity_score: liveMatch ? liveMatch.similarity_score : rec.similarity_score,
                      tempo_match: liveMatch ? liveMatch.tempo_match : rec.tempo_match,
                      energy_match: liveMatch ? liveMatch.energy_match : rec.energy_match,
                      mood_match: liveMatch ? liveMatch.mood_match : rec.mood_match,
                      danceability_match: liveMatch ? liveMatch.danceability_match : (rec.danceability_match || rec.dance_match)
                    };
                  })
                  // Performs an initial static sort based purely on backend API cosine similarity.
                  .sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0))
                  // Truncates the list to display only the top 5 highest confidence matches.
                  .slice(0, 5)
                  // Performs a secondary sort reflecting real-time playback modulation variance.
                  .sort((a, b) => (b.live_similarity_score ?? b.similarity_score ?? 0) - (a.live_similarity_score ?? a.similarity_score ?? 0))
                  .map((rec, idx) => {
                  
                  // Formats final display strings to guard against undefined interface exceptions.
                  const recTitle = rec.trackName || rec.albumTitle || rec.collectionName || `Track ${rec.product_id || rec.id || idx + 1}`;
                  const recArtist = rec.artistName || 'Unknown Artist';
                  const scoreForDisplay = rec.live_similarity_score ?? rec.similarity_score ?? 0;
                  
                  // Returns the individual recommended track component card rendering loop.
                  return (
                  <div 
                    key={String(rec.product_id || rec.id || rec.trackId || `${recTitle}-${idx}`)}
                    onClick={() => handleRecommendationClick(rec)}
                    className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                        
                      {/* Sub-container restricting image bounds for fallback compatibility testing */}
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        <img 
                          src={getSafeCoverUrl(rec, '200x200')}
                          alt={recTitle}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = fallbackImage; }}
                        />
                      </div>

                      {/* Flex wrapper for the core track text elements */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors text-sm leading-tight flex-1">
                            {recTitle}
                          </h4>
                          {/* Top-level cumulative correlation score styled based on confidence percentiles */}
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold text-white flex-shrink-0 ${
                            scoreForDisplay >= 0.7 ? 'bg-green-500' : 
                            scoreForDisplay >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(scoreForDisplay * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 truncate font-medium">{recArtist}</p>
                        <p className="text-xs text-gray-400 truncate">{rec.reason || rec.match_reason}</p>
                        
                        {/* Audio Feature Diagnostic Badge Array - Quantifies individual metric congruences */}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {/* Specific Tempo metric readout bound to dynamic green/yellow/red styling */}
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Tempo:{Math.round(rec.tempo_match * 100)}%
                          </span>
                          
                          {/* Specific Energy metric readout bound to dynamic styling */}
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Energy:{Math.round(rec.energy_match * 100)}%
                          </span>
                          
                          {/* Specific Valence (Mood) metric readout bound to dynamic styling */}
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            rec.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Mood:{Math.round(rec.mood_match * 100)}%
                          </span>
                          
                          {/* Specific Danceability metric readout bound to dynamic styling */}
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

          {/* Standby Empty State Render - Activated strictly when API calls resolve but no associative connections cross similarity thresholds */}
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
