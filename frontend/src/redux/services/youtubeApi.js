// src/redux/services/youtubeApi.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import envConfig from '../../config/environment.js';

// Get the API base URL using our environment configuration
const API_BASE_URL = envConfig.getApiBaseUrl();

console.log('🎵 YouTube API Configuration:', {
  baseUrl: API_BASE_URL,
  environment: envConfig.getEnvironment(),
  isCodespaces: envConfig.isCodespaces()
});

export const youtubeApi = createApi({
  reducerPath: 'youtubeApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_BASE_URL}/api`,
  }),
  endpoints: (builder) => ({
    getTopSongs: builder.query({ 
      query: () => '/youtube/top-songs',
      pollingInterval: 60000, // Poll every 60 seconds
    }),
  }),
});

export const { useGetTopSongsQuery } = youtubeApi;