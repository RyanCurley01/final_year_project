import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { productService, accountService } from '../redux/services';
import SongCard from '../components/SongCard';
import Loader from '../components/Loader';
import Error from '../components/Error';
import { setActiveSong, playPause } from '../redux/features/playerSlice';



const CustomerScreen = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);

  /*
  * Change this store these login detail in local storage 
  * after the login screen is implemented
  */ 
  const email = 'john.smith@store.com';
  const password = 'password';

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch user account details
        const userData = await accountService.login(email, password);
        setUser(userData);
        
        // Fetch products
        const productData = await productService.getAllProducts(email, password);
        setProducts(productData);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <Loader title="Loading products..." />;
  if (error) return <Error />;


  const games = products.filter(product => product.gameTitle);
  const music = products.filter(product => product.albumTitle);

  return (
    <div className="flex flex-col">
      <div className="mb-4 sm:mb-8">
        <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Music Information and Multimedia Store</h1>
      </div>

      <div className="mb-4 sm:mb-6">
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Welcome, {user?.firstName || 'Customer'}!</h2>
        <p className="text-gray-400 text-sm sm:text-base">Explore our collection of games and electronic music</p>
      </div>

      {/* Games Section */}
      <div className="mb-6 sm:mb-8">
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Games</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {games.map((product, i) => (
            <SongCard
              key={product.id || `game-${i}`}
              product={product}
              data={games}
              i={i}
              user={user}
              email={email}
              password={password}
            />
          ))}
        </div>
      </div>

      {/* Music Section */}
      <div>
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Music</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {music.map((product, i) => (
            <SongCard
              key={product.id || `music-${i}`}
              product={product}
              data={music}
              i={i}
              user={user}
              email={email}
              password={password}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomerScreen;
