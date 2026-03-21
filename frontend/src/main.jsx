// React Core imports
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Redux bindings for React
import { Provider } from 'react-redux'

// PersistGate delays UI rendering until the saved state (like cart items) finishes loading from localStorage
import { PersistGate } from 'redux-persist/integration/react'

// BrowserRouter: Enables client-side URL routing without reloading the page.
import { BrowserRouter } from 'react-router-dom'

// PayPal SDK provider for integrating UI payment buttons
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

// Importing the global Redux store and the initialized persistor
import { store, persistor } from './redux/store'

// Global CSS styles (Tailwind utilities are compiled into here)
import './index.css'
import App from './App.jsx'

// Bootstrap CSS mapping imported directly
import 'bootstrap/dist/css/bootstrap.min.css';

// PayPal configuration object containing setup rules.
const paypalOptions = {
  // Pulls the client ID from the .env file. Falls back to "test" sandbox mode if the variable is missing.
  "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "test",
  currency: "EUR", // Sets the default checkout currency.
  // "capture" tells PayPal to immediately authorize and capture the funds upon user approval, rather than just pre-authorizing.
  intent: "capture", 
};

// createRoot mounts the entire React application into the basic <div id="root"> element found in index.html
createRoot(document.getElementById('root')).render(
  // StrictMode: A React developer tool that double-renders components in dev mode to catch lifecycle bugs and deprecation warnings.
  <StrictMode>
    {/* Provider makes the global Redux `store` available to all child components via `useSelector` */}
    <Provider store={store}>
      {/* PersistGate forces the app to wait (loading={null}) until the Redux state is hydrated from local storage. */}
      <PersistGate loading={null} persistor={persistor}>
        {/* BrowserRouter enables standard modern web navigation using the History API. */}
        <BrowserRouter>
          {/* PayPalScriptProvider asynchronously injects the official PayPal Javascript SDK into the document head using the options defined above. */}
          <PayPalScriptProvider options={paypalOptions}>
            {/* App is the top-level application component that contains all route logic. */}
            <App />
          </PayPalScriptProvider>
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </StrictMode>,
)
