import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ORDERS')}/api/orders`;

export const orderService = {
  // Get all orders
  getAllOrders: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllOrders`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get order by ID
  getOrderById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get orders by account ID
  getOrdersByAccountId: async (accountId, email, password) => {
    return apiCall(`${BASE_URL}/account/${accountId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create order
  createOrder: async (orderData, email, password) => {
    const options = {
      method: 'POST',
      body: JSON.stringify(orderData),
    };
    if (email && password) {
      options.headers = getBasicAuthHeaders(email, password);
    }
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
