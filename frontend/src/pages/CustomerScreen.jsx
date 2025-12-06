import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { productService } from '../redux/services';
import SongCard from '../components/SongCard';
import Loader from '../components/Loader';
import Error from '../components/Error';



const CustomerScreen = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);

  /*
  * Change this store these login detail in local storage 
  * after the login screen is implemented
  */ 
  const email = 'john.smith@store.com';
  const password = 'password';

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const data = await productService.getAllProducts(email, password);
        setProducts(data);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) return <Loader title="Loading products..." />;
  if (error) return <Error />;


  const games = products.filter(product => product.gameTitle);
  const music = products.filter(product => product.albumTitle);

  return (
    <div className="flex flex-col ">
      {/* Games Section */}
      <h2 className="font-bold text-3xl text-white">
        Games
      </h2>
      <div className="flex flex-wrap sm:justify-start justify-center gap-6 mb-12">
        {games.map((product, i) => (
          <SongCard
            key={product.productId || `game-${i}`}
            product={product}
            data={games}
            i={i}
          />
        ))}
      </div>

      {/* Music Section */}
      <h2 className="font-bold text-3xl text-white">
        Music
      </h2>
      <div className="flex flex-wrap sm:justify-start justify-center gap-6 mb-12">
        {music.map((product, i) => (
          <SongCard
            key={product.productId || `music-${i}`}
            product={product}
            data={music}
            i={i}
          />
        ))}
      </div>
    </div>
  );
};

export default CustomerScreen;
