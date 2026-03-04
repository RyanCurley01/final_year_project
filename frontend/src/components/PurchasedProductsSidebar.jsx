import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { purchasedProductsService } from "../redux/services/purchasedProductsService";
import { productService } from "../redux/services/productService";
import { FaShoppingBag } from "react-icons/fa";
import OnsetImageCard from './OnsetImageCard';
import SidebarSearchFilter from './SidebarSearchFilter';

const PurchasedProductsSidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const isManager = currentUser?.accountType === "Manager";
  const isEmployee = currentUser?.accountType === "Employee";
  const hasBasicAuth =
    !!(currentUser?.email || currentUser?.accountEmailAddress) &&
    !!currentUser?.password;

  // Employees and Managers can view
  const canView = (isManager || isEmployee) && hasBasicAuth;

  useEffect(() => {
    if (isOpen && canView) {
      setIsLoading(true);
      setError(null);
      const email = currentUser?.email || currentUser?.accountEmailAddress;

      // Timeout to prevent infinite loading if service is down
      const timeout = setTimeout(() => {
        setError(new Error('Request timed out — purchased-products service may be unavailable.'));
        setIsLoading(false);
      }, 12000);

      purchasedProductsService
        .getAllPurchasedProducts(email, currentUser?.password)
        .then(async (res) => {
          clearTimeout(timeout);
          setData(res);

          // Enrich with product names
          const uniqueProductIds = [...new Set(res.map((r) => r.productId))];
          const map = {};
          await Promise.all(
            uniqueProductIds.map(async (pid) => {
              try {
                const product = await productService.getProductById(pid);
                map[pid] = product;
              } catch {
                map[pid] = null;
              }
            })
          );
          setProductMap(map);
          setIsLoading(false);
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error("Failed to load purchased products:", err);
          setError(err);
          setIsLoading(false);
        });

      return () => clearTimeout(timeout);
    }
  }, [isOpen, canView, currentUser]);

  if (!canView) return null;

  return (
    <div className="my-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-row justify-start items-center text-sm font-medium text-[#1E90FF] hover:text-[#00BFFF]"
      >
        <FaShoppingBag className="w-6 h-6 mr-2" />
        <span className="whitespace-nowrap underline hover:no-underline">
          Purchased Products
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-70 flex justify-center items-center p-4">
          <div className="bg-[#2a2a2a] p-6 rounded-lg max-w-6xl w-full max-h-[80vh] overflow-hidden flex flex-col relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-white text-xl hover:text-red-400"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold text-white mb-4">
              Purchased Products
            </h2>

            <div className="overflow-auto bg-[#1a1a1a] p-2 rounded w-full">
              {isLoading && (
                <p className="text-gray-300">Loading purchased products...</p>
              )}
              {error && (
                <p className="text-red-400">Error loading purchased products.</p>
              )}

              {!isLoading && !error && data && data.length > 0 && (
                <SidebarSearchFilter
                  data={data}
                  getSearchableText={(item) => productMap[item.productId]?.albumTitle || ''}
                  placeholder="Filter by song name…"
                >
                  {(filteredData) => (
                <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
                  <thead className="text-xs uppercase bg-[#333] text-gray-300">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Product Name</th>
                      <th className="px-4 py-2">Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item, i) => {
                      const product = productMap[item.productId];
                      return (
                        <tr
                          key={i}
                          className="border-b border-gray-700 hover:bg-gray-800"
                        >
                          <td className="px-4 py-2">
                            {i + 1}
                          </td>
                          <td className="px-4 py-2">
                            {product?.albumTitle || "—"}
                          </td>
                          <td className="px-4 py-2">
                            {product?.albumCoverImageUrl ? (
                              (() => {
                                const coverUrl = product.albumCoverImageUrl;
                                const isVideo = coverUrl && coverUrl.toLowerCase().includes('.mp4');
                                const isTeddyEmotion = product.albumTitle?.toLowerCase().includes('teddy emotion');
                                const useOnsetImages = isVideo && !isTeddyEmotion;

                                if (useOnsetImages) {
                                  return (
                                    <div className="w-10 h-10">
                                      <OnsetImageCard
                                        songTitle={product.albumTitle}
                                        songId={item.productId}
                                        className="w-full h-full rounded object-cover"
                                        isPlaying={false}
                                        isActive={false}
                                      />
                                    </div>
                                  );
                                }
                                return (
                                  <img
                                    src={isVideo ? '/cloud-cover.webp' : coverUrl}
                                    alt={product.albumTitle}
                                    className="w-10 h-10 rounded object-cover"
                                    onError={(e) => { e.target.onerror = null; e.target.src = '/cloud-cover.webp'; }}
                                  />
                                );
                              })()
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                  )}
                </SidebarSearchFilter>
              )}

              {!isLoading && !error && data?.length === 0 && (
                <p className="text-gray-400">No purchased products found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasedProductsSidebar;
