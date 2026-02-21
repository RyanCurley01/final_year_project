import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  FaStar,
  FaTrash,
  FaShareAlt,
  FaBell,
  FaBellSlash,
  FaChartBar,
  FaCopy,
  FaCheck,
  FaExternalLinkAlt,
  FaArrowDown,
  FaUsers,
} from 'react-icons/fa';
import { FiShoppingCart } from 'react-icons/fi';

import {
  removeFromWishlistLocal,
  removeWishlistItem,
  fetchWishlist,
  fetchAllWishlists,
  generateShareToken,
  updatePriceAlert,
  clearPriceAlert,
  rehydrateForUser,
} from '../redux/features/wishlistSlice';
import { addToCart } from '../redux/features/cartSlice';
import { useAuth } from '../context/AuthContext';
import { auth as firebaseAuth } from '../firebase';
import { useGetAllProductsQuery } from '../redux/services/productsApi';
import placeholders from '../utils/placeholderImage';
import Loader from '../components/Loader';
import SongCard from '../components/SongCard';

// ─── Price Drop Notification Card ────────────────────────────────────
const PriceDropCard = ({ alert, product, onDismiss }) => {
  if (!alert?.dropped || !product) return null;
  const isVideo = product.albumCoverImageUrl?.toLowerCase().includes('.mp4');

  return (
    <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-900/40 to-emerald-900/30 border border-green-500/30 rounded-xl backdrop-blur-sm animate-slideup">
      <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
        {isVideo ? (
          <video
            src={product.albumCoverImageUrl}
            className="w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
            crossOrigin="anonymous"
          />
        ) : (
          <img
            src={product.albumCoverImageUrl || placeholders.large}
            alt={product.albumTitle}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = placeholders.large; }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
          <FaArrowDown className="text-green-300 w-5 h-5 animate-bounce" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold truncate">{product.albumTitle}</p>
        <p className="text-green-400 text-sm font-medium">
          Price dropped {alert.percentage}% &mdash; now ${alert.currentPrice}
          <span className="text-gray-500 line-through ml-2">${alert.previousPrice}</span>
        </p>
        <p className="text-gray-500 text-xs mt-0.5">
          You save ${alert.difference}
        </p>
      </div>
      <button
        onClick={() => onDismiss(product.id)}
        className="text-gray-500 hover:text-gray-300 transition-colors p-1"
        title="Dismiss"
      >
        <FaBellSlash className="w-4 h-4" />
      </button>
    </div>
  );
};

// ─── Manager Tracking Row ────────────────────────────────────────────
const ManagerTrackingRow = ({ product, wishlistCount }) => {
  const isVideo = product.albumCoverImageUrl?.toLowerCase().includes('.mp4');
  return (
  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
    <td className="py-3 px-4">
      <div className="flex items-center gap-3">
        {isVideo ? (
          <video
            src={product.albumCoverImageUrl}
            className="w-10 h-10 rounded-lg object-cover"
            muted
            loop
            autoPlay
            playsInline
            crossOrigin="anonymous"
          />
        ) : (
          <img
            src={product.albumCoverImageUrl || placeholders.large}
            alt={product.albumTitle}
            className="w-10 h-10 rounded-lg object-cover"
            onError={(e) => { e.target.src = placeholders.large; }}
          />
        )}
        <span className="text-white font-medium truncate max-w-[200px]">
          {product.albumTitle}
        </span>
      </div>
    </td>
    <td className="py-3 px-4 text-center">
      <span className="text-yellow-400 font-bold">{wishlistCount}</span>
    </td>
    <td className="py-3 px-4 text-right text-white">
      ${product.albumPrice?.toFixed(2) || '0.00'}
    </td>
    <td className="py-3 px-4 text-center">
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(wishlistCount * 10, 100)}%` }}
        ></div>
      </div>
    </td>
  </tr>
  );
};

// ─── Wishlist Page ───────────────────────────────────────────────────
const WishlistPage = () => {
  const dispatch = useDispatch();
  const { currentUser } = useAuth();
  const { items: wishlistItems, totalItems, priceAlerts, shareToken, loading, allWishlistItems } =
    useSelector((state) => state.wishlist);

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('wishlist'); // 'wishlist' | 'alerts' | 'tracking'

  const isManager = currentUser?.accountType === 'Manager';

  // Auth info — supports both Basic Auth (legacy/seeded) and Firebase Bearer token (Google users)
  const userEmail = currentUser?.email || currentUser?.accountEmailAddress;
  const hasBasicAuth = !!(userEmail && currentUser?.password);
  const isFirebaseUser = !!(currentUser?.firebaseUid);
  const auth = hasBasicAuth
    ? { email: userEmail, password: currentUser.password }
    : undefined;

  // Helper to get auth params for dispatching thunks
  // Returns { email, password, firebaseToken } with whichever is available
  const getAuthParams = useCallback(async () => {
    if (hasBasicAuth) {
      return { email: userEmail, password: currentUser.password };
    }
    // For Firebase/Google users, get a fresh ID token
    if (isFirebaseUser && firebaseAuth.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        return { email: userEmail, firebaseToken: token };
      } catch (err) {
        console.warn('Failed to get Firebase token:', err);
      }
    }
    return null;
  }, [hasBasicAuth, isFirebaseUser, userEmail, currentUser?.password]);

  // Fetch products to enrich wishlist items
  const { data: productsData } = useGetAllProductsQuery(auth, {
    refetchOnMountOrArgChange: true,
  });
  const allProducts = productsData || [];

  // Rehydrate wishlist from localStorage whenever the logged-in user changes
  useEffect(() => {
    dispatch(rehydrateForUser());
  }, [dispatch, currentUser?.id]);

  // ─── Fetch helpers (reusable for mount + polling) ─────────────────
  const fetchUserWishlist = useCallback(async () => {
    if (!currentUser?.id) return;
    const authParams = await getAuthParams();
    if (!authParams) return;
    dispatch(fetchWishlist({ accountId: currentUser.id, ...authParams }));
  }, [dispatch, currentUser?.id, getAuthParams]);

  const fetchManagerWishlists = useCallback(async () => {
    if (!isManager) return;
    const authParams = await getAuthParams();
    if (!authParams) return;
    dispatch(fetchAllWishlists(authParams));
  }, [dispatch, isManager, getAuthParams]);

  // Fetch wishlist from backend on mount
  useEffect(() => {
    fetchUserWishlist();
  }, [fetchUserWishlist]);

  // Fetch ALL wishlists for manager tracking tab
  useEffect(() => {
    fetchManagerWishlists();
  }, [fetchManagerWishlists]);

  // ─── Dynamic polling: auto-refresh every 15 seconds ───────────────
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    // Poll based on active tab — always refresh user wishlist + tracking if manager
    pollIntervalRef.current = setInterval(() => {
      fetchUserWishlist();
      if (isManager && activeTab === 'tracking') {
        fetchManagerWishlists();
      }
    }, 15000); // 15-second polling interval

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchUserWishlist, fetchManagerWishlists, isManager, activeTab]);

  // Map wishlist items to full product data (keep original prices — SongCard handles discount display)
  const wishlistProducts = useMemo(() => {
    return wishlistItems
      .map((item) => {
        // Try to find from fetched products first
        const product = allProducts.find((p) => p.id === item.productId);
        const base = product
          ? { ...product, wishlistEntryId: item.id }
          : item.product
            ? { ...item.product, wishlistEntryId: item.id }
            : null;
        return base;
      })
      .filter(Boolean);
  }, [wishlistItems, allProducts]);

  // ─── Price drop detection ─────────────────────────────────────────
  // Seed an initial price snapshot when a product is first wishlisted,
  // then fire an alert whenever the current (discounted) price diverges.
  useEffect(() => {
    wishlistProducts.forEach((product) => {
      // Compute the effective price the customer sees (mirrors SongCard discount logic)
      const hasDiscount = product.id != null && product.id % 2 === 0;
      const effectivePrice = hasDiscount ? product.albumPrice / 2 : product.albumPrice;

      const existingAlert = priceAlerts[product.id];
      if (!existingAlert) {
        // First time seeing this product — record its ORIGINAL (undiscounted)
        // price so the next render can detect the discount as a drop.
        dispatch(
          updatePriceAlert({
            productId: product.id,
            previousPrice: product.albumPrice, // original full price
            currentPrice: product.albumPrice,   // no drop yet
          })
        );
      } else if (existingAlert.currentPrice !== effectivePrice) {
        // Price changed since last snapshot — fire a drop / rise alert
        dispatch(
          updatePriceAlert({
            productId: product.id,
            previousPrice: existingAlert.currentPrice,
            currentPrice: effectivePrice,
          })
        );
      }
    });
  }, [wishlistProducts, allProducts]);

  // ─── Manager: Product tracking data (from ALL users via backend) ───
  const trackingData = useMemo(() => {
    if (!isManager) return [];
    // Count how many times each product appears across ALL users' wishlists
    const countMap = {};
    allWishlistItems.forEach((item) => {
      countMap[item.productId] = (countMap[item.productId] || 0) + 1;
    });
    return allProducts
      .filter((p) => countMap[p.id])
      .map((p) => ({ product: p, wishlistCount: countMap[p.id] }))
      .sort((a, b) => b.wishlistCount - a.wishlistCount);
  }, [isManager, allWishlistItems, allProducts]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleRemove = async (product) => {
    dispatch(removeFromWishlistLocal({ productId: product.id, accountId: currentUser?.id }));
    if (product.wishlistEntryId) {
      const authParams = await getAuthParams();
      if (authParams) {
        dispatch(
          removeWishlistItem({
            id: product.wishlistEntryId,
            ...authParams,
          })
        ).then(() => {
          // Refresh data after backend confirms removal
          fetchUserWishlist();
          fetchManagerWishlists();
        });
      }
    }
  };

  const handleMoveToCart = (product) => {
    dispatch(addToCart(product));
    handleRemove(product);
  };

  const handleShare = () => {
    if (!shareToken) {
      dispatch(generateShareToken());
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/wishlist?share=${shareToken}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDismissAlert = (productId) => {
    dispatch(clearPriceAlert(productId));
  };

  const activeAlerts = Object.entries(priceAlerts).filter(
    ([, alert]) => alert.dropped
  );

  if (loading) return <Loader title="Loading your wishlist..." />;

  // ─── Tab buttons ───────────────────────────────────────────────────
  const tabs = [
    { key: 'wishlist', label: 'My Wishlist', icon: FaStar, count: totalItems },
    { key: 'alerts', label: 'Price Alerts', icon: FaBell, count: activeAlerts.length },
  ];
  if (isManager) {
    tabs.push({ key: 'tracking', label: 'Product Tracking', icon: FaChartBar });
  }

  return (
    <div className="flex flex-col max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl md:text-3xl text-white flex items-center gap-3">
          <FaStar className="text-yellow-400" />
          Wishlist
          {totalItems > 0 && (
            <span className="text-base font-normal text-gray-400">
              ({totalItems} {totalItems === 1 ? 'item' : 'items'})
            </span>
          )}
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-yellow-500 text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === tab.key
                    ? 'bg-black/20 text-black'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── WISHLIST TAB ─────────────────────────────────────────── */}
      {activeTab === 'wishlist' && (
        <>
          {/* Share Section */}
          <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <FaShareAlt className="text-blue-400 w-4 h-4" />
                <span className="text-white text-sm font-medium">
                  Share your wishlist
                </span>
              </div>
              {!shareToken ? (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  <FaExternalLinkAlt className="w-3 h-3" />
                  Generate Share Link
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/wishlist?share=${shareToken}`}
                    className="bg-black/30 text-gray-300 text-xs px-3 py-2 rounded-lg border border-white/10 w-64 truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      copied
                        ? 'bg-green-600 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {copied ? (
                      <>
                        <FaCheck className="w-3 h-3" /> Copied
                      </>
                    ) : (
                      <>
                        <FaCopy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Wishlist Items Grid */}
          {wishlistProducts.length === 0 ? (
            <div className="text-center py-16">
              <FaStar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-400 mb-2">
                Your wishlist is empty
              </h2>
              <p className="text-gray-500 mb-6">
                Star songs on the Discover page to add them here
              </p>
              <Link
                to="/"
                className="px-6 py-3 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition-colors"
              >
                Browse Music
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {wishlistProducts.map((product, i) => (
                <div key={product.id} className="relative">
                  {/* Reuse SongCard for full playback + video support */}
                  <SongCard
                    product={product}
                    data={wishlistProducts}
                    i={i}
                  />

                  {/* Remove Button - Inline with Star but on left */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(product);
                    }}
                    className="absolute top-8 left-8 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110 text-red-500 hover:text-red-600"
                    title="Remove from Wishlist"
                  >
                    <FaTrash className="text-xl" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── PRICE ALERTS TAB ─────────────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">
              Get notified when prices drop on your wishlisted items
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FaBell className="w-3.5 h-3.5 text-yellow-400" />
              Monitoring {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </div>
          </div>

          {activeAlerts.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <FaArrowDown className="text-green-400 w-4 h-4" />
                Active Price Drops
              </h3>
              {activeAlerts.map(([productId, alert]) => {
                const product = allProducts.find((p) => p.id === Number(productId));
                return (
                  <PriceDropCard
                    key={productId}
                    alert={alert}
                    product={product}
                    onDismiss={handleDismissAlert}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <FaBell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-400 mb-2">
                No price drops yet
              </h2>
              <p className="text-gray-500">
                We&rsquo;ll notify you here when prices drop on your wishlisted
                songs
              </p>
            </div>
          )}

          {/* Always show monitoring info - All wishlisted items */}
          {wishlistProducts.length > 0 && (
            <div className="mt-8">
              <h3 className="text-white font-semibold text-lg mb-3">
                Monitored Items
              </h3>
              <div className="space-y-2">
                {wishlistProducts.map((product) => {
                  const isVideo = product.albumCoverImageUrl?.toLowerCase().includes('.mp4');
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                    >
                      {isVideo ? (
                        <video
                          src={product.albumCoverImageUrl}
                          className="w-10 h-10 rounded object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <img
                          src={product.albumCoverImageUrl || placeholders.large}
                          alt={product.albumTitle}
                          className="w-10 h-10 rounded object-cover"
                          onError={(e) => { e.target.src = placeholders.large; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate text-sm">
                          {product.albumTitle}
                        </p>
                      </div>
                      <p className="text-white font-bold text-sm">
                        ${product.albumPrice?.toFixed(2)}
                      </p>
                      <FaBell className="text-yellow-400 w-3.5 h-3.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MANAGER TRACKING TAB ─────────────────────────────────── */}
      {activeTab === 'tracking' && isManager && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <FaUsers className="text-purple-400 w-5 h-5" />
            <div>
              <h2 className="text-white font-semibold text-lg">
                Wishlisted Product Tracking
              </h2>
              <p className="text-gray-400 text-sm">
                See which products are most wishlisted across all users
              </p>
            </div>
          </div>

          {trackingData.length > 0 ? (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-sm">
                    <th className="py-3 px-4 text-left font-medium">Product</th>
                    <th className="py-3 px-4 text-center font-medium">
                      Wishlists
                    </th>
                    <th className="py-3 px-4 text-right font-medium">Price</th>
                    <th className="py-3 px-4 text-center font-medium">
                      Popularity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trackingData.map(({ product, wishlistCount }) => (
                    <ManagerTrackingRow
                      key={product.id}
                      product={product}
                      wishlistCount={wishlistCount}
                    />
                  ))}
                </tbody>
              </table>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 p-4 border-t border-white/10">
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-400">
                    {trackingData.length}
                  </p>
                  <p className="text-xs text-gray-400">Unique Products</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">
                    {trackingData.reduce(
                      (sum, d) => sum + d.wishlistCount,
                      0
                    )}
                  </p>
                  <p className="text-xs text-gray-400">Total Wishlists</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">
                    {trackingData.length > 0
                      ? trackingData[0].product.albumTitle
                      : '-'}
                  </p>
                  <p className="text-xs text-gray-400">Most Wanted</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <FaChartBar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-400 mb-2">
                No tracking data yet
              </h2>
              <p className="text-gray-500">
                Wishlist data from all users will appear here
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
