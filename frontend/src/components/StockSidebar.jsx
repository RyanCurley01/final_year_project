import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { stockService } from "../redux/services/stockService";
import { productService } from "../redux/services/productService";
import { FaWarehouse } from "react-icons/fa";
import OnsetImageCard from './OnsetImageCard';
import SidebarSearchFilter from './SidebarSearchFilter';

const StockSidebar = () => {
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
        setError(new Error('Request timed out — stock service may be unavailable.'));
        setIsLoading(false);
      }, 12000);

      stockService
        .getAllStock(email, currentUser?.password)
        .then(async (res) => {
          clearTimeout(timeout);

          // Merge duplicate rows by productId.
          // Some datasets contain historical duplicate records; if any row is available,
          // show the product as available to avoid false "Unavailable" states.
          const mergedByProduct = new Map();
          (res || []).forEach((item) => {
            const key = item?.productId;
            if (key === null || key === undefined) return;

            const current = mergedByProduct.get(key);
            if (!current) {
              mergedByProduct.set(key, item);
              return;
            }

            const currentAvail = current.isAvailable !== undefined ? current.isAvailable : current.available;
            const itemAvail = item.isAvailable !== undefined ? item.isAvailable : item.available;

            // Keep newest-ish row by larger id (when present), and OR availability.
            const currentId = Number(current.id ?? current.stockId ?? current.StockID ?? 0);
            const itemId = Number(item.id ?? item.stockId ?? item.StockID ?? 0);
            const preferred = itemId >= currentId ? item : current;

            mergedByProduct.set(key, {
              ...preferred,
              isAvailable: Boolean(currentAvail) || Boolean(itemAvail),
            });
          });

          const merged = Array.from(mergedByProduct.values());
          setData(merged);

          // Enrich with product names
          const uniqueProductIds = [...new Set(merged.map((r) => r.productId))];
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
          console.error("Failed to load stock:", err);
          setError(err);
          setIsLoading(false);
        });

      return () => clearTimeout(timeout);
    }
  }, [isOpen, canView, currentUser]);

  if (!canView) return null;

  // Determine stock status badge (binary: available or unavailable)
  const getStockBadge = (available) => {
    if (available === null || available === undefined) return null;
    if (!available) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">
          Unavailable
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">
        Available
      </span>
    );
  };

  return (
    <div className="my-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-row justify-start items-center text-sm font-medium text-[#1E90FF] hover:text-[#00BFFF]"
      >
        <FaWarehouse className="w-6 h-6 mr-2" />
        <span className="whitespace-nowrap underline hover:no-underline">
          Stock
        </span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-70 flex justify-center items-center p-4">
          <div className="bg-[#2a2a2a] p-6 rounded-lg max-w-6xl w-full max-h-[80vh] overflow-hidden flex flex-col relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-white text-xl hover:text-red-400"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold text-white mb-2">
              Stock Availability
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Library songs are available for purchase or unavailable (removed by store) or
              artist songs are available or unavailable (delisted, license expired, removed by artist).
            </p>

            <div className="overflow-auto bg-[#1a1a1a] p-2 rounded w-full">
              {isLoading && (
                <p className="text-gray-300">Loading stock data...</p>
              )}
              {error && (
                <p className="text-red-400">
                  Error loading stock data: {error?.message || 'Unknown error'}
                </p>
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
                      <th className="px-4 py-2">Status</th>
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
                          <td className="px-4 py-2">
                            {getStockBadge(item.isAvailable !== undefined ? item.isAvailable : item.available)}
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
                <p className="text-gray-400">No stock data found.</p>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default StockSidebar;
