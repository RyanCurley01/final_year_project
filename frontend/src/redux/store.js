import { configureStore } from '@reduxjs/toolkit';

import playerReducer from './features/playerSlice';
import cartReducer from './features/cartSlice';
import purchaseReducer from './features/purchaseSlice';
import { aiServiceApi } from './services/apiService';

export const store = configureStore({
  reducer: {
    [aiServiceApi.reducerPath]: aiServiceApi.reducer,
    player: playerReducer,
    cart: cartReducer,
    purchase: purchaseReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(aiServiceApi.middleware),
});
