import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('WISHLIST')}/api/wishlist`;

export const wishlistService = {
  // Get all wishlist items
  getAllWishlist: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllWishlist`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get wishlist by account ID
  getWishlistByAccountId: async (accountId, email, password) => {
    return apiCall(`${BASE_URL}/account/${accountId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get wishlist item by ID
  getWishlistById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Add to wishlist
  addToWishlist: async (wishlistData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(wishlistData),
    });
  },

  // Update wishlist item
  updateWishlist: async (id, wishlistData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(wishlistData),
    });
  },

  // Remove from wishlist
  removeFromWishlist: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
