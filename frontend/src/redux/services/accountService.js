import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ACCOUNTS')}/api/accounts`;
export const accountService = {
  login: async (email, password) => {
    return apiCall(`${BASE_URL}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  firebaseLogin: async (token, email, uid, name = null, phoneNumber = null, password = null) => {
    const payload = { token, email, uid };
    if (name) payload.name = name;
    if (phoneNumber) payload.phoneNumber = phoneNumber;
    if (password) payload.password = password;

    return apiCall(`${BASE_URL}/firebase-login`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  register: async (accountData) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
  },

  getAllAccounts: async (email, password) => {
    return apiCall(BASE_URL, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  getAccountById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  updateAccount: async (id, accountData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(accountData),
    });
  },

  deleteAccount: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};