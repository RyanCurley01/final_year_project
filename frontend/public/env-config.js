// Runtime environment configuration
// This file can be updated at runtime (after build) to override API URLs
// Useful for production deployments where you don't want to rebuild
// 
// For production deployments:
// 1. Replace localhost URLs with your actual production API URLs
// 2. Set VITE_ENVIRONMENT to "production"
//
// Example production configuration:
// window.ENV_CONFIG = {
//   "VITE_API_BASE_URL": "https://api.yourdomain.com",
//   "VITE_BACKEND_API_URL": "https://api.yourdomain.com/accounts",
//   "VITE_PRODUCTS_API_URL": "https://api.yourdomain.com/products",
//   "VITE_ENVIRONMENT": "production",
//   "VITE_YOUTUBE_CHANNEL_ID": "@Ritrix252"
// };

window.ENV_CONFIG = {
  "VITE_API_BASE_URL": "http://localhost:5000",
  "VITE_BACKEND_API_URL": "http://localhost:8080",
  "VITE_PRODUCTS_API_URL": "http://localhost:8081",
  "VITE_ENVIRONMENT": "local",
  "VITE_YOUTUBE_CHANNEL_ID": "@Ritrix252"
};
