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

  // Separate Selected Electronic Works from other products
  const selectedElectronic = products.find(p => p.albumTitle === "Selected Electronic Works");
  const otherProducts = products.filter(p => p.albumTitle !== "Selected Electronic Works");

  return (
    <div className="w-full min-h-screen p-4">
      {/* First row - all products except Selected Electronic Works */}
      <div className="flex flex-wrap gap-4 w-full mb-4">
        {otherProducts.map((product, i) => (
          <SongCard
            key={product.id}
            product={product}
            i={i}
          />
        ))}
      </div>
      
      {/* Second row - Selected Electronic Works */}
      {selectedElectronic && (
        <div className="flex flex-wrap gap-4 w-fullpx">
          <SongCard
            key={selectedElectronic.id}
            product={selectedElectronic}
            i={products.length - 1}
          />
        </div>
      )}
    </div>
  );
};

export default CustomerScreen;
