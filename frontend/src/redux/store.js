import { configureStore } from '@reduxjs/toolkit';

import playerReducer from './features/playerSlice';
import cartReducer from './features/cartSlice';
import purchaseReducer from './features/purchaseSlice';
import { musicServiceApi } from './services/apiService';
import { productsApi } from './services/productsApi';

export const store = configureStore({
  reducer: {
    [musicServiceApi.reducerPath]: musicServiceApi.reducer,
    [productsApi.reducerPath]: productsApi.reducer,
    player: playerReducer,
    cart: cartReducer,
    purchase: purchaseReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(musicServiceApi.middleware).concat(productsApi.middleware),
});
