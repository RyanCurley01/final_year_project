import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

// Helper to determine base URL
const getBaseUrl = () => {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  if (isLocalhost) {
    return 'http://localhost:8081/api/products';
  }
  return `${getServiceUrl('PRODUCTS')}/api/products`;
};

export const productService = {
  // Get all products
  getAllProducts: async (email, password) => {
    const baseUrl = getBaseUrl();
    const options = {};
    if (email && password) {
      options.headers = getBasicAuthHeaders(email, password);
    }
    return apiCall(`${baseUrl}/getAllProducts`, options);
  },

  // Get product by ID
  getProductById: async (id, email, password) => {
    const baseUrl = getBaseUrl();
    const options = {};
    if (email && password) {
      options.headers = getBasicAuthHeaders(email, password);
    }
    return apiCall(`${baseUrl}/${id}`, options);
  },

  // Create product (Manager only)
  createProduct: async (productData, email, password) => {
    const baseUrl = getBaseUrl();
    return apiCall(baseUrl, {
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
