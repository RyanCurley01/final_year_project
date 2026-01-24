import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaPauseCircle, FaPlayCircle } from 'react-icons/fa';
import Loader from '../components/Loader';
import { setActiveSong, playPause } from '../redux/features/playerSlice';

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const AlbumSongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index }) => {
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

        <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg max-w-[calc(100%-1rem)] truncate`}>
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
  
  // Get the album artwork and artist name from navigation state
  const albumArtwork = location.state?.albumArtwork;
  const artistName = location.state?.artistName;

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
        
        // Search iTunes for songs from this album - include artist name if available for better results
        const searchTerm = artistName 
          ? `${artistName} ${decodedAlbumName}`
          : decodedAlbumName;
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=50`;
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          // First, find songs that match the album name
          const albumMatchingSongs = data.results.filter(song => {
            const albumMatches = song.collectionName?.toLowerCase().includes(decodedAlbumName.toLowerCase()) ||
              decodedAlbumName.toLowerCase().includes(song.collectionName?.toLowerCase());
            return albumMatches;
          });
          
          // Get artist from state OR from the first album-matching song
          const targetArtist = artistName || albumMatchingSongs[0]?.artistName;
          
          // Now STRICTLY filter to only show songs from that one artist
          const finalSongs = albumMatchingSongs.filter(song => {
            if (!targetArtist) return true;
            const targetLower = targetArtist.toLowerCase();
            const songArtistLower = song.artistName?.toLowerCase() || '';
            return songArtistLower === targetLower; // EXACT match only
          });
          
          let songsToUse = finalSongs.length > 0 ? finalSongs : albumMatchingSongs.slice(0, 1);
          
          if (songsToUse.length === 0) {
            setError(`No songs found for "${decodedAlbumName}"${artistName ? ` by ${artistName}` : ''}`);
            setLoading(false);
            return;
          }
          
          // Map songs for player compatibility
          const mappedSongs = songsToUse.map(song => ({
            ...song,
            id: song.trackId,
            fileUrl: song.previewUrl,
            albumTitle: song.trackName
          }));
          
          setAlbumSongs(mappedSongs);
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
  }, [albumName, artistName]);

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
          </div>
        </div>
      </div>

      {/* Songs Grid */}
      <div className="mb-6">
        <h2 className="font-bold text-xl text-white mb-4">Album Tracks</h2>
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
          ← Back
        </button>
      </div>
    </div>
  );
};

export default AlbumDetails;
