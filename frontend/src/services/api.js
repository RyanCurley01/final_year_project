// Base API configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost';

// Service ports
export const PORTS = {
  ACCOUNTS: 8080,
  PRODUCTS: 8081,
  ORDERS: 8082,
  ORDER_ITEMS: 8083,
  PAYMENTS: 8084,
  WISHLIST: 8085,
  STOCK: 8086,
  CUSTOMER_SUMMARY: 8087,
  PURCHASED_PRODUCTS: 8088,
  SOLD_PRODUCTS: 8089,
};

// Helper function to get full URL
export const getServiceUrl = (service) => `${API_BASE_URL}:${PORTS[service]}`;

// Helper function for authenticated requests
export const getAuthHeaders = (token) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Helper function for Basic Auth
export const getBasicAuthHeaders = (email, password) => {
  const credentials = btoa(`${email}:${password}`);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${credentials}`,
  };
};

// Generic API call handler
export const apiCall = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};
