import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { wishlistService } from '../services';

// ─── LocalStorage persistence helpers (per-user) ────────────────────
const BASE_STORAGE_KEY = 'wishlist_items';
const BASE_ALERTS_KEY = 'wishlist_price_alerts';
const BASE_TOKEN_KEY  = 'wishlist_share_token';

// Derive a user-specific key so each account keeps its own wishlist
const getUserId = () => {
  try {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      const user = JSON.parse(stored);
      return user.id || user.firebaseUid || null;
    }
  } catch { /* ignore */ }
  return null;
};

const storageKey = (base) => {
  const uid = getUserId();
  return uid ? `${base}_${uid}` : base;
};

const loadFromStorage = (base, fallback) => {
  try {
    const raw = localStorage.getItem(storageKey(base));
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

const saveToStorage = (base, value) => {
  try { localStorage.setItem(storageKey(base), JSON.stringify(value)); } catch { /* quota */ }
};

// ─── Async thunks (best-effort backend sync) ────────────────────────
export const fetchWishlist = createAsyncThunk(
  'wishlist/fetchWishlist',
  async ({ accountId, email, password, firebaseToken }, { rejectWithValue }) => {
    if (!email && !firebaseToken) return rejectWithValue('No credentials');
    if (!password && !firebaseToken) return rejectWithValue('No credentials');
    try {
      const data = await wishlistService.getWishlistByAccountId(accountId, email, password, firebaseToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch wishlist');
    }
  }
);

export const addWishlistItem = createAsyncThunk(
  'wishlist/addItem',
  async ({ wishlistData, email, password, firebaseToken }, { rejectWithValue }) => {
    if (!email && !firebaseToken) return rejectWithValue('No credentials – saved locally');
    if (!password && !firebaseToken) return rejectWithValue('No credentials – saved locally');
    try {
      const data = await wishlistService.addToWishlist(wishlistData, email, password, firebaseToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to add to wishlist');
    }
  }
);

export const removeWishlistItem = createAsyncThunk(
  'wishlist/removeItem',
  async ({ id, email, password, firebaseToken }, { rejectWithValue }) => {
    if ((!email && !firebaseToken) || String(id).startsWith('temp-')) {
      return id; // Skip backend call, still fulfil
    }
    if (!password && !firebaseToken) {
      return id;
    }
    try {
      await wishlistService.removeFromWishlist(id, email, password, firebaseToken);
      return id;
    } catch (err) {
      // Still resolve so the local removal sticks
      return id;
    }
  }
);

// Remove by (accountId, productId) — cleans up all duplicates at once
export const removeWishlistByProduct = createAsyncThunk(
  'wishlist/removeByProduct',
  async ({ accountId, productId, email, password, firebaseToken }) => {
    const hasAuth = !!(password || firebaseToken);
    if (hasAuth) {
      try {
        await wishlistService.removeByAccountAndProduct(accountId, productId, email, password, firebaseToken);
      } catch {
        // Local removal still sticks
      }
    }
    return { accountId, productId };
  }
);

// Fetch ALL wishlists across all users (for manager tracking)
export const fetchAllWishlists = createAsyncThunk(
  'wishlist/fetchAllWishlists',
  async ({ email, password, firebaseToken }, { rejectWithValue }) => {
    if (!email && !firebaseToken) return rejectWithValue('No credentials');
    if (!password && !firebaseToken) return rejectWithValue('No credentials');
    try {
      const data = await wishlistService.getAllWishlist(email, password, firebaseToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch all wishlists');
    }
  }
);

// ─── Initial state (hydrated from localStorage) ─────────────────────
const initialState = {
  items: loadFromStorage(BASE_STORAGE_KEY, []),
  products: [],
  allWishlistItems: [],  // All wishlists across all users (for manager tracking)
  totalItems: loadFromStorage(BASE_STORAGE_KEY, []).length,
  loading: false,
  error: null,
  priceAlerts: loadFromStorage(BASE_ALERTS_KEY, {}),
  shareToken: loadFromStorage(BASE_TOKEN_KEY, null),
  pendingRemovals: [],  // productIds recently removed locally, not yet confirmed by backend
};

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    // Optimistic local add (before backend confirms)
    addToWishlistLocal: (state, action) => {
      const product = action.payload;
      const exists = state.items.find(
        (item) => item.productId === product.id || item.productId === product.productId
      );
      if (!exists) {
        state.items.push({
          id: `temp-${Date.now()}`,
          productId: product.id || product.productId,
          accountId: product.accountId,
          product, // attach full product data
        });
        state.totalItems = state.items.length;
        saveToStorage(BASE_STORAGE_KEY, state.items);
      }
    },

    // Optimistic local remove
    removeFromWishlistLocal: (state, action) => {
      const { productId, accountId } = action.payload;
      state.items = state.items.filter(
        (item) => item.productId !== productId && item.product?.id !== productId
      );
      state.totalItems = state.items.length;
      // Only remove the CURRENT user's entry from allWishlistItems (not all users)
      if (accountId) {
        state.allWishlistItems = state.allWishlistItems.filter(
          (item) => !(item.productId === productId && item.accountId === accountId)
        );
      }
      // Track as pending removal so refetches don't bring it back
      if (!state.pendingRemovals.includes(productId)) {
        state.pendingRemovals.push(productId);
      }
      // Clear any price alert for this product
      delete state.priceAlerts[productId];
      saveToStorage(BASE_ALERTS_KEY, state.priceAlerts);
      saveToStorage(BASE_STORAGE_KEY, state.items);
    },

    // Enrich items with full product data
    setWishlistProducts: (state, action) => {
      state.products = action.payload;
    },

    // Track price changes
    updatePriceAlert: (state, action) => {
      const { productId, previousPrice, currentPrice } = action.payload;
      state.priceAlerts[productId] = {
        previousPrice,
        currentPrice,
        dropped: currentPrice < previousPrice,
        difference: (previousPrice - currentPrice).toFixed(2),
        percentage: (((previousPrice - currentPrice) / previousPrice) * 100).toFixed(1),
        timestamp: new Date().toISOString(),
      };
      saveToStorage(BASE_ALERTS_KEY, state.priceAlerts);
    },

    clearPriceAlert: (state, action) => {
      const productId = action.payload;
      delete state.priceAlerts[productId];
      saveToStorage(BASE_ALERTS_KEY, state.priceAlerts);
    },

    // Generate a share token
    generateShareToken: (state) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let token = '';
      for (let i = 0; i < 16; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      state.shareToken = token;
      saveToStorage(BASE_TOKEN_KEY, token);
    },

    // Reload state from localStorage for the current user
    rehydrateForUser: (state) => {
      state.items = loadFromStorage(BASE_STORAGE_KEY, []);
      state.totalItems = state.items.length;
      state.priceAlerts = loadFromStorage(BASE_ALERTS_KEY, {});
      state.shareToken = loadFromStorage(BASE_TOKEN_KEY, null);
    },

    // Reset in-memory state only (preserves localStorage for rehydration)
    resetWishlistMemory: (state) => {
      state.items = [];
      state.products = [];
      state.allWishlistItems = [];
      state.totalItems = 0;
      state.priceAlerts = {};
      state.shareToken = null;
      state.pendingRemovals = [];
      state.loading = false;
      state.error = null;
    },

    clearWishlist: (state) => {
      state.items = [];
      state.products = [];
      state.totalItems = 0;
      state.priceAlerts = {};
      state.shareToken = null;
      state.pendingRemovals = [];
      try { localStorage.removeItem(storageKey(BASE_STORAGE_KEY)); } catch {}
      try { localStorage.removeItem(storageKey(BASE_ALERTS_KEY)); } catch {}
      try { localStorage.removeItem(storageKey(BASE_TOKEN_KEY)); } catch {}
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch wishlist
      .addCase(fetchWishlist.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWishlist.fulfilled, (state, action) => {
        state.loading = false;
        // Merge backend items with any local-only items
        const backendItems = (action.payload || []).filter(
          (item) => !state.pendingRemovals.includes(item.productId)
        );
        const localOnlyItems = state.items.filter(
          (local) =>
            String(local.id).startsWith('temp-') &&
            !backendItems.some((b) => b.productId === local.productId) &&
            !state.pendingRemovals.includes(local.productId)
        );
        state.items = [...backendItems, ...localOnlyItems];
        state.totalItems = state.items.length;
        saveToStorage(BASE_STORAGE_KEY, state.items);
      })
      .addCase(fetchWishlist.rejected, (state, action) => {
        state.loading = false;
        // Keep local items on failure – don't clear
        state.error = action.payload;
      })
      // Add item
      .addCase(addWishlistItem.fulfilled, (state, action) => {
        const newItem = action.payload;
        if (!newItem) return; // rejected-as-fulfilled guard
        // Replace temp entry with server-confirmed entry
        const tempIdx = state.items.findIndex(
          (item) =>
            String(item.id).startsWith('temp-') &&
            item.productId === newItem.productId
        );
        if (tempIdx !== -1) {
          state.items[tempIdx] = newItem;
        } else {
          const exists = state.items.find((item) => item.productId === newItem.productId);
          if (!exists) {
            state.items.push(newItem);
            state.totalItems = state.items.length;
          }
        }
        saveToStorage(BASE_STORAGE_KEY, state.items);
      })
      .addCase(addWishlistItem.rejected, (state) => {
        // Keep temp items so the star stays filled – backend will sync later
        state.totalItems = state.items.length;
        saveToStorage(BASE_STORAGE_KEY, state.items);
      })
      // Remove item
      .addCase(removeWishlistItem.fulfilled, (state, action) => {
        const deletedId = action.payload;
        // Find the productId before filtering so we can clear pending removal
        const deletedItem = state.items.find((item) => item.id === deletedId);
        state.items = state.items.filter((item) => item.id !== deletedId);
        state.totalItems = state.items.length;
        // Also remove from allWishlistItems so the tracking tab updates instantly
        state.allWishlistItems = state.allWishlistItems.filter(
          (item) => item.id !== deletedId
        );
        // Backend confirmed deletion — clear from pending removals
        if (deletedItem) {
          state.pendingRemovals = state.pendingRemovals.filter(
            (pid) => pid !== deletedItem.productId
          );
        }
        saveToStorage(BASE_STORAGE_KEY, state.items);
      })
      .addCase(removeWishlistItem.rejected, (state) => {
        // Already removed locally – persist
        saveToStorage(BASE_STORAGE_KEY, state.items);
      })
      // Fetch all wishlists (manager tracking)
      .addCase(fetchAllWishlists.fulfilled, (state, action) => {
        state.allWishlistItems = action.payload || [];
      })
      .addCase(fetchAllWishlists.rejected, (state) => {
        state.allWishlistItems = [];
      })
      // Remove by (accountId, productId) — removes all duplicates
      .addCase(removeWishlistByProduct.fulfilled, (state, action) => {
        const { accountId, productId } = action.payload;
        state.items = state.items.filter((item) => item.productId !== productId && item.product?.id !== productId);
        state.totalItems = state.items.length;
        state.allWishlistItems = state.allWishlistItems.filter(
          (item) => !(item.productId === productId && item.accountId === accountId)
        );
        state.pendingRemovals = state.pendingRemovals.filter((pid) => pid !== productId);
        delete state.priceAlerts[productId];
        saveToStorage(BASE_ALERTS_KEY, state.priceAlerts);
        saveToStorage(BASE_STORAGE_KEY, state.items);
      });
  },
});

export const {
  addToWishlistLocal,
  removeFromWishlistLocal,
  setWishlistProducts,
  updatePriceAlert,
  clearPriceAlert,
  generateShareToken,
  rehydrateForUser,
  resetWishlistMemory,
  clearWishlist,
} = wishlistSlice.actions;

export default wishlistSlice.reducer;
