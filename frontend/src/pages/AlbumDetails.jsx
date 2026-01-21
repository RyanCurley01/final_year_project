import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';
import Loader from '../components/Loader';
import { setActiveSong, playPause } from '../redux/features/playerSlice';

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

// Hash function for consistent similarity computation
const hashCode = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

// Compute similarity between two songs based on hash features
const computeSimilarity = (song1, song2) => {
  if (!song1 || !song2) return 0;
  
  // Generate pseudo features based on song characteristics
  const hash1 = hashCode(song1.trackName + song1.artistName);
  const hash2 = hashCode(song2.trackName + song2.artistName);
  
  // Same artist bonus
  const artistMatch = song1.artistName?.toLowerCase() === song2.artistName?.toLowerCase() ? 0.2 : 0;
  
  // Same album bonus
  const albumMatch = song1.collectionName?.toLowerCase() === song2.collectionName?.toLowerCase() ? 0.15 : 0;
  
  // Hash-based similarity (normalized)
  const hashDiff = Math.abs(hash1 - hash2) / Math.max(hash1, hash2, 1);
  const hashSimilarity = Math.max(0, 1 - hashDiff) * 0.3;
  
  // Base similarity + bonuses
  const baseSimilarity = 0.35 + ((hash1 ^ hash2) % 30) / 100;
  
  return Math.min(0.99, baseSimilarity + artistMatch + albumMatch + hashSimilarity);
};

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const AlbumSongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, referenceSong }) => {
  const isThisSongActive = activeSong?.id === song.id;
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  const [isHovered, setIsHovered] = useState(false);

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
              <FaPauseCircle size={45} className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform" />
            ) : (
              <FaPlayCircle size={45} className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform" />
            )}
          </div>
        )}

        <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg max-w-[calc(100%-5rem)] truncate`}>
          {song.artistName}
        </div>

        {/* Rank number (based on similarity order) */}
        <div className="absolute top-2 right-2 w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg border-2 border-white/30">
          {index + 1}
        </div>

        {/* Similarity badge */}
        {song.similarity && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-green-500/90 rounded-full text-[12px] font-bold text-white shadow-lg">
            {(song.similarity * 100).toFixed(0)}% match
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
        <p className="font-semibold text-sm text-white truncate leading-tight">
          {song.trackName}
        </p>
        <p className="text-xs text-gray-400 truncate">{song.artistName}</p>
      </div>
    </div>
  );
};

const AlbumDetails = () => {
  const { albumName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);
  
  const [loading, setLoading] = useState(true);
  const [albumSongs, setAlbumSongs] = useState([]);
  const [error, setError] = useState(null);
  
  // Get the reference song from navigation state
  const referenceSong = location.state?.song;
  const albumArtwork = location.state?.albumArtwork;

  useEffect(() => {
    const fetchAlbumSongs = async () => {
      if (!albumName) {
        setError('No album specified');
        setLoading(false);
        return;
      }

      try {
        // Decode the album name from URL
        const decodedAlbumName = decodeURIComponent(albumName);
        
        // Search iTunes for songs from this album
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(decodedAlbumName)}&entity=song&limit=50`;
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          // Get the artist name from the reference song or from first result with matching album
          const referenceArtist = referenceSong?.artistName?.toLowerCase();
          
          // Filter songs that match BOTH album name AND artist name
          const matchingAlbumSongs = data.results.filter(song => {
            const albumMatches = song.collectionName?.toLowerCase().includes(decodedAlbumName.toLowerCase()) ||
              decodedAlbumName.toLowerCase().includes(song.collectionName?.toLowerCase());
            
            // If we have a reference artist, also filter by artist
            if (referenceArtist) {
              const artistMatches = song.artistName?.toLowerCase().includes(referenceArtist) ||
                referenceArtist.includes(song.artistName?.toLowerCase());
              return albumMatches && artistMatches;
            }
            return albumMatches;
          });
          
          // If no exact matches, try to find songs from the same artist at least
          let songsToUse = matchingAlbumSongs;
          if (matchingAlbumSongs.length === 0 && referenceArtist) {
            songsToUse = data.results.filter(song => 
              song.artistName?.toLowerCase().includes(referenceArtist) ||
              referenceArtist.includes(song.artistName?.toLowerCase())
            );
          }
          // If still no matches, use all results as fallback
          if (songsToUse.length === 0) {
            songsToUse = data.results;
          }
          
          // Add similarity scores relative to reference song and map previewUrl to fileUrl for player
          const songsWithSimilarity = songsToUse.map(song => ({
            ...song,
            id: song.trackId,
            fileUrl: song.previewUrl, // Map iTunes previewUrl to fileUrl for MusicPlayer
            albumTitle: song.trackName, // Add albumTitle for player display
            similarity: referenceSong ? computeSimilarity(song, referenceSong) : (0.5 + Math.random() * 0.4)
          }));
          
          // Always sort by similarity (highest first)
          songsWithSimilarity.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
          
          setAlbumSongs(songsWithSimilarity);
        } else {
          setError('No songs found for this album');
        }
      } catch (err) {
        console.error('Error fetching album songs:', err);
        setError('Failed to load album songs');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbumSongs();
  }, [albumName, referenceSong]);

  const handlePlay = (song, index) => {
    if (song.fileUrl || song.previewUrl) {
      // Ensure fileUrl is set
      const songToPlay = {
        ...song,
        fileUrl: song.fileUrl || song.previewUrl
      };
      dispatch(setActiveSong({ song: songToPlay, data: albumSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  const handlePause = () => {
    dispatch(playPause(false));
  };

  if (loading) return <Loader title="Loading album songs..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-red-400 text-lg mb-4">{error}</p>
        <button 
          onClick={() => navigate(-1)} 
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
        >
          Go Back
        </button>
      </div>
    );
  }

  const decodedAlbumName = decodeURIComponent(albumName || '');
  const firstSong = albumSongs[0];
  const displayArtwork = albumArtwork || firstSong?.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-4 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
        >
          ← Back
        </button>
        
        {/* Album Header with artwork - stacked and responsive */}
        <div className="flex flex-col items-center text-center gap-6 w-full">
          <div className="w-full max-w-md aspect-square rounded-lg overflow-hidden shadow-2xl">
            <img 
              src={displayArtwork} 
              alt={decodedAlbumName}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = fallbackImage; }}
            />
          </div>
          <div className="flex flex-col items-center w-full">
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">Album</p>
            <h1 className="font-bold text-3xl md:text-4xl text-white mb-2">{decodedAlbumName}</h1>
            <p className="text-gray-400 text-lg">{firstSong?.artistName}</p>
            <p className="text-gray-500 text-sm mt-2">{albumSongs.length} songs</p>
            
            {referenceSong && (
              <div className="mt-4 p-4 bg-cyan-500/20 rounded-lg border border-cyan-500/30 w-full max-w-md">
                <p className="text-sm text-cyan-400 mb-2">Comparing similarity to:</p>
                <p className="text-white font-medium text-lg">{referenceSong.trackName}</p>
                <p className="text-gray-400">{referenceSong.artistName}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Songs Grid */}
      <div className="mb-6">
        <h2 className="font-bold text-xl text-white mb-4">
          {referenceSong ? 'Songs by Similarity' : 'Album Tracks'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {albumSongs.map((song, index) => (
            <AlbumSongCard
              key={song.id || index}
              song={song}
              isPlaying={isPlaying}
              activeSong={activeSong}
              onPlay={handlePlay}
              onPause={handlePause}
              index={index}
              referenceSong={referenceSong}
            />
          ))}
        </div>
      </div>

      {/* Back button at bottom */}
      <div className="flex justify-center mt-6 mb-24 pb-8">
        <button 
          onClick={() => navigate(-1)} 
          className="px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-all font-semibold"
        >
          ← Back to Music
        </button>
      </div>
    </div>
  );
};

export default AlbumDetails;
