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
    
    console.log('🔍 Environment Detection:', {
      hostname,
      isCodespaces,
      isNgrok,
      codespaceName,
      codespacesDomain
    });
    
    // Get environment variables from different sources
    const viteEnv = import.meta.env || {};
    const runtimeEnv = window.ENV_CONFIG || {};
    
    let config = {
      environment: isCodespaces ? 'codespaces' : (isNgrok ? 'ngrok' : 'local'),
      isCodespaces,
      isNgrok,
      isLocalhost,
      codespaceName,
      codespacesDomain
    };

    // API Base URL (Audio Service)
    if (viteEnv.VITE_API_BASE_URL) {
      config.apiBaseUrl = viteEnv.VITE_API_BASE_URL;
    } else if (runtimeEnv.VITE_API_BASE_URL) {
      config.apiBaseUrl = runtimeEnv.VITE_API_BASE_URL;
    } else if (isCodespaces && codespaceName) {
      config.apiBaseUrl = `https://${codespaceName}-5000.${codespacesDomain}`;
    } else if (isNgrok) {
      // Use Vite proxy when accessed via ngrok
      config.apiBaseUrl = '/proxy/audio';
    } else if (viteEnv.VITE_AUDIO_SERVICE_URL) {
      config.apiBaseUrl = viteEnv.VITE_AUDIO_SERVICE_URL;
    } else {
      config.apiBaseUrl = 'http://localhost:5000';
    }

    // Backend API URL
    if (viteEnv.VITE_BACKEND_API_URL) {
      config.backendApiUrl = viteEnv.VITE_BACKEND_API_URL;
    } else if (runtimeEnv.VITE_BACKEND_API_URL) {
      config.backendApiUrl = runtimeEnv.VITE_BACKEND_API_URL;
    } else if (isCodespaces && codespaceName) {
      config.backendApiUrl = `https://${codespaceName}-8080.${codespacesDomain}`;
    } else if (isNgrok) {
      // Use Vite proxy when accessed via ngrok
      config.backendApiUrl = '/proxy/backend';
    } else {
      config.backendApiUrl = 'http://localhost:8080';
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

  // Get full configuration
  getConfig() {
    const hostname = window.location.hostname;
    const isNgrok = hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
    return { 
      ...this.config,
      isNgrok,
      apiBaseUrl: isNgrok ? '/proxy/audio' : this.config.apiBaseUrl,
      backendApiUrl: isNgrok ? '/proxy/backend' : this.config.backendApiUrl,
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
  getEnvironment,
  isCodespaces,
  isLocalhost,
  getConfig
} = envConfig;
