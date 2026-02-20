import { getServiceUrl, apiCall, getBasicAuthHeaders, getAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('WISHLIST')}/api/wishlist`;

// Helper: build auth headers from either (email, password) for Basic Auth,
// or a Firebase ID token for Bearer auth (Google-authenticated users)
const getWishlistAuthHeaders = (email, password, firebaseToken) => {
  if (email && password) {
    return getBasicAuthHeaders(email, password);
  }
  if (firebaseToken) {
    return getAuthHeaders(firebaseToken);
  }
  return { 'Content-Type': 'application/json' };
};

export const wishlistService = {
  // Get all wishlist items (with optional filters)
  getAllWishlist: async (email, password, firebaseToken) => {
    return apiCall(`${BASE_URL}/getAllWishlists`, {
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
    });
  },

  // Get wishlist by account ID
  getWishlistByAccountId: async (accountId, email, password, firebaseToken) => {
    return apiCall(`${BASE_URL}/getAllWishlists?accountId=${accountId}`, {
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
    });
  },

  // Get wishlist items by product ID (for manager tracking)
  getWishlistByProductId: async (productId, email, password, firebaseToken) => {
    return apiCall(`${BASE_URL}/getAllWishlists?productId=${productId}`, {
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
    });
  },

  // Get wishlist item by ID
  getWishlistById: async (id, email, password, firebaseToken) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
    });
  },

  // Add to wishlist
  addToWishlist: async (wishlistData, email, password, firebaseToken) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
      body: JSON.stringify(wishlistData),
    });
  },

  // Update wishlist item
  updateWishlist: async (id, wishlistData, email, password, firebaseToken) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
      body: JSON.stringify(wishlistData),
    });
  },

  // Remove from wishlist
  removeFromWishlist: async (id, email, password, firebaseToken) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getWishlistAuthHeaders(email, password, firebaseToken),
    });
  },
};
