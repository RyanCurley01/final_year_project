// Base API configuration with dynamic environment support
import envConfig from '../../config/environment.js';

// Get backend base URL using our environment configuration
const BACKEND_BASE_URL = envConfig.getBackendApiUrl();

console.log('🔧 Backend API Configuration:', {
  baseUrl: BACKEND_BASE_URL,
  environment: envConfig.getEnvironment(),
  isCodespaces: envConfig.isCodespaces()
});

// Service ports (must match backend application.yml configurations)
export const PORTS = {
  ACCOUNTS: 8080,
  PRODUCTS: 8081,  // Fixed port order
  ORDERS: 8082,    
  PAYMENTS: 8083,     
  STOCK: 8084,
  WISHLIST: 8085,     
  ORDER_ITEMS: 8086,  
  CUSTOMER_SUMMARY: 8087,  
  SOLD_PRODUCTS: 8088,
  PURCHASED_PRODUCTS: 8089,  
};

// Helper function to get full URL
export const getServiceUrl = (service) => {
  if (envConfig.isCodespaces()) {
    // In Codespaces, each service has its own forwarded port
    const port = PORTS[service];
    const config = envConfig.getConfig();
    return `https://${config.codespaceName}-${port}.${config.codespacesDomain}`;
  } else {
    // In localhost, services might be on different ports
    return `${BACKEND_BASE_URL.replace(':8080', '')}:${PORTS[service]}`;
  }
};

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
