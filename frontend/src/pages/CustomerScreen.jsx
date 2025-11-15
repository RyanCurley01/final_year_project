import { useState, useEffect } from 'react';
import { productService } from '../services';
import SongCard from '../components/SongCard';
import Loader from '../components/Loader';
import Error from '../components/Error';



const CustomerScreen = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Your auth credentials - in production, get these from login/auth context
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

  return (
    <div className="flex flex-col">
      <h2 className="font-bold text-3xl text-white text-left mt-4 mb-10">
        All Products
      </h2>
      <div className="flex flex-wrap sm:justify-start justify-center gap-8">
        {products.map((product, i) => (
          <SongCard
            key={product.productId || `product-${i}`}
            product={product}
            i={i}
          />
        ))}
      </div>
    </div>
  );
};

export default CustomerScreen;
