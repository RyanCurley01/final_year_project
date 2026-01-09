import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Loader from '../components/Loader';
import PlayPause from '../components/PlayPause';
import { setActiveSong, playPause } from '../redux/features/playerSlice';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

// Fallback SVG for when images fail
const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index }) => {
  const isThisSongActive = activeSong?.id === song.id;
  
  // Get high-res album art (replace 100x100 with 600x600)
  const albumArt = song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  return (
    <div className="flex flex-col w-[250px] p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div className="relative w-full h-56 group">
        <img 
          src={albumArt} 
          alt={song.trackName} 
          className="w-full h-full rounded-lg object-cover"
          onError={(e) => { e.target.src = fallbackImage; }}
        />
        
        {song.previewUrl && (
          <div className={`absolute inset-0 rounded-lg flex justify-center items-center bg-black/50 ${isThisSongActive && isPlaying ? 'flex' : 'hidden group-hover:flex'}`}>
            <PlayPause 
              isPlaying={isPlaying && isThisSongActive} 
              activeSong={activeSong} 
              handlePause={onPause} 
              handlePlay={() => onPlay(song, index)} 
              song={song} 
            />
          </div>
        )}

        <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-xs font-bold text-white shadow-lg`}>
          {song.artistName}
        </div>

        {song.previewUrl && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded-full text-xs text-gray-300">
            30s preview
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

      <div className="mt-4 flex flex-col">
        <p className="font-semibold text-lg text-white truncate">{song.trackName || song.albumTitle}</p>
        <p className="text-sm text-gray-400 mt-1 truncate">{song.artistName}</p>
        <p className="text-xs text-gray-500 mt-1 truncate">{song.collectionName}</p>
      </div>
    </div>
  );
};

const SimilarSongs = () => {
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  
  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);

  useEffect(() => {
    const fetchArtistSongs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const allSongs = [];
        
        // Fetch songs from iTunes API for each artist
        for (const artist of ARTISTS) {
          const response = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=8`
          );
          
          if (!response.ok) throw new Error(`Failed to fetch ${artist}`);
          
          const data = await response.json();
          
          // Transform iTunes data to our format
          const artistSongs = data.results
            .filter(track => track.previewUrl) // Only include tracks with audio
            .map(track => ({
              id: track.trackId,
              trackName: track.trackName,
              albumTitle: track.trackName,
              artistName: track.artistName,
              collectionName: track.collectionName,
              artworkUrl100: track.artworkUrl100,
              previewUrl: track.previewUrl,
              fileUrl: track.previewUrl, // For the player
              price: track.trackPrice || 1.29
            }));
          
          allSongs.push(...artistSongs);
        }
        
        setSongs(allSongs);
      } catch (err) {
        console.error('Error fetching songs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchArtistSongs();
  }, []);

  // Filter songs by artist
  const filteredSongs = filter === 'all' 
    ? songs 
    : songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));

  const handlePlay = (song, index) => {
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  const handlePause = () => {
    dispatch(playPause(false));
  };

  if (loading) return <Loader title="Loading IDM artists from iTunes..." />;
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-red-400 text-lg mb-4">Error loading songs: {error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-8">
        <h1 className="font-bold text-3xl text-white mb-2">Similar Artists</h1>
        <p className="text-gray-400">Explore music from Aphex Twin, Boards of Canada & Squarepusher</p>
        <p className="text-xs text-cyan-400 mt-2">Powered by iTunes API - {songs.length} tracks with 30-second previews</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <button 
          onClick={() => setFilter('all')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          All Artists ({songs.length})
        </button>
        <button 
          onClick={() => setFilter('aphex')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'aphex' ? 'bg-purple-500 text-white' : 'bg-white/10 text-white hover:bg-purple-500/30'}`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          Aphex Twin ({songs.filter(s => s.artistName?.toLowerCase().includes('aphex')).length})
        </button>
        <button 
          onClick={() => setFilter('boards')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'boards' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white hover:bg-orange-500/30'}`}
        >
          <span className="w-2 h-2 rounded-full bg-orange-400"></span>
          Boards of Canada ({songs.filter(s => s.artistName?.toLowerCase().includes('boards')).length})
        </button>
        <button 
          onClick={() => setFilter('squarepusher')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'squarepusher' ? 'bg-cyan-500 text-white' : 'bg-white/10 text-white hover:bg-cyan-500/30'}`}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          Squarepusher ({songs.filter(s => s.artistName?.toLowerCase().includes('squarepusher')).length})
        </button>
      </div>

      {filteredSongs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No songs found for this artist</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {filteredSongs.map((song, i) => (
            <SongCard 
              key={song.id} 
              song={song} 
              isPlaying={isPlaying} 
              activeSong={activeSong} 
              onPlay={handlePlay} 
              onPause={handlePause} 
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SimilarSongs;
