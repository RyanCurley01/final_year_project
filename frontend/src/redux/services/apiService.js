// src/redux/services/apiService.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import envConfig from '../../config/environment.js';

// Check for ngrok at request time
const isNgrokHost = () => {
  const hostname = window.location.hostname;
  return hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
};

const getAudioServiceBaseUrl = () => {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // IMPORTANT: Check localhost FIRST - always use localhost URLs when running locally
  // This prevents CORS issues from trying to use production URLs during local development
  if (isLocalhost) {
    return 'http://localhost:5000/api';
  }
  
  if (isNgrokHost()) {
    return '/proxy/audio/api';
  }
  
  // Check for Codespaces
  if (hostname.includes('app.github.dev')) {
    const parts = hostname.split('.');
    const firstPart = parts[0];
    const lastDashIndex = firstPart.lastIndexOf('-');
    const codespaceName = firstPart.substring(0, lastDashIndex);
    return `https://${codespaceName}-5000.app.github.dev/api`;
  }
  
  // In production, check for environment variable
  if (import.meta.env.VITE_AUDIO_SERVICE_URL) {
    return `${import.meta.env.VITE_AUDIO_SERVICE_URL}/api`;
  }
  
  // Use environment configuration (handles production and local)
  const apiBaseUrl = envConfig.getApiBaseUrl();
  return `${apiBaseUrl}/api`;
};

// Dynamic base query that gets the URL at request time
const dynamicBaseQuery = async (args, api, extraOptions) => {
  const baseUrl = getAudioServiceBaseUrl();
  
  // Modify the URL to include the base URL
  const adjustedUrl = typeof args === 'string' 
    ? `${baseUrl}${args}`
    : `${baseUrl}${args.url}`;
  
  const adjustedArgs = typeof args === 'string'
    ? adjustedUrl
    : { ...args, url: adjustedUrl };
  
  // Build headers with ngrok bypass if needed
  const headers = {};
  if (isNgrokHost()) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  
  // Use fetch directly
  const fetchFn = fetchBaseQuery({ 
    baseUrl: '',
    prepareHeaders: (defaultHeaders) => {
      if (isNgrokHost()) {
        defaultHeaders.set('ngrok-skip-browser-warning', 'true');
      }
      return defaultHeaders;
    }
  });
  return fetchFn(adjustedArgs, api, extraOptions);
};

export const musicServiceApi = createApi({
  reducerPath: 'musicServiceApi',
  baseQuery: dynamicBaseQuery,
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

export const { useGetTopPlayedSongsQuery, useRecordInteractionMutation } = musicServiceApi;