// store.js, acts as the central command center for your entire React application's global state. 
// It combines all your individual slice reducers, configures local storage persistence 
// (so users don't lose their cart when they refresh the page), and wires up API caching middleware.

//configureStore: A Redux Toolkit function that replaces the legacy createStore(). 
//It automatically sets up the Redux DevTools extension and includes helpful default middleware behind the scenes.
import { configureStore } from '@reduxjs/toolkit';

// persistStore, persistReducer: Functions from the redux-persist library. 
// They allow you to take pieces of your Redux state and automatically save them to the browser's local storage. 
// When the user returns, the state is rehydrated automatically.
import { persistStore, persistReducer } from 'redux-persist';

// storage: This specific import points to the browser's 
// localStorage engine (as opposed to sessionStorage or React Native's AsyncStorage).
import storage from 'redux-persist/lib/storage';

import playerReducer from './features/playerSlice';
import cartReducer from './features/cartSlice';
import purchaseReducer from './features/purchaseSlice';
import wishlistReducer from './features/wishlistSlice';
import matchReducer from './features/matchCacheSlice';

import { musicServiceApi } from './services/apiService';
import { productsApi } from './services/productsApi';

// persistConfig: This object tells redux-persist how to behave.
const persistConfig = {
  // key: 'root': The top-level key under which the data will be saved inside the browser's localStorage.
  key: 'root',

  // Instructs the library to use localStorage
  storage,
};

//This line takes the standard cartReducer and wraps it in a special outer reducer. Now, whenever the cart state changes (e.g., an item is added), 
// this wrapped reducer automatically serializes that state and saves it to localStorage under persist:root.
const persistedCartReducer = persistReducer(persistConfig, cartReducer);

// This single object defines the entire global state tree of the application.
export const store = configureStore({
  reducer: {
    // API Reducers: The lines [musicServiceApi.reducerPath]: musicServiceApi.reducer use computed property names (the brackets []). 
    // RTK Query automatically generates a distinct name (like 'api') and its own reducer to manage the cache layer.
    // This dynamically injects them into the global store.
    [musicServiceApi.reducerPath]: musicServiceApi.reducer,
    [productsApi.reducerPath]: productsApi.reducer,

    // Standard Reducers: Keys like player, cart, purchase, and wishlist dictate what the state looks like. 
    // For instance, state.cart.items maps directly to the cart key defined here, which points to the persistedCartReducer.
    player: playerReducer,
    cart: persistedCartReducer,
    purchase: purchaseReducer,
    wishlist: wishlistReducer,
    matchCache: matchReducer
  },

  // Middleware Configurations
  // getDefaultMiddleware: Redux Toolkit provides default middleware that checks for common beginner mistakes.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      
      // serializableCheck: redux-persist dispatches internal actions (like persist/PERSIST) 
      // that contain non-serializable data. To prevent Redux Toolkit from throwing console errors, 
      // we tell the middleware to completely "ignore" these specific action types.
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE', 'persist/PAUSE', 'persist/PERSIST', 'persist/PURGE', 'persist/REGISTER'],
      },

    // .concat(...): Appends the necessary middleware from the RTK Query APIs. 
    // This is required for RTK Query to function correctly—it enables 
    // powerful features like caching, cache invalidation, and polling.
    }).concat(musicServiceApi.middleware).concat(productsApi.middleware),
});

// persistor: Wraps the fully configured store into a persistor object. 
// Typically wrapped around the App's root <Provider> with a <PersistGate> to delay UI rendering 
// until saved data has been fully retrieved from localStorage.
export const persistor = persistStore(store);
