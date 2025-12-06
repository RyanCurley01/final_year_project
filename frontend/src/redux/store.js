import { configureStore } from '@reduxjs/toolkit';

import playerReducer from './features/playerSlice';
import { youtubeApi } from './services/youtubeApi';

export const store = configureStore({
  reducer: {
    [youtubeApi.reducerPath]: youtubeApi.reducer,
    player: playerReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(youtubeApi.middleware),
});
