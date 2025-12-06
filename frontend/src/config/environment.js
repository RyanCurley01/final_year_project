// src/config/environment.js
// Dynamic environment configuration that works in both local and Codespaces

class EnvironmentConfig {
  constructor() {
    this.config = this.detectEnvironment();
  }

  detectEnvironment() {
    const hostname = window.location.hostname;
    const isCodespaces = hostname.includes('app.github.dev');
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
      codespaceName,
      codespacesDomain
    });
    
    // Get environment variables from different sources
    const viteEnv = import.meta.env || {};
    const runtimeEnv = window.ENV_CONFIG || {};
    
    let config = {
      environment: isCodespaces ? 'codespaces' : 'local',
      isCodespaces,
      isLocalhost,
      codespaceName,
      codespacesDomain
    };

    // API Base URL (AI Service)
    if (viteEnv.VITE_API_BASE_URL) {
      config.apiBaseUrl = viteEnv.VITE_API_BASE_URL;
    } else if (runtimeEnv.VITE_API_BASE_URL) {
      config.apiBaseUrl = runtimeEnv.VITE_API_BASE_URL;
    } else if (isCodespaces && codespaceName) {
      config.apiBaseUrl = `https://${codespaceName}-5000.${codespacesDomain}`;
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
    } else {
      config.backendApiUrl = 'http://localhost:8080';
    }

    // YouTube Channel ID
    config.youtubeChannelId = viteEnv.VITE_YOUTUBE_CHANNEL_ID || 
                             runtimeEnv.VITE_YOUTUBE_CHANNEL_ID || 
                             '@Ritrix252';

    // Environment
    config.environment = viteEnv.VITE_ENVIRONMENT || 
                        runtimeEnv.VITE_ENVIRONMENT || 
                        config.environment;

    console.log('🔧 Environment Configuration:', config);
    return config;
  }

  // Getter methods
  getApiBaseUrl() {
    return this.config.apiBaseUrl;
  }

  getBackendApiUrl() {
    return this.config.backendApiUrl;
  }

  getYouTubeChannelId() {
    return this.config.youtubeChannelId;
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

  // Get full configuration
  getConfig() {
    return { ...this.config };
  }
}

// Create singleton instance
const envConfig = new EnvironmentConfig();

export default envConfig;

// Named exports for convenience
export const {
  getApiBaseUrl,
  getBackendApiUrl, 
  getYouTubeChannelId,
  getEnvironment,
  isCodespaces,
  isLocalhost,
  getConfig
} = envConfig;
