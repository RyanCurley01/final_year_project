// src/redux/services/apiService.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import envConfig from '../../config/environment.js';

// Get the API base URL using our environment configuration
const API_BASE_URL = envConfig.getApiBaseUrl();

console.log('🎵 AI Service API Configuration:', {
  baseUrl: API_BASE_URL,
  environment: envConfig.getEnvironment(),
  isCodespaces: envConfig.isCodespaces()
});

export const aiServiceApi = createApi({
  reducerPath: 'aiServiceApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_BASE_URL}/api`,
  }),
  tagTypes: ['TopPlayedSongs'],
  endpoints: (builder) => ({
    getTopPlayedSongs: builder.query({
      query: (limit = 1) => `/songs/top-played?limit=${limit}`,
      providesTags: ['TopPlayedSongs'],
      // Refresh every 1 second to reflect new plays
      pollingInterval: 1000,
    }),
    recordInteraction: builder.mutation({
      query: (interaction) => ({
        url: '/interactions/record',
        method: 'POST',
        body: interaction,
      }),
      invalidatesTags: ['TopPlayedSongs'], // Force immediate refetch of top played songs
    }),
  }),
});

export const { useGetTopPlayedSongsQuery, useRecordInteractionMutation } = aiServiceApi;