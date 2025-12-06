import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('PURCHASED_PRODUCTS')}/api/purchasedProducts`;

export const purchasedProductsService = {
  // Get all purchased products
  getAllPurchasedProducts: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllPurchasedProducts`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get purchased product by ID
  getPurchasedProductById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get purchased products by account ID
  getPurchasedProductsByAccountId: async (accountId, email, password) => {
    return apiCall(`${BASE_URL}/account/${accountId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get purchased products by product ID
  getPurchasedProductsByProductId: async (productId, email, password) => {
    return apiCall(`${BASE_URL}/product/${productId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create purchased product
  createPurchasedProduct: async (purchasedProductData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(purchasedProductData),
    });
  },

  // Update purchased product
  updatePurchasedProduct: async (id, purchasedProductData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(purchasedProductData),
    });
  },

  // Delete purchased product
  deletePurchasedProduct: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
