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
      pollingInterval: 60000, // Poll every 60 seconds
    }),
  }),
});

export const { useGetTopSongsQuery } = youtubeApi;