import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('STOCK')}/api/stock`;

export const stockService = {
  // Get all stock
  getAllStock: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllStock`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get stock by StockID
  getStockById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get stock by ProductID
  getStockByProductId: async (productId, email, password) => {
    return apiCall(`${BASE_URL}/getAllStock?productId=${productId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create stock (Manager only)
  createStock: async (stockData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(stockData),
    });
  },

  // Update stock (Manager only)
  updateStock: async (id, stockData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(stockData),
    });
  },

  // Delete stock (Manager only)
  deleteStock: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // WebSocket connection for real-time updates
  connectWebSocket: (onMessage, onError) => {
    // Use environment-aware WebSocket URL
    const wsBaseUrl = getServiceUrl('STOCK');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = wsBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const wsUrl = `${wsProtocol}//${wsHost}/ws/stock`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      // WebSocket connected
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };
    
    ws.onerror = (error) => {
      if (onError) onError(error);
    };
    
    ws.onclose = () => {
      // WebSocket disconnected
    };
    
    return ws;
  },
};
