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
  getAllProducts: async (email, password) => {
    const baseUrl = getBaseUrl();
    const options = {};
    if (email && password) options.headers = getBasicAuthHeaders(email, password);
    return apiCall(baseUrl, options);
  },

  getProductById: async (id, email, password) => {
    const baseUrl = getBaseUrl();
    const options = {};
    if (email && password) options.headers = getBasicAuthHeaders(email, password);
    return apiCall(`${baseUrl}/${id}`, options);
  },

  createProduct: async (productData, email, password) => {
    const baseUrl = getBaseUrl();
    return apiCall(baseUrl, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(productData),
    });
  },

  updateProduct: async (id, productData, email, password) => {
    const baseUrl = getBaseUrl();   // was incorrectly BASE_URL (undefined)
    return apiCall(`${baseUrl}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(productData),
    });
  },

  deleteProduct: async (id, email, password) => {
    const baseUrl = getBaseUrl();   // was incorrectly BASE_URL (undefined)
    return apiCall(`${baseUrl}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // GET /products?search=  (was /search?q=)
  searchProducts: async (searchTerm, email, password) => {
    const baseUrl = getBaseUrl();   // was incorrectly BASE_URL (undefined)
    return apiCall(`${baseUrl}?search=${encodeURIComponent(searchTerm)}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },
};