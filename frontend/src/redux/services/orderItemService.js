import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ORDER_ITEMS')}/api/order-items`;
export const orderItemService = {
  getAllOrderItems: async (email, password) => {
    return apiCall(BASE_URL, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getOrderItemById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getOrderItemsByOrderId: async (orderId, email, password) => {
    const options = {};
    if (email && password && password !== 'undefined') {
      options.headers = getBasicAuthHeaders(email, password);
    }
    return apiCall(`${BASE_URL}/order/${orderId}`, options);
  },

  createOrderItem: async (orderItemData, email, password) => {
    const options = { method: 'POST', body: JSON.stringify(orderItemData) };
    if (email && password) options.headers = getBasicAuthHeaders(email, password);
    return apiCall(BASE_URL, options);
  },

  updateOrderItem: async (id, orderItemData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(orderItemData),
    });
  },

  deleteOrderItem: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};