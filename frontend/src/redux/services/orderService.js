import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ORDERS')}/api/orders`;
export const orderService = {
  getAllOrders: async (email, password) => {
    return apiCall(BASE_URL, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getOrderById: async (id) => {
    return apiCall(`${BASE_URL}/${id}`);
  },

  getOrdersByAccountId: async (accountId) => {
    return apiCall(`${BASE_URL}/account/${accountId}`);
  },

  createOrder: async (orderData) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  updateOrder: async (id, orderData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(orderData),
    });
  },

  deleteOrder: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};