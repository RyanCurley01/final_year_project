import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ORDER_ITEMS')}/api/orderItems`;

export const orderItemService = {
  // Get all order items
  getAllOrderItems: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllOrderItems`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get order item by ID
  getOrderItemById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get order items by order ID
  getOrderItemsByOrderId: async (orderId, email, password) => {
    return apiCall(`${BASE_URL}/order/${orderId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create order item
  createOrderItem: async (orderItemData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(orderItemData),
    });
  },

  // Update order item
  updateOrderItem: async (id, orderItemData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(orderItemData),
    });
  },

  // Delete order item
  deleteOrderItem: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
