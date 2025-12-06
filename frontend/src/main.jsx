import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './redux/store'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import { accountService } from './redux/services/accountService';
import { productService } from './redux/services/productService';
import { orderService } from './redux/services/orderService';
import { paymentService } from './redux/services/paymentService';
import { wishlistService } from './redux/services/wishlistService';
import { stockService } from './redux/services/stockService';

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
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
