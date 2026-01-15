// src/redux/services/apiService.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Check for ngrok at request time
const isNgrokHost = () => {
  const hostname = window.location.hostname;
  return hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
};

const getAudioServiceBaseUrl = () => {
  // Check for environment variable first (production/Vercel)
  if (import.meta.env.VITE_AUDIO_SERVICE_URL) {
    return `${import.meta.env.VITE_AUDIO_SERVICE_URL}/api`;
  }
  
  if (isNgrokHost()) {
    console.log('🎵 Using ngrok proxy for audio service');
    return '/proxy/audio/api';
  }
  
  // Check for Codespaces
  const hostname = window.location.hostname;
  if (hostname.includes('app.github.dev')) {
    const parts = hostname.split('.');
    const firstPart = parts[0];
    const lastDashIndex = firstPart.lastIndexOf('-');
    const codespaceName = firstPart.substring(0, lastDashIndex);
    return `https://${codespaceName}-5000.app.github.dev/api`;
  }
  
  return 'http://localhost:5000/api';
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
  
  console.log('🎵 Audio Service Request:', adjustedArgs);
  
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