import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('PRODUCTS')}/api/products`;

export const productService = {
  // Get all products
  getAllProducts: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllProducts`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get product by ID
  getProductById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create product (Manager only)
  createProduct: async (productData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(productData),
    });
  },

  // Update product (Manager only)
  updateProduct: async (id, productData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(productData),
    });
  },

  // Delete product (Manager only)
  deleteProduct: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Search products by title
  searchProducts: async (searchTerm, email, password) => {
    return apiCall(`${BASE_URL}/search?q=${encodeURIComponent(searchTerm)}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
