// Base API configuration with dynamic environment support
import envConfig from '../../config/environment.js';

// Get backend base URL using our environment configuration
const BACKEND_BASE_URL = envConfig.getBackendApiUrl();

console.log('🔧 Backend API Configuration:', {
  baseUrl: BACKEND_BASE_URL,
  environment: envConfig.getEnvironment(),
  isCodespaces: envConfig.isCodespaces()
});

// Service ports 
export const PORTS = {
  ACCOUNTS: 8080,
  PRODUCTS: 8081,  
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
  const port = PORTS[service];
  const config = envConfig.getConfig();
  
  if (envConfig.isCodespaces()) {
    // In Codespaces, each service has its own forwarded port
    const url = `https://${config.codespaceName}-${port}.${config.codespacesDomain}`;
    console.log(`🌐 Service URL for ${service}:`, url);
    return url;
  } else if (config.isNgrok) {
    // In ngrok mode, use proxy paths that map to Docker container names
    const proxyMap = {
      8080: '/proxy/backend',
      8081: '/proxy/products',
      8082: '/proxy/orders',
      8083: '/proxy/payments',
      8084: '/proxy/stock',
      8085: '/proxy/wishlist',
      8086: '/proxy/order-items',
      8087: '/proxy/customer-summary',
      8088: '/proxy/sold-products',
      8089: '/proxy/sold-products',
    };
    const url = proxyMap[port] || `/proxy/backend`;
    console.log(`🌐 Service URL for ${service} (ngrok):`, url);
    return url;
  } else {
    // In localhost, services might be on different ports
    const url = `http://localhost:${port}`;
    console.log(`🌐 Service URL for ${service}:`, url);
    return url;
  }
};

// Helper function for authenticated requests
export const getAuthHeaders = (token) => {
  const hostname = window.location.hostname;
  const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Add ngrok bypass header
  if (isNgrok) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Helper function for Basic Auth
export const getBasicAuthHeaders = (email, password) => {
  const hostname = window.location.hostname;
  const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
  
  const credentials = btoa(`${email}:${password}`);
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${credentials}`,
  };
  
  // Add ngrok bypass header
  if (isNgrok) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  
  return headers;
};

// Generic API call handler
export const apiCall = async (url, options = {}) => {
  try {
    const hostname = window.location.hostname;
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    
    // Build headers with ngrok bypass if needed
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (isNgrok) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    
    const response = await fetch(url, {
      ...options,
      headers,
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
