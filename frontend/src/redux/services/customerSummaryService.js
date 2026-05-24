import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('CUSTOMER_SUMMARY')}/api/customer-summary`;
export const customerSummaryService = {
  getAllCustomerSummaries: async (email, password) => {
    return apiCall(BASE_URL, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getCustomerSummaryById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getCustomerSummaryByAccountId: async (accountId, email, password) => {
    return apiCall(`${BASE_URL}/account/${accountId}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  createCustomerSummary: async (summaryData, email, password) => {
    const options = { method: 'POST', body: JSON.stringify(summaryData) };
    if (email && password) options.headers = getBasicAuthHeaders(email, password);
    return apiCall(BASE_URL, options);
  },

  updateCustomerSummary: async (id, summaryData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(summaryData),
    });
  },

  deleteCustomerSummary: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};