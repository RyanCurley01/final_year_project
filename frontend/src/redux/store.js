import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import playerReducer from './features/playerSlice';
import cartReducer from './features/cartSlice';
import purchaseReducer from './features/purchaseSlice';
import wishlistReducer from './features/wishlistSlice';
import { musicServiceApi } from './services/apiService';
import { productsApi } from './services/productsApi';

const persistConfig = {
  key: 'root',
  storage,
};

const persistedCartReducer = persistReducer(persistConfig, cartReducer);
// Optionally persist other reducers as needed
// const persistedWishlistReducer = persistReducer(persistConfig, wishlistReducer);

export const store = configureStore({
  reducer: {
    [musicServiceApi.reducerPath]: musicServiceApi.reducer,
    [productsApi.reducerPath]: productsApi.reducer,
    player: playerReducer,
    cart: persistedCartReducer,
    purchase: purchaseReducer,
    wishlist: wishlistReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE', 'persist/PAUSE', 'persist/PERSIST', 'persist/PURGE', 'persist/REGISTER'],
      },
    }).concat(musicServiceApi.middleware).concat(productsApi.middleware),
});

export const persistor = persistStore(store);
