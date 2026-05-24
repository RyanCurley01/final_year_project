package com.example.accounts.controller;

import com.example.accounts.dto.AccountResponse;
import com.example.accounts.dto.LoginRequest;
import com.example.accounts.dto.LoginResponse;
import com.example.accounts.model.Account;
import com.example.accounts.service.AccountService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.ErrorCode;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.mockito.MockedStatic;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration Tests for AccountController
 * These tests simulate HTTP requests and verify responses.
 *
 * Note: The base GET endpoint is mapped to /api/accounts (no trailing path segment).
 * The accountType query parameter filters results when provided.
 */
@WebMvcTest(AccountController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Account Controller Integration Tests")
class AccountControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AccountService accountService;

    @Autowired
    private ObjectMapper objectMapper;

    private Account testAccount;
    private AccountResponse testAccountResponse;

    @BeforeEach
    void setUp() {
        testAccount = new Account();
        testAccount.setId(1L);
        testAccount.setAccountName("John Doe");
        testAccount.setAccountEmailAddress("john@example.com");
        testAccount.setAccountPassword("password123");
        testAccount.setAccountPhoneNumber("1234567890");
        testAccount.setAccountType("Customer");

        testAccountResponse = new AccountResponse();
        testAccountResponse.setId(1L);
        testAccountResponse.setAccountName("John Doe");
        testAccountResponse.setAccountEmailAddress("john@example.com");
        testAccountResponse.setAccountPhoneNumber("1234567890");
        testAccountResponse.setAccountType("Customer");
    }

    // -------------------------------------------------------------------------
    // GET /api/accounts
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/accounts - Should return all accounts when no filter supplied")
    void testGetAllAccounts() throws Exception {
        // ARRANGE
        AccountResponse response2 = new AccountResponse();
        response2.setId(2L);
        response2.setAccountName("Jane Smith");
        response2.setAccountEmailAddress("jane@example.com");

        List<AccountResponse> accounts = Arrays.asList(testAccountResponse, response2);
        when(accountService.getAllAccountsResponse()).thenReturn(accounts);

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].accountName", is("John Doe")))
                .andExpect(jsonPath("$[1].accountName", is("Jane Smith")));
    }

    @Test
    @DisplayName("GET /api/accounts - Should return empty list when no accounts exist")
    void testGetAllAccountsEmpty() throws Exception {
        // ARRANGE
        when(accountService.getAllAccountsResponse()).thenReturn(Collections.emptyList());

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("GET /api/accounts?accountType=Customer - Should filter by account type")
    void testGetAllAccountsByType() throws Exception {
        // ARRANGE
        List<AccountResponse> customerAccounts = Arrays.asList(testAccountResponse);
        when(accountService.getAccountsByTypeResponse("Customer")).thenReturn(customerAccounts);

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts")
                .param("accountType", "Customer")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].accountType", is("Customer")));
    }

    @Test
    @DisplayName("GET /api/accounts?accountType= - Should ignore blank accountType and return all accounts")
    void testGetAllAccountsBlankType() throws Exception {
        // ARRANGE — blank string should fall through to getAllAccountsResponse
        List<AccountResponse> all = Arrays.asList(testAccountResponse);
        when(accountService.getAllAccountsResponse()).thenReturn(all);

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts")
                .param("accountType", "")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        verify(accountService).getAllAccountsResponse();
        verify(accountService, never()).getAccountsByTypeResponse(any());
    }

    // -------------------------------------------------------------------------
    // GET /api/accounts/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/accounts/{id} - Should return account by id")
    void testGetAccountById() throws Exception {
        // ARRANGE
        when(accountService.getAccountByIdResponse(1L)).thenReturn(Optional.of(testAccountResponse));

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts/1")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.accountName", is("John Doe")))
                .andExpect(jsonPath("$.accountEmailAddress", is("john@example.com")));
    }

    @Test
    @DisplayName("GET /api/accounts/{id} - Should return 404 when account not found")
    void testGetAccountByIdNotFound() throws Exception {
        // ARRANGE
        when(accountService.getAccountByIdResponse(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts/99")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // POST /api/accounts
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/accounts - Should create new account and return 201")
    void testCreateAccount() throws Exception {
        // ARRANGE
        when(accountService.createAccountResponse(any(Account.class))).thenReturn(testAccountResponse);

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testAccount)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accountName", is("John Doe")))
                .andExpect(jsonPath("$.accountEmailAddress", is("john@example.com")));
    }

    @Test
    @DisplayName("POST /api/accounts - Should return 400 when account data is invalid")
    void testCreateAccountInvalidData() throws Exception {
        // ARRANGE
        when(accountService.createAccountResponse(any(Account.class)))
                .thenThrow(new IllegalArgumentException("Email already exists"));

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testAccount)))
                .andExpect(status().isBadRequest());
    }

    // -------------------------------------------------------------------------
    // PUT /api/accounts/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("PUT /api/accounts/{id} - Should update account and return updated response")
    void testUpdateAccount() throws Exception {
        // ARRANGE
        AccountResponse updatedResponse = new AccountResponse();
        updatedResponse.setId(1L);
        updatedResponse.setAccountName("John Updated");
        updatedResponse.setAccountEmailAddress("john@example.com");
        updatedResponse.setAccountPhoneNumber("1234567890");
        updatedResponse.setAccountType("Customer");

        when(accountService.updateAccountResponse(eq(1L), any(Account.class))).thenReturn(updatedResponse);

        // ACT & ASSERT
        mockMvc.perform(put("/api/accounts/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testAccount)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountName", is("John Updated")));
    }

    @Test
    @DisplayName("PUT /api/accounts/{id} - Should return 404 when account not found")
    void testUpdateAccountNotFound() throws Exception {
        // ARRANGE
        when(accountService.updateAccountResponse(eq(99L), any(Account.class)))
                .thenThrow(new IllegalArgumentException("Account not found"));

        // ACT & ASSERT
        mockMvc.perform(put("/api/accounts/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testAccount)))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // DELETE /api/accounts/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("DELETE /api/accounts/{id} - Should delete account and return 204")
    void testDeleteAccount() throws Exception {
        // ARRANGE
        doNothing().when(accountService).deleteAccount(1L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/accounts/1"))
                .andExpect(status().isNoContent());

        verify(accountService, times(1)).deleteAccount(1L);
    }

    @Test
    @DisplayName("DELETE /api/accounts/{id} - Should return 404 when account not found")
    void testDeleteAccountNotFound() throws Exception {
        // ARRANGE
        doThrow(new IllegalArgumentException("Account not found"))
                .when(accountService).deleteAccount(99L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/accounts/99"))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // POST /api/accounts/login
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/accounts/login - Should authenticate user successfully")
    void testLoginSuccess() throws Exception {
        // ARRANGE
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("john@example.com");
        loginRequest.setPassword("password123");

        LoginResponse loginResponse = new LoginResponse(
                true, "Login successful", 1L, "John Doe", "Customer", "john@example.com");

        when(accountService.authenticateUser("john@example.com", "password123"))
                .thenReturn(loginResponse);

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.message", is("Login successful")))
                .andExpect(jsonPath("$.accountName", is("John Doe")));
    }

    @Test
    @DisplayName("POST /api/accounts/login - Should return 200 with success=false for wrong password")
    void testLoginFailureWrongPassword() throws Exception {
        // ARRANGE
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("john@example.com");
        loginRequest.setPassword("wrongpassword");

        LoginResponse loginResponse = new LoginResponse(
                false, "Invalid password", null, null, null, null);

        when(accountService.authenticateUser("john@example.com", "wrongpassword"))
                .thenReturn(loginResponse);

        // ACT & ASSERT — controller always returns 200 OK; success=false is in the body
        mockMvc.perform(post("/api/accounts/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("Invalid password")));
    }

    @Test
    @DisplayName("POST /api/accounts/login - Should return 200 with FIREBASE_ACCOUNT message for Firebase users")
    void testLoginFailureFirebaseAccount() throws Exception {
        // ARRANGE
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("firebase@example.com");
        loginRequest.setPassword("anypassword");

        LoginResponse loginResponse = new LoginResponse(
                false, "FIREBASE_ACCOUNT", null, null, null, null);

        when(accountService.authenticateUser("firebase@example.com", "anypassword"))
                .thenReturn(loginResponse);

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("FIREBASE_ACCOUNT")));
    }

    @Test
    @DisplayName("POST /api/accounts/login - Should return 200 with success=false when user not found")
    void testLoginFailureUserNotFound() throws Exception {
        // ARRANGE
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("nobody@example.com");
        loginRequest.setPassword("pass");

        LoginResponse loginResponse = new LoginResponse(
                false, "User not found", null, null, null, null);

        when(accountService.authenticateUser("nobody@example.com", "pass"))
                .thenReturn(loginResponse);

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("User not found")));
    }

    // -------------------------------------------------------------------------
    // POST /api/accounts/firebase-login
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should return 400 when token is missing")
    void testFirebaseLoginMissingToken() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("email", "test@example.com");

        mockMvc.perform(post("/api/accounts/firebase-login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should return 400 when token is empty string")
    void testFirebaseLoginEmptyToken() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "");

        mockMvc.perform(post("/api/accounts/firebase-login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should use fallback when Firebase SDK not initialised")
    void testFirebaseLoginFallback() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "some-token");
        payload.put("uid", "firebase-uid-123");
        payload.put("email", "test@example.com");
        payload.put("name", "Test User");
        payload.put("phoneNumber", "1234567890");
        payload.put("password", "password123");

        Account account = new Account();
        account.setId(1L);
        account.setFirebaseUid("firebase-uid-123");
        account.setAccountEmailAddress("test@example.com");
        account.setAccountName("Test User");
        account.setAccountPhoneNumber("1234567890");
        account.setAccountType("Customer");

        when(accountService.registerFirebaseUser(
                "firebase-uid-123", "test@example.com", "Test User", "1234567890", "password123"))
                .thenReturn(account);

        try (MockedStatic<FirebaseApp> firebaseAppMock = mockStatic(FirebaseApp.class)) {
            firebaseAppMock.when(FirebaseApp::getApps).thenReturn(Collections.emptyList());

            mockMvc.perform(post("/api/accounts/firebase-login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id", is(1)))
                    .andExpect(jsonPath("$.accountEmailAddress", is("test@example.com")));
        }
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should return 400 when fallback uid/email missing")
    void testFirebaseLoginFallbackMissingUid() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "some-token");
        payload.put("name", "Test User");
        // uid and email intentionally omitted

        try (MockedStatic<FirebaseApp> firebaseAppMock = mockStatic(FirebaseApp.class)) {
            firebaseAppMock.when(FirebaseApp::getApps).thenReturn(Collections.emptyList());

            mockMvc.perform(post("/api/accounts/firebase-login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should return 500 on unexpected exception")
    void testFirebaseLoginInternalError() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "some-token");
        payload.put("uid", "firebase-uid-123");
        payload.put("email", "test@example.com");
        payload.put("name", "Test User");

        when(accountService.registerFirebaseUser(any(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("Unexpected error"));

        try (MockedStatic<FirebaseApp> firebaseAppMock = mockStatic(FirebaseApp.class)) {
            firebaseAppMock.when(FirebaseApp::getApps).thenReturn(Collections.emptyList());

            mockMvc.perform(post("/api/accounts/firebase-login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isInternalServerError());
        }
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should verify token when Firebase SDK initialised")
    void testFirebaseLoginWithSdkInitialised() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "valid-firebase-token");
        payload.put("name", "Payload Name");
        payload.put("phoneNumber", "5551234");
        payload.put("password", "pass123");

        Account account = new Account();
        account.setId(2L);
        account.setFirebaseUid("decoded-uid-123");
        account.setAccountEmailAddress("decoded@example.com");
        account.setAccountName("Payload Name");
        account.setAccountPhoneNumber("5551234");
        account.setAccountType("Customer");

        FirebaseToken mockToken = mock(FirebaseToken.class);
        when(mockToken.getUid()).thenReturn("decoded-uid-123");
        when(mockToken.getEmail()).thenReturn("decoded@example.com");
        when(mockToken.getName()).thenReturn("Decoded Name");

        FirebaseAuth mockAuth = mock(FirebaseAuth.class);
        when(mockAuth.verifyIdToken("valid-firebase-token")).thenReturn(mockToken);

        when(accountService.registerFirebaseUser(
                "decoded-uid-123", "decoded@example.com", "Payload Name", "5551234", "pass123"))
                .thenReturn(account);

        try (MockedStatic<FirebaseApp> firebaseAppMock = mockStatic(FirebaseApp.class);
             MockedStatic<FirebaseAuth> firebaseAuthMock = mockStatic(FirebaseAuth.class)) {
            firebaseAppMock.when(FirebaseApp::getApps).thenReturn(List.of(mock(FirebaseApp.class)));
            firebaseAuthMock.when(FirebaseAuth::getInstance).thenReturn(mockAuth);

            mockMvc.perform(post("/api/accounts/firebase-login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id", is(2)))
                    .andExpect(jsonPath("$.accountEmailAddress", is("decoded@example.com")));
        }
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should fall back to decoded name when payload name is absent")
    void testFirebaseLoginWithSdkNoPayloadName() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "valid-firebase-token");
        // name intentionally absent — controller should use decodedToken.getName()

        Account account = new Account();
        account.setId(3L);
        account.setFirebaseUid("uid-456");
        account.setAccountEmailAddress("user@example.com");
        account.setAccountName("Decoded Name");
        account.setAccountType("Customer");

        FirebaseToken mockToken = mock(FirebaseToken.class);
        when(mockToken.getUid()).thenReturn("uid-456");
        when(mockToken.getEmail()).thenReturn("user@example.com");
        when(mockToken.getName()).thenReturn("Decoded Name");

        FirebaseAuth mockAuth = mock(FirebaseAuth.class);
        when(mockAuth.verifyIdToken("valid-firebase-token")).thenReturn(mockToken);

        when(accountService.registerFirebaseUser("uid-456", "user@example.com", "Decoded Name", null, null))
                .thenReturn(account);

        try (MockedStatic<FirebaseApp> firebaseAppMock = mockStatic(FirebaseApp.class);
             MockedStatic<FirebaseAuth> firebaseAuthMock = mockStatic(FirebaseAuth.class)) {
            firebaseAppMock.when(FirebaseApp::getApps).thenReturn(List.of(mock(FirebaseApp.class)));
            firebaseAuthMock.when(FirebaseAuth::getInstance).thenReturn(mockAuth);

            mockMvc.perform(post("/api/accounts/firebase-login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.accountName", is("Decoded Name")));
        }
    }

    @Test
    @DisplayName("POST /api/accounts/firebase-login - Should return 401 on FirebaseAuthException")
    void testFirebaseLoginAuthException() throws Exception {
        Map<String, String> payload = new HashMap<>();
        payload.put("token", "invalid-token");

        FirebaseAuth mockAuth = mock(FirebaseAuth.class);
        when(mockAuth.verifyIdToken("invalid-token")).thenThrow(
                new FirebaseAuthException(ErrorCode.UNAUTHENTICATED, "Token has expired", null, null, null));

        try (MockedStatic<FirebaseApp> firebaseAppMock = mockStatic(FirebaseApp.class);
             MockedStatic<FirebaseAuth> firebaseAuthMock = mockStatic(FirebaseAuth.class)) {
            firebaseAppMock.when(FirebaseApp::getApps).thenReturn(List.of(mock(FirebaseApp.class)));
            firebaseAuthMock.when(FirebaseAuth::getInstance).thenReturn(mockAuth);

            mockMvc.perform(post("/api/accounts/firebase-login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isUnauthorized());
        }
    }
}
