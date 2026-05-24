import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('PAYMENTS')}/api/payments`;
export const paymentService = {
  getAllPayments: async (email, password) => {
    return apiCall(BASE_URL, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getPaymentById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getPaymentsByOrderId: async (orderId, email, password) => {
    return apiCall(`${BASE_URL}/order/${orderId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  createPayment: async (paymentData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(paymentData),
    });
  },

  updatePayment: async (id, paymentData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(paymentData),
    });
  },

  deletePayment: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // POST /payments/paypal/orders  (was /paypal/create-order)
  createPayPalOrder: async (orderData, email, password) => {
    const options = { method: 'POST', body: JSON.stringify(orderData) };
    if (email && password) options.headers = getBasicAuthHeaders(email, password);
    return apiCall(`${BASE_URL}/paypal/orders`, options);
  },

  // POST /payments/paypal/orders/:id/capture  (was /paypal/capture-order/:id)
  capturePayPalOrder: async (paypalOrderId, captureData, email, password) => {
    const options = { method: 'POST', body: JSON.stringify(captureData || {}) };
    if (email && password) options.headers = getBasicAuthHeaders(email, password);
    return apiCall(`${BASE_URL}/paypal/orders/${paypalOrderId}/capture`, options);
  },

  processPayPalPayment: async (orderId, paymentData, email, password) => {
    return apiCall(`${BASE_URL}/paypal/${orderId}`, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(paymentData),
    });
  },
};