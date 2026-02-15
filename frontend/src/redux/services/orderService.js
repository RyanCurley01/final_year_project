import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ORDERS')}/api/orders`;

export const orderService = {
  // Get all orders
  getAllOrders: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllOrders`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get order by ID (public access for verification)
  getOrderById: async (id) => {
    return apiCall(`${BASE_URL}/${id}`);
  },

  // Get orders by account ID
  getOrdersByAccountId: async (accountId) => {
    // Public endpoint for customer viewing their own orders
    return apiCall(`${BASE_URL}/account/${accountId}`);
  },

  // Create order
  createOrder: async (orderData) => {
    const options = {
      method: 'POST',
      body: JSON.stringify(orderData),
      // Explicitly NO headers for createOrder as it is a public endpoint
      // Sending invalid/partial Basic Auth headers causes 401 even on permitted endpoints
    };
    return apiCall(BASE_URL, options);
  },

  // Update order
  updateOrder: async (id, orderData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(orderData),
    });
  },

  // Delete order (Manager only)
  deleteOrder: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
