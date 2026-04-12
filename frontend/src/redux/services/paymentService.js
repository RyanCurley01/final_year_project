import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('PAYMENTS')}/api/payments`;

export const paymentService = {
  // Get all payments
  getAllPayments: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllPayments`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get payment by ID
  getPaymentById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get payments by order ID
  getPaymentsByOrderId: async (orderId, email, password) => {
    return apiCall(`${BASE_URL}/order/${orderId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create payment
  createPayment: async (paymentData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(paymentData),
    });
  },

  // Update payment
  updatePayment: async (id, paymentData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(paymentData),
    });
  },

  // Delete payment
  deletePayment: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },

    // Create PayPal Order
  createPayPalOrder: async (orderData, email, password) => {
    const options = {
      method: 'POST',
      body: JSON.stringify(orderData),
    };
    if (email && password) {
      options.headers = getBasicAuthHeaders(email, password);
    }
    return apiCall(`${BASE_URL}/paypal/create-order`, options);
  },

  // Capture PayPal Order
  capturePayPalOrder: async (paypalOrderId, captureData, email, password) => {
    const options = {
      method: 'POST',
      body: JSON.stringify(captureData || {}),
    };
    if (email && password) {
      options.headers = getBasicAuthHeaders(email, password);
    }
    return apiCall(`${BASE_URL}/paypal/capture-order/${paypalOrderId}`, options);
  },
  
  // Process PayPal payment
  processPayPalPayment: async (orderId, paymentData, email, password) => {
    return apiCall(`${BASE_URL}/paypal/${orderId}`, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(paymentData),
    });
  },
};
