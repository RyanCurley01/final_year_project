package com.example.accounts.service;

import com.example.accounts.model.Account;
import com.example.accounts.repository.AccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Unit Tests for AccountService
 * These tests use Mockito to mock dependencies and test business logic in isolation
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Account Service Tests")
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private AccountService accountService;

    private Account testAccount;

    @BeforeEach
    void setUp() {
        // Create a test account before each test
        testAccount = new Account();
        testAccount.setId(1L);
        testAccount.setAccountName("John Doe");
        testAccount.setAccountEmailAddress("john@example.com");
        testAccount.setAccountPassword("password123");
        testAccount.setAccountPhoneNumber("1234567890");
        testAccount.setAccountType("Customer");
    }

    @Test
    @DisplayName("Should get all accounts")
    void testGetAllAccounts() {
        // ARRANGE: Set up test data
        Account account2 = new Account();
        account2.setId(2L);
        account2.setAccountName("Jane Smith");
        account2.setAccountEmailAddress("jane@example.com");
        
        List<Account> expectedAccounts = Arrays.asList(testAccount, account2);
        
        // Mock the repository to return our test data
        when(accountRepository.findAll()).thenReturn(expectedAccounts);

        // ACT: Call the method we're testing
        List<Account> actualAccounts = accountService.getAllAccounts();

        // ASSERT: Verify the results
        assertNotNull(actualAccounts);
        assertEquals(2, actualAccounts.size());
        assertEquals("John Doe", actualAccounts.get(0).getAccountName());
        assertEquals("Jane Smith", actualAccounts.get(1).getAccountName());
        
        // Verify that the repository method was called exactly once
        verify(accountRepository, times(1)).findAll();
    }
}