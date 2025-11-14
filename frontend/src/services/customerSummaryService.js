import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('CUSTOMER_SUMMARY')}/api/customerSummary`;

export const customerSummaryService = {
  // Get all customer summaries
  getAllCustomerSummaries: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllCustomerSummaries`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get customer summary by ID
  getCustomerSummaryById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get customer summary by account ID
  getCustomerSummaryByAccountId: async (accountId, email, password) => {
    return apiCall(`${BASE_URL}/account/${accountId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Create customer summary
  createCustomerSummary: async (summaryData, email, password) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(summaryData),
    });
  },

  // Update customer summary
  updateCustomerSummary: async (id, summaryData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(summaryData),
    });
  },

  // Delete customer summary
  deleteCustomerSummary: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
