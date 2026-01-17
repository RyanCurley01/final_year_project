// Base API configuration with dynamic environment support
import envConfig from '../../config/environment.js';

// Get backend base URL using our environment configuration
const BACKEND_BASE_URL = envConfig.getBackendApiUrl();

console.log('🔧 Backend API Configuration:', {
  baseUrl: BACKEND_BASE_URL,
  environment: envConfig.getEnvironment(),
  isCodespaces: envConfig.isCodespaces(),
  isProduction: envConfig.isProduction()
});

// Service ports (used for Codespaces and local development)
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

// Environment variable mappings for each service
// These are read from VITE_* env vars at build time
const SERVICE_ENV_VARS = {
  ACCOUNTS: 'VITE_ACCOUNTS_API_URL',
  PRODUCTS: 'VITE_PRODUCTS_API_URL',
  ORDERS: 'VITE_ORDERS_API_URL',
  PAYMENTS: 'VITE_PAYMENTS_API_URL',
  STOCK: 'VITE_STOCK_API_URL',
  WISHLIST: 'VITE_WISHLIST_API_URL',
  ORDER_ITEMS: 'VITE_ORDER_ITEMS_API_URL',
  CUSTOMER_SUMMARY: 'VITE_CUSTOMER_SUMMARY_API_URL',
  SOLD_PRODUCTS: 'VITE_SOLD_PRODUCTS_API_URL',
  PURCHASED_PRODUCTS: 'VITE_PURCHASED_PRODUCTS_API_URL',
};

// Helper to check if a URL is a localhost URL
const isLocalhostUrl = (url) => url && (url.includes('localhost') || url.includes('127.0.0.1'));

// Helper function to get full URL
export const getServiceUrl = (service) => {
  const port = PORTS[service];
  const config = envConfig.getConfig();
  const viteEnv = import.meta.env || {};
  const runtimeEnv = window.ENV_CONFIG || {};
  
  // Check for service-specific environment variable first
  const envVarName = SERVICE_ENV_VARS[service];
  const runtimeUrl = runtimeEnv[envVarName];
  const viteUrl = viteEnv[envVarName];
  
  // IMPORTANT: Check localhost FIRST - always use localhost URLs when running locally
  // This prevents CORS issues from trying to use production URLs during local development
  if (config.isLocalhost) {
    const url = `http://localhost:${port}`;
    console.log(`🌐 Service URL for ${service} (localhost):`, url);
    return url;
  }
  
  // In Codespaces, each service has its own forwarded port
  if (envConfig.isCodespaces()) {
    const url = `https://${config.codespaceName}-${port}.${config.codespacesDomain}`;
    console.log(`🌐 Service URL for ${service} (codespaces):`, url);
    return url;
  }
  
  // In ngrok mode, use proxy paths that map to Docker container names
  if (config.isNgrok) {
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
  }
  
  // In production, prefer env vars over localhost URLs
  if (config.isProduction) {
    // Try runtime env first, then vite env
    if (runtimeUrl && !isLocalhostUrl(runtimeUrl)) {
      console.log(`🌐 Service URL for ${service} (runtime env):`, runtimeUrl);
      return runtimeUrl;
    }
    if (viteUrl && !isLocalhostUrl(viteUrl)) {
      console.log(`🌐 Service URL for ${service} (vite env):`, viteUrl);
      return viteUrl;
    }
    
    // Fallback: Use backend URL as base (assumes API gateway/reverse proxy)
    const fallbackUrl = config.backendApiUrl;
    console.warn(`⚠️ No ${envVarName} set for production! Using fallback:`, fallbackUrl);
    return fallbackUrl;
  }
  
  // Fallback to localhost
  const url = `http://localhost:${port}`;
  console.log(`🌐 Service URL for ${service} (fallback):`, url);
  return url;
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
    
    console.log('🌐 API Call:', { url, method: options.method || 'GET', headers });
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    console.log('📡 API Response:', { url, status: response.status, statusText: response.statusText });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMessage = error.message || `HTTP ${response.status}: ${response.statusText}`;
      console.error('❌ API Error:', { url, status: response.status, error: errorMessage });
      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('❌ API call failed:', { url, error: error.message, stack: error.stack });
    throw error;
  }
};
