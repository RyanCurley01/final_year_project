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
      <div className="flex flex-col items-center w-full">
        {/* All products in one flex container */}
        <div className="flex flex-wrap gap-4 justify-center" style={{ maxWidth: '1264px', width: '100%' }}>
          {otherProducts.map((product, i) => (
            <SongCard
              key={product.id}
              product={product}
              i={i}
            />
          ))}
          
          {/* Force line break before Selected Electronic Works */}
          {selectedElectronic && (
            <>
              <div className="w-full h-0"></div>
              <SongCard
                key={selectedElectronic.id}
                product={selectedElectronic}
                i={products.length - 1}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerScreen;
