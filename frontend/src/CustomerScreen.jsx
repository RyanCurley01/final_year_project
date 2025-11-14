import { useState, useEffect } from 'react';
import { productService } from './services';
import SongCard from './components/SongCard';

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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-xl text-white">Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-xl text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen p-4">
      <div className="flex flex-row gap-4 overflow-x-auto w-full pb-4">
        {products.map((product, i) => (
          <div key={product.id} className="flex-shrink-0">
            <SongCard
              product={product}
              i={i}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomerScreen;
