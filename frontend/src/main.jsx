import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import { accountService } from './services/accountService';
import { productService } from './services/productService';
import { orderService } from './services/orderService';
import { paymentService } from './services/paymentService';
import { wishlistService } from './services/wishlistService';
import { stockService } from './services/stockService';

// Expose services to window for console testing (development only)
if (import.meta.env.DEV) {
  window.accountService = accountService;
  window.productService = productService;
  window.orderService = orderService;
  window.paymentService = paymentService;
  window.wishlistService = wishlistService;
  window.stockService = stockService;
  console.log('✅ Services loaded! Available: accountService, productService, orderService, paymentService, wishlistService, stockService');
  console.log('Test with: await window.accountService.login("email", "password")');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
