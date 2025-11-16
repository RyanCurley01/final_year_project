// src/redux/services/youtubeApi.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const youtubeApi = createApi({
  reducerPath: 'youtubeApi',
  baseQuery: fetchBaseQuery({
    baseUrl: 'http://localhost:5000/api', // Your backend URL
  }),
  endpoints: (builder) => ({
    getTopSongs: builder.query({ 
      query: () => '/youtube/top-songs',
      // Optional: add polling for real-time updates
      // pollingInterval: 60000, // Refresh every minute
    }),
  }),
});

export const { useGetTopSongsQuery } = youtubeApi;