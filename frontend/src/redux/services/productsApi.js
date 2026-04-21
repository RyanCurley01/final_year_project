import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import envConfig from '../../config/environment.js';
import { getServiceUrl } from './api';
import { fixTextDeep } from '../../utils/fixText';

// Check for ngrok at request time
const isNgrokHost = () => {
  const hostname = window.location.hostname;
  return hostname.includes('ngrok-free.dev') || hostname.includes('ngrok-free.app') || hostname.includes('ngrok.io');
};

const getProductsServiceBaseUrl = () => {
  const serviceUrl = getServiceUrl('PRODUCTS');
  return `${serviceUrl}/api/products`;
};

// Dynamic base query that gets the URL at request time
const dynamicBaseQuery = async (args, api, extraOptions) => {
  const baseUrl = getProductsServiceBaseUrl();
  
  // Normalize args to object with url
  let requestArgs = typeof args === 'string' ? { url: args } : { ...args };
  
  // Prepend base URL
  requestArgs.url = `${baseUrl}${requestArgs.url}`;
  
  // Debug log to confirm URL
  console.log('Fetching Products from:', requestArgs.url);

  // Prepare headers
  const headers = requestArgs.headers ? new Headers(requestArgs.headers) : new Headers();
  
  if (isNgrokHost()) {
    headers.set('ngrok-skip-browser-warning', 'true');
  }

  // Handle Basic Auth if passed via custom 'auth' property in args
  if (requestArgs.auth) {
    const { email, password } = requestArgs.auth;
    if (email && password) {
      headers.set('Authorization', `Basic ${btoa(`${email}:${password}`)}`);
    }
    // Clean up custom property before passing to fetch
    delete requestArgs.auth;
  }
  
  // Update args with headers
  // We need to convert Headers object back to plain object/undefined for fetchBaseQuery if needed, 
  // but fetchBaseQuery supports a prepareHeaders function. 
  // However, since we are wrapping it, sending a headers object in args works best.
  requestArgs.headers = {};
  headers.forEach((value, key) => {
    requestArgs.headers[key] = value;
  });

  // Use fetch directly
  const fetchFn = fetchBaseQuery({ baseUrl: '' });
  const result = await fetchFn(requestArgs, api, extraOptions);
  // Fix mojibake / curly quotes in all string fields
  if (result.data) {
    result.data = fixTextDeep(result.data);
  }
  return result;
};

export const productsApi = createApi({
  reducerPath: 'productsApi',
  baseQuery: dynamicBaseQuery,
  tagTypes: ['Products'],
  keepUnusedDataFor: 1800, // Cache for 30 minutes (presigned URLs valid for 1 hour)
  endpoints: (builder) => ({
    getAllProducts: builder.query({
      query: (auth) => ({
        url: '/getAllProducts',
        auth: auth, // Pass auth object { email, password } here
      }),
      providesTags: ['Products'],
    }),
    getProductById: builder.query({
      query: ({ id, auth }) => ({
        url: `/${id}`,
        auth: auth,
      }),
      providesTags: (result, error, id) => [{ type: 'Products', id }],
    }),
  }),
});

export const { useGetAllProductsQuery, useGetProductByIdQuery } = productsApi;
