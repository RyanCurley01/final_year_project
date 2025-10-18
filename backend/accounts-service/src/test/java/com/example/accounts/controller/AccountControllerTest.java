package com.example.accounts.controller;

import com.example.accounts.model.Account;
import com.example.accounts.service.AccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.when;
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

    @MockBean
    private AccountService accountService;

    private Account testAccount;

    @BeforeEach
    void setUp() {
        testAccount = new Account();
        testAccount.setId(1L);
        testAccount.setAccountName("John Doe");
        testAccount.setAccountEmailAddress("john@example.com");
        testAccount.setAccountPassword("password123");
        testAccount.setAccountPhoneNumber("1234567890");
        testAccount.setAccountType("Customer");
    }

    @Test
    @DisplayName("GET /api/accounts - Should return all accounts")
    void testGetAllAccounts() throws Exception {
        // ARRANGE
        Account account2 = new Account();
        account2.setId(2L);
        account2.setAccountName("Jane Smith");
        account2.setAccountEmailAddress("jane@example.com");
        
        List<Account> accounts = Arrays.asList(testAccount, account2);
        when(accountService.getAllAccounts()).thenReturn(accounts);

        // ACT & ASSERT
        mockMvc.perform(get("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].accountName", is("John Doe")))
                .andExpect(jsonPath("$[1].accountName", is("Jane Smith")));
    }
}
