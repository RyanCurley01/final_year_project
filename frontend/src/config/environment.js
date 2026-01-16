// src/config/environment.js
// Dynamic environment configuration that works in both local and Codespaces

class EnvironmentConfig {
  constructor() {
    this.config = this.detectEnvironment();
  }

  detectEnvironment() {
    const hostname = window.location.hostname;
    const isCodespaces = hostname.includes('app.github.dev');
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    // Production is any non-localhost, non-Codespaces, non-ngrok environment
    const isProduction = !isLocalhost && !isCodespaces && !isNgrok;
    
    // Extract codespace name if in Codespaces
    // Format: didactic-funicular-v47w6vwjq96fwjgg-5173.app.github.dev
    // We need: didactic-funicular-v47w6vwjq96fwjgg
    let codespaceName = null;
    if (isCodespaces) {
      const parts = hostname.split('.');
      const firstPart = parts[0]; // didactic-funicular-v47w6vwjq96fwjgg-5173
      const lastDashIndex = firstPart.lastIndexOf('-');
      codespaceName = firstPart.substring(0, lastDashIndex); // didactic-funicular-v47w6vwjq96fwjgg
    }
    const codespacesDomain = 'app.github.dev';
    
    // Get environment variables from different sources
    // VITE_ vars are baked in at build time, window.ENV_CONFIG can be set at runtime
    const viteEnv = import.meta.env || {};
    const runtimeEnv = window.ENV_CONFIG || {};
    
    console.log('🔍 Environment Detection:', {
      hostname,
      isCodespaces,
      isNgrok,
      isLocalhost,
      isProduction,
      codespaceName,
      codespacesDomain,
      viteEnv: { 
        VITE_API_BASE_URL: viteEnv.VITE_API_BASE_URL,
        VITE_BACKEND_API_URL: viteEnv.VITE_BACKEND_API_URL,
        VITE_PRODUCTS_API_URL: viteEnv.VITE_PRODUCTS_API_URL,
        VITE_ENVIRONMENT: viteEnv.VITE_ENVIRONMENT
      },
      runtimeEnv
    });
    
    let config = {
      environment: isProduction ? 'production' : (isCodespaces ? 'codespaces' : (isNgrok ? 'ngrok' : 'local')),
      isCodespaces,
      isNgrok,
      isLocalhost,
      isProduction,
      codespaceName,
      codespacesDomain
    };

    // Helper to check if a URL is a localhost URL (should be overridden in production)
    const isLocalhostUrl = (url) => url && (url.includes('localhost') || url.includes('127.0.0.1'));

    // API Base URL (Audio Service - port 5000)
    // Priority: runtime env > vite env (if not localhost in production) > auto-detect
    if (runtimeEnv.VITE_API_BASE_URL && !(isProduction && isLocalhostUrl(runtimeEnv.VITE_API_BASE_URL))) {
      config.apiBaseUrl = runtimeEnv.VITE_API_BASE_URL;
    } else if (viteEnv.VITE_API_BASE_URL && !(isProduction && isLocalhostUrl(viteEnv.VITE_API_BASE_URL))) {
      config.apiBaseUrl = viteEnv.VITE_API_BASE_URL;
    } else if (isCodespaces && codespaceName) {
      config.apiBaseUrl = `https://${codespaceName}-5000.${codespacesDomain}`;
    } else if (isNgrok) {
      config.apiBaseUrl = '/proxy/audio';
    } else if (viteEnv.VITE_AUDIO_SERVICE_URL) {
      config.apiBaseUrl = viteEnv.VITE_AUDIO_SERVICE_URL;
    } else if (isProduction) {
      // In production without proper config, use relative path (assumes same origin or API gateway)
      config.apiBaseUrl = '/api';
      console.warn('⚠️ Production deployment detected but VITE_API_BASE_URL not set! Using /api as fallback.');
    } else {
      config.apiBaseUrl = 'http://localhost:5000';
    }

    // Backend API URL (Accounts Service - port 8080)
    if (runtimeEnv.VITE_BACKEND_API_URL && !(isProduction && isLocalhostUrl(runtimeEnv.VITE_BACKEND_API_URL))) {
      config.backendApiUrl = runtimeEnv.VITE_BACKEND_API_URL;
    } else if (viteEnv.VITE_BACKEND_API_URL && !(isProduction && isLocalhostUrl(viteEnv.VITE_BACKEND_API_URL))) {
      config.backendApiUrl = viteEnv.VITE_BACKEND_API_URL;
    } else if (isCodespaces && codespaceName) {
      config.backendApiUrl = `https://${codespaceName}-8080.${codespacesDomain}`;
    } else if (isNgrok) {
      config.backendApiUrl = '/proxy/backend';
    } else if (isProduction) {
      // In production, try to construct URL from window location  
      const protocol = window.location.protocol;
      
      if (hostname.includes('vercel.app')) {
        config.backendApiUrl = viteEnv.VITE_BACKEND_API_URL || '/api/accounts';
      } else if (hostname.includes('railway.app') || hostname.includes('up.railway.app')) {
        config.backendApiUrl = viteEnv.VITE_BACKEND_API_URL || `${protocol}//${hostname}/api/accounts`;
      } else {
        config.backendApiUrl = viteEnv.VITE_BACKEND_API_URL || '/api/accounts';
      }
      console.warn('⚠️ Production deployment detected but VITE_BACKEND_API_URL not set! Using fallback:', config.backendApiUrl);
    } else {
      config.backendApiUrl = 'http://localhost:8080';
    }

    // Products API URL (Products Service - port 8081)
    if (runtimeEnv.VITE_PRODUCTS_API_URL && !(isProduction && isLocalhostUrl(runtimeEnv.VITE_PRODUCTS_API_URL))) {
      config.productsApiUrl = runtimeEnv.VITE_PRODUCTS_API_URL;
    } else if (viteEnv.VITE_PRODUCTS_API_URL && !(isProduction && isLocalhostUrl(viteEnv.VITE_PRODUCTS_API_URL))) {
      config.productsApiUrl = viteEnv.VITE_PRODUCTS_API_URL;
    } else if (isCodespaces && codespaceName) {
      config.productsApiUrl = `https://${codespaceName}-8081.${codespacesDomain}`;
    } else if (isNgrok) {
      config.productsApiUrl = '/proxy/products';
    } else if (isProduction) {
      // In production, try to construct URL from window location
      // Check if we're on a standard deployment (vercel, netlify, railway, render, etc.)
      const protocol = window.location.protocol;
      const port = window.location.port;
      
      // If there's a specific products service URL pattern, use it
      // Otherwise fallback to relative path (requires API gateway/reverse proxy)
      if (hostname.includes('vercel.app')) {
        // Vercel deployment - use environment API endpoint
        config.productsApiUrl = viteEnv.VITE_PRODUCTS_API_URL || '/api/products';
      } else if (hostname.includes('railway.app') || hostname.includes('up.railway.app')) {
        // Railway deployment - each service should have its own URL
        config.productsApiUrl = viteEnv.VITE_PRODUCTS_API_URL || `${protocol}//${hostname}/api/products`;
      } else {
        // Generic production deployment
        config.productsApiUrl = viteEnv.VITE_PRODUCTS_API_URL || '/api/products';
      }
      console.warn('⚠️ Production deployment detected but VITE_PRODUCTS_API_URL not set! Using fallback:', config.productsApiUrl);
    } else {
      config.productsApiUrl = 'http://localhost:8081';
    }

    // Environment
    config.environment = viteEnv.VITE_ENVIRONMENT || 
                        runtimeEnv.VITE_ENVIRONMENT || 
                        config.environment;

    console.log('🔧 Environment Configuration:', config);
    return config;
  }

  // Getter methods - check at runtime for ngrok
  getApiBaseUrl() {
    const hostname = window.location.hostname;
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    if (isNgrok) {
      return '/proxy/audio';
    }
    return this.config.apiBaseUrl;
  }

  getBackendApiUrl() {
    const hostname = window.location.hostname;
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    if (isNgrok) {
      return '/proxy/backend';
    }
    return this.config.backendApiUrl;
  }

  getProductsApiUrl() {
    const hostname = window.location.hostname;
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    if (isNgrok) {
      return '/proxy/products';
    }
    return this.config.productsApiUrl;
  }

  getEnvironment() {
    return this.config.environment;
  }

  isCodespaces() {
    return this.config.isCodespaces;
  }

  isLocalhost() {
    return this.config.isLocalhost;
  }

  isNgrok() {
    const hostname = window.location.hostname;
    return hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
  }

  isProduction() {
    return this.config.isProduction;
  }

  // Get full configuration
  getConfig() {
    const hostname = window.location.hostname;
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    return { 
      ...this.config,
      isNgrok,
      apiBaseUrl: isNgrok ? '/proxy/audio' : this.config.apiBaseUrl,
      backendApiUrl: isNgrok ? '/proxy/backend' : this.config.backendApiUrl,
      productsApiUrl: isNgrok ? '/proxy/products' : this.config.productsApiUrl,
    };
  }
}

// Create singleton instance
const envConfig = new EnvironmentConfig();

export default envConfig;

// Named exports for convenience
export const {
  getApiBaseUrl,
  getBackendApiUrl,
  getProductsApiUrl,
  getEnvironment,
  isCodespaces,
  isLocalhost,
  isProduction,
  getConfig
} = envConfig;
