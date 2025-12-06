package com.example.accounts.service;

import com.example.accounts.dto.AccountResponse;
import com.example.accounts.dto.LoginResponse;
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
        testAccount.setAccountPassword("hashedPassword");
        testAccount.setAccountPhoneNumber("1234567890");
        testAccount.setAccountType("Customer");
    }

    @Test
    @DisplayName("Should get all accounts")
    void testGetAllAccounts() {
        // ARRANGE
        Account account2 = new Account();
        account2.setId(2L);
        account2.setAccountName("Jane Smith");
        account2.setAccountEmailAddress("jane@example.com");
        
        List<Account> expectedAccounts = Arrays.asList(testAccount, account2);
        when(accountRepository.findAll()).thenReturn(expectedAccounts);

        // ACT
        List<Account> actualAccounts = accountService.getAllAccounts();

        // ASSERT
        assertNotNull(actualAccounts);
        assertEquals(2, actualAccounts.size());
        assertEquals("John Doe", actualAccounts.get(0).getAccountName());
        assertEquals("Jane Smith", actualAccounts.get(1).getAccountName());
        verify(accountRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("Should get all accounts as responses")
    void testGetAllAccountsResponse() {
        // ARRANGE
        List<Account> accounts = Arrays.asList(testAccount);
        when(accountRepository.findAll()).thenReturn(accounts);

        // ACT
        List<AccountResponse> responses = accountService.getAllAccountsResponse();

        // ASSERT
        assertEquals(1, responses.size());
        assertEquals("John Doe", responses.get(0).getAccountName());
        assertEquals("john@example.com", responses.get(0).getAccountEmailAddress());
        verify(accountRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("Should get accounts by type")
    void testGetAccountsByType() {
        // ARRANGE
        List<Account> customerAccounts = Arrays.asList(testAccount);
        when(accountRepository.findByAccountType("Customer")).thenReturn(customerAccounts);

        // ACT
        List<Account> result = accountService.getAccountsByType("Customer");

        // ASSERT
        assertEquals(1, result.size());
        assertEquals("Customer", result.get(0).getAccountType());
        verify(accountRepository, times(1)).findByAccountType("Customer");
    }

    @Test
    @DisplayName("Should get accounts by type as responses")
    void testGetAccountsByTypeResponse() {
        // ARRANGE
        List<Account> customerAccounts = Arrays.asList(testAccount);
        when(accountRepository.findByAccountType("Customer")).thenReturn(customerAccounts);

        // ACT
        List<AccountResponse> result = accountService.getAccountsByTypeResponse("Customer");

        // ASSERT
        assertEquals(1, result.size());
        assertEquals("Customer", result.get(0).getAccountType());
        verify(accountRepository, times(1)).findByAccountType("Customer");
    }

    @Test
    @DisplayName("Should get account by id")
    void testGetAccountById() {
        // ARRANGE
        when(accountRepository.findById(1L)).thenReturn(Optional.of(testAccount));

        // ACT
        Optional<Account> result = accountService.getAccountById(1L);

        // ASSERT
        assertTrue(result.isPresent());
        assertEquals("John Doe", result.get().getAccountName());
        verify(accountRepository, times(1)).findById(1L);
    }

    @Test
    @DisplayName("Should return empty when account not found by id")
    void testGetAccountByIdNotFound() {
        // ARRANGE
        when(accountRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT
        Optional<Account> result = accountService.getAccountById(99L);

        // ASSERT
        assertFalse(result.isPresent());
        verify(accountRepository, times(1)).findById(99L);
    }

    @Test
    @DisplayName("Should get account by id as response")
    void testGetAccountByIdResponse() {
        // ARRANGE
        when(accountRepository.findById(1L)).thenReturn(Optional.of(testAccount));

        // ACT
        Optional<AccountResponse> result = accountService.getAccountByIdResponse(1L);

        // ASSERT
        assertTrue(result.isPresent());
        assertEquals("John Doe", result.get().getAccountName());
        verify(accountRepository, times(1)).findById(1L);
    }

    @Test
    @DisplayName("Should get account by email")
    void testGetAccountByEmail() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("john@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        Optional<Account> result = accountService.getAccountByEmail("john@example.com");

        // ASSERT
        assertTrue(result.isPresent());
        assertEquals("john@example.com", result.get().getAccountEmailAddress());
        verify(accountRepository, times(1)).findByAccountEmailAddress("john@example.com");
    }

    @Test
    @DisplayName("Should create account successfully")
    void testCreateAccount() {
        // ARRANGE
        Account newAccount = new Account();
        newAccount.setAccountEmailAddress("new@example.com");
        newAccount.setAccountPassword("plainPassword");
        
        when(accountRepository.existsByAccountEmailAddress("new@example.com")).thenReturn(false);
        when(passwordEncoder.encode("plainPassword")).thenReturn("hashedPassword");
        when(accountRepository.save(any(Account.class))).thenReturn(newAccount);

        // ACT
        Account result = accountService.createAccount(newAccount);

        // ASSERT
        assertNotNull(result);
        verify(accountRepository).existsByAccountEmailAddress("new@example.com");
        verify(passwordEncoder).encode("plainPassword");
        verify(accountRepository).save(any(Account.class));
    }

    @Test
    @DisplayName("Should throw exception when creating account with existing email")
    void testCreateAccountDuplicateEmail() {
        // ARRANGE
        when(accountRepository.existsByAccountEmailAddress("john@example.com")).thenReturn(true);

        // ACT & ASSERT
        assertThrows(IllegalArgumentException.class, () -> 
            accountService.createAccount(testAccount)
        );
        verify(accountRepository).existsByAccountEmailAddress("john@example.com");
        verify(accountRepository, never()).save(any(Account.class));
    }

    @Test
    @DisplayName("Should create account and return response")
    void testCreateAccountResponse() {
        // ARRANGE
        Account newAccount = new Account();
        newAccount.setAccountName("New User");
        newAccount.setAccountEmailAddress("new@example.com");
        newAccount.setAccountPassword("plainPassword");
        
        when(accountRepository.existsByAccountEmailAddress("new@example.com")).thenReturn(false);
        when(passwordEncoder.encode("plainPassword")).thenReturn("hashedPassword");
        when(accountRepository.save(any(Account.class))).thenReturn(newAccount);

        // ACT
        AccountResponse result = accountService.createAccountResponse(newAccount);

        // ASSERT
        assertNotNull(result);
        assertEquals("New User", result.getAccountName());
    }

    @Test
    @DisplayName("Should update account successfully")
    void testUpdateAccount() {
        // ARRANGE
        Account updates = new Account();
        updates.setAccountName("Updated Name");
        updates.setAccountPhoneNumber("9999999999");
        
        when(accountRepository.findById(1L)).thenReturn(Optional.of(testAccount));
        when(accountRepository.save(any(Account.class))).thenReturn(testAccount);

        // ACT
        Account result = accountService.updateAccount(1L, updates);

        // ASSERT
        assertNotNull(result);
        verify(accountRepository).findById(1L);
        verify(accountRepository).save(any(Account.class));
    }

    @Test
    @DisplayName("Should hash password when updating")
    void testUpdateAccountWithPassword() {
        // ARRANGE
        Account updates = new Account();
        updates.setAccountPassword("newPassword");
        
        when(accountRepository.findById(1L)).thenReturn(Optional.of(testAccount));
        when(passwordEncoder.encode("newPassword")).thenReturn("newHashedPassword");
        when(accountRepository.save(any(Account.class))).thenReturn(testAccount);

        // ACT
        Account result = accountService.updateAccount(1L, updates);

        // ASSERT
        assertNotNull(result);
        verify(passwordEncoder).encode("newPassword");
    }

    @Test
    @DisplayName("Should throw exception when updating non-existent account")
    void testUpdateAccountNotFound() {
        // ARRANGE
        Account updates = new Account();
        when(accountRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        assertThrows(IllegalArgumentException.class, () ->
            accountService.updateAccount(99L, updates)
        );
        verify(accountRepository, never()).save(any(Account.class));
    }

    @Test
    @DisplayName("Should update account and return response")
    void testUpdateAccountResponse() {
        // ARRANGE
        Account updates = new Account();
        updates.setAccountName("Updated Name");
        
        when(accountRepository.findById(1L)).thenReturn(Optional.of(testAccount));
        when(accountRepository.save(any(Account.class))).thenReturn(testAccount);

        // ACT
        AccountResponse result = accountService.updateAccountResponse(1L, updates);

        // ASSERT
        assertNotNull(result);
    }

    @Test
    @DisplayName("Should delete account successfully")
    void testDeleteAccount() {
        // ARRANGE
        when(accountRepository.existsById(1L)).thenReturn(true);
        doNothing().when(accountRepository).deleteById(1L);

        // ACT
        accountService.deleteAccount(1L);

        // ASSERT
        verify(accountRepository).existsById(1L);
        verify(accountRepository).deleteById(1L);
    }

    @Test
    @DisplayName("Should throw exception when deleting non-existent account")
    void testDeleteAccountNotFound() {
        // ARRANGE
        when(accountRepository.existsById(99L)).thenReturn(false);

        // ACT & ASSERT
        assertThrows(IllegalArgumentException.class, () ->
            accountService.deleteAccount(99L)
        );
        verify(accountRepository, never()).deleteById(anyLong());
    }

    @Test
    @DisplayName("Should authenticate user with valid credentials")
    void testAuthenticateUserSuccess() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("john@example.com"))
                .thenReturn(Optional.of(testAccount));
        when(passwordEncoder.matches("plainPassword", "hashedPassword")).thenReturn(true);

        // ACT
        LoginResponse result = accountService.authenticateUser("john@example.com", "plainPassword");

        // ASSERT
        assertTrue(result.isSuccess());
        assertEquals("Login successful", result.getMessage());
        assertEquals(1L, result.getAccountId());
        assertEquals("John Doe", result.getAccountName());
        assertEquals("Customer", result.getAccountType());
    }

    @Test
    @DisplayName("Should fail authentication for non-existent user")
    void testAuthenticateUserNotFound() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("unknown@example.com"))
                .thenReturn(Optional.empty());

        // ACT
        LoginResponse result = accountService.authenticateUser("unknown@example.com", "password");

        // ASSERT
        assertFalse(result.isSuccess());
        assertEquals("User not found", result.getMessage());
        assertNull(result.getAccountId());
    }

    @Test
    @DisplayName("Should fail authentication for invalid password")
    void testAuthenticateUserInvalidPassword() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("john@example.com"))
                .thenReturn(Optional.of(testAccount));
        when(passwordEncoder.matches("wrongPassword", "hashedPassword")).thenReturn(false);

        // ACT
        LoginResponse result = accountService.authenticateUser("john@example.com", "wrongPassword");

        // ASSERT
        assertFalse(result.isSuccess());
        assertEquals("Invalid password", result.getMessage());
        assertNull(result.getAccountId());
    }
}