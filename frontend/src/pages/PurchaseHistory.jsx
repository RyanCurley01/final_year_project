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

// Component responsible for displaying past user purchases and facilitating file downloads
const PurchaseHistory = () => {
  // Extract purchase history state (purchases array, loading status, errors) from Redux store
  const { purchases, loading, error } = useSelector((state) => state.purchase);
  
  // Retrieve the currently authenticated user's details from AuthContext
  const { currentUser } = useAuth();
  
  // Hook to dispatch Redux actions
  const dispatch = useDispatch();
  
  // Mutable ref used to keep track of the last account ID fetched to prevent duplicate API requests
  const lastFetchedId = useRef(null);
  
  // Local state to indicate if an initial fetch attempt has resolved (to hide loaders when empty)
  const [fetched, setFetched] = useState(false);

  // Lifecycle hook to trigger data fetching whenever the current user changes
  useEffect(() => {
    // Asynchronous function to gather orders, order items, and associated product metadata
    const fetchHistory = async () => {
      // Debug: log what currentUser looks like
      console.log("PurchaseHistory: currentUser =", JSON.stringify(currentUser, null, 2));
      console.log("PurchaseHistory: currentUser?.id =", currentUser?.id);
      console.log("PurchaseHistory: localStorage currentUser =", localStorage.getItem('currentUser'));
      
      // Determine the account ID from the currently logged-in user
      const accountId = currentUser?.id;
      
      // Only fetch if a user is logged in AND we haven't already fetched for this exact ID
      if (accountId && accountId !== lastFetchedId.current) {
        // Record this ID as currently fetched to prevent infinite loops
        lastFetchedId.current = accountId;
        try {
          // Dispatch action to indicate we are actively loading data
          dispatch(setLoading(true));
          
          // Clear any previous error messages in the Redux store
          dispatch(setError(null));
          
          // Debugging log for backend service URL routing
          console.log("Fetching order history for Account ID:", accountId);
          console.log("Orders API URL:", `orders/account/${accountId}`);
          
          // 1. Fetch orders from backend
          // Note: We do NOT pass email/password here because these services have their own auth
          // and the endpoints are configured as permitAll() for customers.
          // Passing credentials for a user that doesn't exist in the microservice DB triggers a 401.
          const orders = await orderService.getOrdersByAccountId(accountId);
          console.log("Orders fetched:", orders?.length || 0, orders);
          
          // If the backend returns no orders for this account, reset Redux state and exit early
          if (!orders || orders.length === 0) {
            dispatch(setPurchases([]));
            return;
          }

          // 2. Enrich orders with items and product details
          // We need this because the raw Order object doesn't have items or product info
          // Map over the incoming array of orders and process them in parallel
          const enrichedPurchases = await Promise.all(orders.map(async (order) => {
            try {
              // Fetch individual line items tied to the current order ID
              const orderItems = await orderItemService.getOrderItemsByOrderId(order.id);
              
              // Map over each line item to gather full product metadata (images, titles, file URLs)
              const itemsWithDetails = await Promise.all(orderItems.map(async (item) => {
                try {
                  // Fetch the heavy product payload from the Product Microservice
                  const product = await productService.getProductById(item.productId);
                  
                  // Return a composited object merging the transaction details (price/qty) with product details (media/title)
                  return {
                    ...item,
                    albumTitle: product.albumTitle || 'Unknown Product',
                    albumPrice: item.unitPrice, 
                    albumCoverImageUrl: product.albumCoverImageUrl,
                    fileUrl: product.fileUrl,  // This URL is required for user downloads post-purchase
                    quantity: item.quantity
                  };
                } catch (productErr) {
                  // Fallback catch block if a specific product string fails (e.g., was deleted from DB)
                  console.error(`Failed to fetch product details for ${item.productId}:`, productErr);
                  return {
                    ...item,
                    albumTitle: 'Product Unavailable',
                    albumPrice: item.unitPrice,
                    quantity: item.quantity
                  };
                }
              }));

              // Formulate the finalized order object to inject into the frontend UI layer
              return {
                id: order.id,                           // Order ID
                purchaseDate: order.orderDate,          // Timestamp of the original transaction
                totalAmount: order.totalAmount,         // Total cost 
                status: 'completed',                    // Hardcoded 'completed' unless backend dictates otherwise
                items: itemsWithDetails                 // Injected array of composited item details
              };
            } catch (err) {
              // Fallback catch block if order items fail to retrieve
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
          
          // Sort the finalized enriched purchases array chronologically descending (newest first)
          enrichedPurchases.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
          
          // Persist the fully composited history array to the global Redux store
          dispatch(setPurchases(enrichedPurchases));
        } catch (error) {
          // If the top level order service fails entirely
          console.error("Failed to fetch purchase history:", error);
          // Set human readable error string in Redux
          dispatch(setError(error.message || 'Failed to load purchase history'));
          // Invalidate the ref so the user can try fetching again without a hard browser reload
          lastFetchedId.current = null; 
        } finally {
          // Regardless of success or failure, mark the fetch sequence as resolved
          setFetched(true);
          // Halt the loading spinner animation
          dispatch(setLoading(false));
        }
      } else if (!accountId) {
        // No logged-in user — mark as fetched so we show empty state
        // This stops infinite loading skeletons for guest users looking at protected routes
        setFetched(true);
      }
    };

    // Execute the async function wrapper defined above
    fetchHistory();
    // Re-evaluate this hook only when the user's ID changes or when Redux dispatch reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, dispatch]);

  // Utility handler that bridges S3 signed URLs into a forced browser download action
  const handleDownload = (item) => {
    // Check if the item actually has a downloadable file associated with it
    if (item.fileUrl) {
      try {
        // Trigger generic download helper utility
        downloadFile(item.fileUrl, generateFilename(item, item.fileUrl));
      } catch (error) {
        alert("Failed to download file. Please try again.");
      }
    }
  };

  // Rendering logic: View State 1 -> Loading Active
  if (loading || (!fetched && currentUser?.id)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        {/* CSS-driven spinning loading ring */}
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-400">Loading purchase history...</p>
      </div>
    );
  }

  // Rendering logic: View State 2 -> Error Encountered
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        {/* Large red icon indicating failure */}
        <FaReceipt className="text-red-400 text-6xl mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">Failed to load purchases</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <button
          // Purge the ref and force a hard window reload to re-attempt connection
          onClick={() => { lastFetchedId.current = null; window.location.reload(); }}
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Rendering logic: View State 3 -> Valid Fetch but Empty Result Set
  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        {/* Gray receipt icon indicating lack of items */}
        <FaReceipt className="text-gray-400 text-6xl mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">No purchases yet</h2>
        <p className="text-gray-400 mb-6">Your purchase history will appear here</p>
        {/* Call to action redirecting to the storefront */}
        <Link 
          to="/"
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  // Rendering logic: View State 4 -> Valid Data Render
  return (
    <div>
      <h2 className="text-white text-3xl font-bold mb-6">Purchase History</h2>
      
      {/* Container holding the list of historical orders */}
      <div className="space-y-6">
        {/* Iterate sequentially over all enriched purchase records stored in Redux */}
        {purchases.map((purchase) => (
          <div key={purchase.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-6">
            
            {/* --- Purchase Header Block --- */}
            <div className="flex flex-wrap justify-between items-start mb-4 pb-4 border-b border-gray-600">
              <div>
                {/* Format the numeric ID with leading zeroes (e.g. Order #007) */}
                <h3 className="text-white font-semibold text-lg mb-2">
                  Order #{String(purchase.id).replace('purchase-', '').padStart(3, '0')}
                </h3>
                {/* Secondary metadata row (Date and Total Spent) */}
                <div className="flex flex-wrap gap-4 text-gray-400 text-sm">
                  {/* Calendar Icon + Date */}
                  <div className="flex items-center gap-2">
                    <FaCalendar />
                    <span>{new Date(purchase.purchaseDate).toLocaleDateString()}</span>
                  </div>
                  {/* Dollar Icon + Amount */}
                  <div className="flex items-center gap-2">
                    <FaDollarSign />
                    <span className="text-white font-semibold">
                      €{purchase.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Status Badge (Green for success, Yellow for fallback/pending) */}
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                purchase.status === 'completed' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {purchase.status}
              </span>
            </div>

            {/* --- Purchase Line Items Iteration --- */}
            <div className="space-y-3">
              <h4 className="text-white font-semibold mb-2">Items:</h4>
              {/* Iterate over all the specific items bought in this specific order block */}
              {purchase.items.map((item, index) => {
                // Deconstruct commonly used fields to clean up mapping
                const productName = item.albumTitle;
                const price = item.albumPrice;
                const coverMedia = item.albumCoverImageUrl;
                
                // Logic flags to determine if the product artwork is an mp4 video or image
                const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                // Hardcoded exception handling for 'teddy emotion' edge case (to prevent bugs)
                const isTeddyEmotion = productName && productName.toLowerCase().includes('teddy emotion');
                // Final determination flag for the onset dynamic image card component
                const useOnsetImages = isVideo && !isTeddyEmotion;

                return (
                  <div key={index} className="flex gap-3 bg-white/5 rounded-lg p-3 items-center">
                    
                    {/* Render logic depending on product media type */}
                    {useOnsetImages ? (
                      // 1. Dynamic Onset Image
                      <div className="w-16 h-16 shrink-0">
                        <OnsetImageCard
                          songTitle={productName}
                          songId={item.productId}
                          className="w-full h-full rounded-lg object-cover"
                          isPlaying={false} // Always paused in checkout view
                          isActive={false}  // Not active contextually
                        />
                      </div>
                    ) : isVideo ? (
                      // 2. Continuous Video Loop
                      <video
                        src={coverMedia}
                        className="w-16 h-16 rounded-lg object-cover"
                        muted
                        loop
                        autoPlay
                        // Fallback logic incase video url fails -> inject default image
                        onError={(e) => {
                          const img = document.createElement('img');
                          img.src = placeholders.small;
                          img.alt = productName;
                          img.className = 'w-16 h-16 rounded-lg object-cover';
                          e.target.parentNode.replaceChild(img, e.target);
                        }}
                      />
                    ) : (
                      // 3. Standard Static Image
                      <img
                        src={coverMedia || placeholders.small}
                        alt={productName}
                        className="w-16 h-16 rounded-lg object-cover"
                        // Fallback logic incase image url fails -> point to default
                        onError={(e) => {
                          if (e.target.src !== placeholders.small) {
                            e.target.src = placeholders.small;
                          }
                        }}
                      />
                    )}
                    
                    {/* Item Details Container (Title + Quantity Breakdowns) */}
                    <div className="flex-1">
                      <p className="text-white font-semibold">{productName}</p>
                      <p className="text-gray-400 text-sm">
                        Quantity: {item.quantity} × €{price.toFixed(2)}
                      </p>
                    </div>
                    
                    {/* Aggregated Total Price for this specific line item setup */}
                    <div className="text-white font-semibold mr-4">
                      €{(price * item.quantity).toFixed(2)}
                    </div>
                    
                    {/* Render a Download Button IF AND ONLY IF the API provided a valid source download Url */}
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

            {/* --- Payment Reference Block --- (Present only if ID provided from PayPal hook) */}
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
