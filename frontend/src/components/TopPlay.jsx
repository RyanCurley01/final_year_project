import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode } from 'swiper/modules';

import PlayPause from './PlayPause';  
import { playPause, setActiveSong } from '../redux/features/playerSlice';
import { productService } from '../redux/services';
import { useGetTopSongsQuery } from '../redux/services/youtubeApi';

import Loader from './Loader';
import Error from './Error';

import 'swiper/css';
import 'swiper/css/free-mode';

const TopChartCard = ({ song, i, isPlaying, activeSong, handlePauseClick, handlePlayClick }) => (
  <div className="w-full flex flex-row items-center 
  hover:bg-[#4c426e] py-2 p-4 rounded-lg cursor-pointer mb-2">
    <h3 className="font-bold text-base text-white mr-3">{i + 1}.</h3>
    <div className="flex-1 flex flex-row justify-between items-center">
      <img
        src={song?.albumCoverImageUrl || song?.images?.coverart}
        alt={song?.albumTitle || song?.title}
        className="w-20 h-20 rounded-lg"
      />
      <div className="flex-1 flex flex-col justify-center mx-3">
        <p className="text-xl font-bold text-white">
          {song.albumTitle || song.title}
        </p>
      </div>
    </div>
    {song.fileUrl && (
      <PlayPause
        isPlaying={isPlaying && activeSong?.albumTitle === song.albumTitle}
        activeSong={activeSong}
        handlePause={handlePauseClick}
        handlePlay={() => handlePlayClick(song, i)}
        song={song}
      />
    )}
  </div>
)

const TopPlay = () => {
  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);
  const [matchedSongs, setMatchedSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const divRef = useRef(null);

  // Fetch's my top songs from YouTube
  const { data: youtubeData, isFetching: youtubeFetching, error: youtubeError } = useGetTopSongsQuery();

  /*
  * Change this store these login detail in local storage 
  * after the login screen is implemented
  */ 
  const email = 'john.smith@store.com';
  const password = 'password';

  useEffect(() => {
    const matchSongsWithDatabase = async () => {
      if (!youtubeData) return;

      try {
        setLoading(true);
        
        // Extract the actual data array from YouTube API response
        // The API returns { data: [...] } or { error: "...", fallback_data: [...] }
        const ytSongs = youtubeData.data || youtubeData.fallback_data || [];
        
        if (!Array.isArray(ytSongs)) {
          console.error('YouTube data is not an array:', youtubeData);
          setError(new Error('Invalid YouTube data format'));
          setLoading(false);
          return;
        }
        
        // Fetch all products from database
        const products = await productService.getAllProducts(email, password);
        
        // Filter for songs with fileUrl
        const songProducts = products.filter(product => 
          product.albumTitle && 
          product.fileUrl && 
          product.albumTitle !== 'Selected Electronic Works'
        );

        // Match YouTube songs with database songs by title
        const matched = ytSongs.slice(0, 5).map(ytSong => {
         
          // Normalize function to handle different apostrophe characters
          const normalizeTitle = (title) => {
            if (!title) return '';
            // Replace smart quotes (U+2019) and other apostrophe variants with standard apostrophe
            return title.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
          };

          // Try to find matching song in database by comparing normalized titles
          const normalizedYtTitle = normalizeTitle(ytSong.title);
          const dbSong = songProducts.find(product => 
            normalizeTitle(product.albumTitle) === normalizedYtTitle
          );

          // If match found, return database song with YouTube ranking
          // If not found, return YouTube song without playback capability
          return dbSong || { ...ytSong, albumTitle: ytSong.title };
        });

        setMatchedSongs(matched);
        setError(null);
      } catch (err) {
        setError(err);
        console.error('Error matching songs:', err);
      } finally {
        setLoading(false);
      }
    };

    matchSongsWithDatabase();
  }, [youtubeData]);

  if (youtubeFetching || loading) return <Loader title="Loading top songs..." />;
  if (error || youtubeError) return <Error />;

  const topPlays = matchedSongs;
  
  const handlePauseClick = () => {
    dispatch(playPause(false));
  };

  const handlePlayClick = (song, i) => {
    // Only play if the song has a fileUrl (matched with database)
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: matchedSongs, i }));
      dispatch(playPause(true));
    }
  };

  return (
    <div ref={divRef} className="xl:ml-6 mr-30 xl:mb-0 mb-6 
    flex-1 xl:max-w-[500px] max-w-full flex flex-col">
      <div className="w-full flex flex-col">
        <div className="flex flex-row justify-between items-center">
          <h2 className="text-white font-bold text-2xl ml-5">Popular Songs</h2>
          {/* <Link to="/top-charts">
            <p className="text-gray-300 text-base cursor-pointer">See More</p>
          </Link> */}
        </div>

        <div className="mt-4 flex flex-col gap-1">
          {topPlays?.map((song, i) => (
            <TopChartCard 
              key={song.productId || song.id || `song-${i}`}
              song={song}
              i={i}
              isPlaying={isPlaying}
              activeSong={activeSong}
              handlePauseClick={handlePauseClick}
              handlePlayClick={handlePlayClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
};

export default TopPlay;
