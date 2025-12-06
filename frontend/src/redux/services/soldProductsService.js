import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('SOLD_PRODUCTS')}/api/soldProducts`;

export const soldProductsService = {
  // Get all sold products
  getAllSoldProducts: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllSoldProducts`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get sold product by ID
  getSoldProductById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get sold products by product ID
  getSoldProductsByProductId: async (productId, email, password) => {
    return apiCall(`${BASE_URL}/product/${productId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get sold products by account ID
  getSoldProductsByAccountId: async (accountId, email, password) => {
    return apiCall(`${BASE_URL}/account/${accountId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create sold product
  createSoldProduct: async (soldProductData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(soldProductData),
    });
  },

  // Update sold product
  updateSoldProduct: async (id, soldProductData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(soldProductData),
    });
  },

  // Delete sold product
  deleteSoldProduct: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
