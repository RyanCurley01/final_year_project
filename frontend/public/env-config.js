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
// };

// NOTE: In production (Vercel/Railway), these are overridden by environment variables
// This file is only used as a fallback for local development
// For production, set these values in your hosting platform's environment variables
window.ENV_CONFIG = {
  "VITE_API_BASE_URL": import.meta?.env?.VITE_API_BASE_URL || "",
  "VITE_BACKEND_API_URL": import.meta?.env?.VITE_BACKEND_API_URL || "",
  "VITE_PRODUCTS_API_URL": import.meta?.env?.VITE_PRODUCTS_API_URL || "",
  "VITE_ENVIRONMENT": import.meta?.env?.VITE_ENVIRONMENT || "production",
  "VITE_PAYPAL_CLIENT_ID": import.meta?.env?.VITE_PAYPAL_CLIENT_ID || "",
};
