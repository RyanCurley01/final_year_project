import { configureStore } from '@reduxjs/toolkit';

import playerReducer from './features/playerSlice';
import cartReducer from './features/cartSlice';
import purchaseReducer from './features/purchaseSlice';
import wishlistReducer from './features/wishlistSlice';
import { musicServiceApi } from './services/apiService';
import { productsApi } from './services/productsApi';

export const store = configureStore({
  reducer: {
    [musicServiceApi.reducerPath]: musicServiceApi.reducer,
    [productsApi.reducerPath]: productsApi.reducer,
    player: playerReducer,
    cart: cartReducer,
    purchase: purchaseReducer,
    wishlist: wishlistReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(musicServiceApi.middleware).concat(productsApi.middleware),
});
