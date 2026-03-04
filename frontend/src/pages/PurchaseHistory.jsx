import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { FaReceipt, FaCalendar, FaDollarSign, FaDownload } from 'react-icons/fa';
import placeholders from '../utils/placeholderImage';
import { downloadFile, generateFilename } from '../utils/downloadHelper';
import { useAuth } from '../context/AuthContext';
import OnsetImageCard from '../components/OnsetImageCard';
import { orderService } from '../redux/services/orderService';
import { orderItemService } from '../redux/services/orderItemService';
import { productService } from '../redux/services/productService';
import { setPurchases, setLoading, setError } from '../redux/features/purchaseSlice';

const PurchaseHistory = () => {
  const { purchases, loading, error } = useSelector((state) => state.purchase);
  const { currentUser } = useAuth();
  const dispatch = useDispatch();
  const lastFetchedId = useRef(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      // Debug: log what currentUser looks like
      console.log("PurchaseHistory: currentUser =", JSON.stringify(currentUser, null, 2));
      console.log("PurchaseHistory: currentUser?.id =", currentUser?.id);
      console.log("PurchaseHistory: localStorage currentUser =", localStorage.getItem('currentUser'));
      
      // Only fetch if we have a logged-in user with a valid Database ID
      const accountId = currentUser?.id;
      if (accountId && accountId !== lastFetchedId.current) {
        lastFetchedId.current = accountId;
        try {
          dispatch(setLoading(true));
          dispatch(setError(null));
          console.log("Fetching order history for Account ID:", accountId);
          console.log("Orders API URL:", `orders/account/${accountId}`);
          
          // 1. Fetch orders from backend
          // Note: We do NOT pass email/password here because these services have their own auth
          // and the endpoints are configured as permitAll() for customers.
          // Passing credentials for a user that doesn't exist in the microservice DB triggers a 401.
          const orders = await orderService.getOrdersByAccountId(accountId);
          console.log("Orders fetched:", orders?.length || 0, orders);
          
          if (!orders || orders.length === 0) {
            dispatch(setPurchases([]));
            return;
          }

          // 2. Enrich orders with items and product details
          // We need this because the raw Order object doesn't have items or product info
          const enrichedPurchases = await Promise.all(orders.map(async (order) => {
            try {
              // Fetch items for this order
              const orderItems = await orderItemService.getOrderItemsByOrderId(order.id);
              
              // Fetch product details for each item
              const itemsWithDetails = await Promise.all(orderItems.map(async (item) => {
                try {
                  const product = await productService.getProductById(item.productId);
                  return {
                    ...item,
                    albumTitle: product.albumTitle || 'Unknown Product',
                    albumPrice: item.unitPrice, 
                    albumCoverImageUrl: product.albumCoverImageUrl,
                    fileUrl: product.fileUrl,
                    quantity: item.quantity
                  };
                } catch (productErr) {
                  console.error(`Failed to fetch product details for ${item.productId}:`, productErr);
                  return {
                    ...item,
                    albumTitle: 'Product Unavailable',
                    albumPrice: item.unitPrice,
                    quantity: item.quantity
                  };
                }
              }));

              return {
                id: order.id,
                purchaseDate: order.orderDate,
                totalAmount: order.totalAmount,
                status: 'completed', // Default status if not provided by backend
                items: itemsWithDetails
              };
            } catch (err) {
              console.error(`Failed to fetch details for order ${order.id}:`, err);
              // Return partial order info if items fail
              return {
                id: order.id,
                purchaseDate: order.orderDate,
                totalAmount: order.totalAmount,
                status: 'Error loading details',
                items: []
              };
            }
          }));
          
          // Sort by date descending
          enrichedPurchases.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
          
          dispatch(setPurchases(enrichedPurchases));
        } catch (error) {
          console.error("Failed to fetch purchase history:", error);
          dispatch(setError(error.message || 'Failed to load purchase history'));
          lastFetchedId.current = null; // Allow retry on next render
        } finally {
          setFetched(true);
          dispatch(setLoading(false));
        }
      } else if (!accountId) {
        // No logged-in user — mark as fetched so we show empty state
        setFetched(true);
      }
    };

    fetchHistory();
  }, [currentUser?.id, dispatch]);

  const handleDownload = (item) => {
    if (item.fileUrl) {
      try {
        downloadFile(item.fileUrl, generateFilename(item, item.fileUrl));
      } catch (error) {
        alert("Failed to download file. Please try again.");
      }
    }
  };

  if (loading || (!fetched && currentUser?.id)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-400">Loading purchase history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <FaReceipt className="text-red-400 text-6xl mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">Failed to load purchases</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => { lastFetchedId.current = null; window.location.reload(); }}
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <FaReceipt className="text-gray-400 text-6xl mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">No purchases yet</h2>
        <p className="text-gray-400 mb-6">Your purchase history will appear here</p>
        <Link 
          to="/"
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-white text-3xl font-bold mb-6">Purchase History</h2>
      
      <div className="space-y-6">
        {purchases.map((purchase) => (
          <div key={purchase.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-6">
            {/* Purchase Header */}
            <div className="flex flex-wrap justify-between items-start mb-4 pb-4 border-b border-gray-600">
              <div>
                <h3 className="text-white font-semibold text-lg mb-2">
                  Order #{String(purchase.id).replace('purchase-', '').padStart(3, '0')}
                </h3>
                <div className="flex flex-wrap gap-4 text-gray-400 text-sm">
                  <div className="flex items-center gap-2">
                    <FaCalendar />
                    <span>{new Date(purchase.purchaseDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaDollarSign />
                    <span className="text-white font-semibold">
                      ${purchase.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                purchase.status === 'completed' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {purchase.status}
              </span>
            </div>

            {/* Purchase Items */}
            <div className="space-y-3">
              <h4 className="text-white font-semibold mb-2">Items:</h4>
              {purchase.items.map((item, index) => {
                const productName = item.albumTitle;
                const price = item.albumPrice;
                const coverMedia = item.albumCoverImageUrl;
                const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                const isTeddyEmotion = productName && productName.toLowerCase().includes('teddy emotion');
                const useOnsetImages = isVideo && !isTeddyEmotion;

                return (
                  <div key={index} className="flex gap-3 bg-white/5 rounded-lg p-3 items-center">
                    {useOnsetImages ? (
                      <div className="w-16 h-16 flex-shrink-0">
                        <OnsetImageCard
                          songTitle={productName}
                          songId={item.productId}
                          className="w-full h-full rounded-lg object-cover"
                          isPlaying={false}
                          isActive={false}
                        />
                      </div>
                    ) : isVideo ? (
                      <video
                        src={coverMedia}
                        className="w-16 h-16 rounded-lg object-cover"
                        muted
                        loop
                        autoPlay
                        onError={(e) => {
                          const img = document.createElement('img');
                          img.src = placeholders.small;
                          img.alt = productName;
                          img.className = 'w-16 h-16 rounded-lg object-cover';
                          e.target.parentNode.replaceChild(img, e.target);
                        }}
                      />
                    ) : (
                      <img
                        src={coverMedia || placeholders.small}
                        alt={productName}
                        className="w-16 h-16 rounded-lg object-cover"
                        onError={(e) => {
                          if (e.target.src !== placeholders.small) {
                            e.target.src = placeholders.small;
                          }
                        }}
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-white font-semibold">{productName}</p>
                      <p className="text-gray-400 text-sm">
                        Quantity: {item.quantity} × ${price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-white font-semibold mr-4">
                      ${(price * item.quantity).toFixed(2)}
                    </div>
                    {item.fileUrl && (
                      <button
                        onClick={() => handleDownload(item)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        title="Download file"
                      >
                        <FaDownload />
                        Download
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Payment ID */}
            {purchase.paymentId && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <p className="text-gray-400 text-sm">
                  Transaction Ref: <span className="text-gray-300">{purchase.paymentId}</span>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PurchaseHistory;
