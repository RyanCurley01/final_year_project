import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    watch: {
      usePolling: true,
    },
    proxy: {
      // Use host.docker.internal to reach services exposed on the host
      '/proxy/audio': {
        target: 'http://host.docker.internal:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/audio/, ''),
      },
      '/proxy/backend': {
        target: 'http://host.docker.internal:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/backend/, ''),
      },
      '/proxy/products': {
        target: 'http://host.docker.internal:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/products/, ''),
      },
      '/proxy/orders': {
        target: 'http://host.docker.internal:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/orders/, ''),
      },
      '/proxy/payments': {
        target: 'http://host.docker.internal:8083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/payments/, ''),
      },
      '/proxy/stock': {
        target: 'http://host.docker.internal:8084',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/stock/, ''),
      },
      '/proxy/wishlist': {
        target: 'http://host.docker.internal:8085',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/wishlist/, ''),
      },
      '/proxy/order-items': {
        target: 'http://host.docker.internal:8086',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/order-items/, ''),
      },
      '/proxy/customer-summary': {
        target: 'http://host.docker.internal:8087',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/customer-summary/, ''),
      },
      '/proxy/sold-products': {
        target: 'http://host.docker.internal:8089',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/sold-products/, ''),
      },
    },
    hmr: {
      host: process.env.CODESPACE_NAME 
        ? `${process.env.CODESPACE_NAME}-5173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
        : 'localhost',
      protocol: process.env.CODESPACE_NAME ? 'wss' : 'ws',
    }
  }
})
