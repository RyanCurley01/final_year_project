package com.example.accounts.controller;

import com.example.accounts.dto.AccountResponse;
import com.example.accounts.dto.LoginRequest;
import com.example.accounts.dto.LoginResponse;
import com.example.accounts.model.Account;
import com.example.accounts.service.AccountService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Arrays;
import java.util.List;
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
 * These tests simulate HTTP requests and verify responses
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

    @Test
    @DisplayName("GET /api/accounts/getAllAccounts - Should return all accounts")
    void testGetAllAccounts() throws Exception {
        // ARRANGE
        AccountResponse response2 = new AccountResponse();
        response2.setId(2L);
        response2.setAccountName("Jane Smith");
        response2.setAccountEmailAddress("jane@example.com");
        
        List<AccountResponse> accounts = Arrays.asList(testAccountResponse, response2);
        when(accountService.getAllAccountsResponse()).thenReturn(accounts);

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts/getAllAccounts")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].accountName", is("John Doe")))
                .andExpect(jsonPath("$[1].accountName", is("Jane Smith")));
    }

    @Test
    @DisplayName("GET /api/accounts/getAllAccounts - Should filter by account type")
    void testGetAllAccountsByType() throws Exception {
        // ARRANGE
        List<AccountResponse> customerAccounts = Arrays.asList(testAccountResponse);
        when(accountService.getAccountsByTypeResponse("Customer")).thenReturn(customerAccounts);

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts/getAllAccounts")
                .param("accountType", "Customer")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].accountType", is("Customer")));
    }

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

    @Test
    @DisplayName("POST /api/accounts - Should create new account")
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
                .thenThrow(new IllegalArgumentException("Invalid data"));

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testAccount)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PUT /api/accounts/{id} - Should update account")
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

    @Test
    @DisplayName("DELETE /api/accounts/{id} - Should delete account")
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
    @DisplayName("POST /api/accounts/login - Should return error for invalid credentials")
    void testLoginFailure() throws Exception {
        // ARRANGE
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("john@example.com");
        loginRequest.setPassword("wrongpassword");

        LoginResponse loginResponse = new LoginResponse(
                false, "Invalid password", null, null, null, null);
        
        when(accountService.authenticateUser("john@example.com", "wrongpassword"))
                .thenReturn(loginResponse);

        // ACT & ASSERT
        mockMvc.perform(post("/api/accounts/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("Invalid password")));
    }
}
