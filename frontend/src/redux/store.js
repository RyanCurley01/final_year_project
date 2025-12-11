import { configureStore } from '@reduxjs/toolkit';

import playerReducer from './features/playerSlice';
import cartReducer from './features/cartSlice';
import purchaseReducer from './features/purchaseSlice';
import { youtubeApi } from './services/youtubeApi';

export const store = configureStore({
  reducer: {
    [youtubeApi.reducerPath]: youtubeApi.reducer,
    player: playerReducer,
    cart: cartReducer,
    purchase: purchaseReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(youtubeApi.middleware),
});
