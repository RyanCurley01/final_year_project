import { getServiceUrl, apiCall, getBasicAuthHeaders } from './api';

const BASE_URL = `${getServiceUrl('ACCOUNTS')}/api/accounts`;

export const accountService = {
  // Login
  login: async (email, password) => {
    return apiCall(`${BASE_URL}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // Firebase Login/Sync
  firebaseLogin: async (token, email, uid, name = null, phoneNumber = null, password = null) => {
    console.log("DEBUG (accountService): Preparing firebase-login payload");
    console.log("DEBUG (accountService): Token valid?", !!token, "Length:", token ? token.length : 0);

    const payload = { token, email, uid };
    if (name) payload.name = name;
    if (phoneNumber) payload.phoneNumber = phoneNumber;
    if (password) payload.password = password;
    
    console.log("DEBUG (accountService): Sending request to:", `${BASE_URL}/firebase-login`);
    console.log("DEBUG (accountService): Payload keys:", Object.keys(payload));

    const result = await apiCall(`${BASE_URL}/firebase-login`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log("DEBUG (accountService): Response received:", result);
    return result;
  },

  // Register new account
  register: async (accountData) => {
    return apiCall(BASE_URL, {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
  },

  // Get all accounts (Manager only)
  getAllAccounts: async (email, password) => {
    return apiCall(`${BASE_URL}/getAllAccounts`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Get account by ID
  getAccountById: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      headers: getBasicAuthHeaders(email, password),
    });
  },

  // Update account
  updateAccount: async (id, accountData, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getBasicAuthHeaders(email, password),
      body: JSON.stringify(accountData),
    });
  },

  // Delete account (Manager only)
  deleteAccount: async (id, email, password) => {
    return apiCall(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getBasicAuthHeaders(email, password),
    });
  },
};
