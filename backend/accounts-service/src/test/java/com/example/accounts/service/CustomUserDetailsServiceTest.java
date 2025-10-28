package com.example.accounts.service;

import com.example.accounts.model.Account;
import com.example.accounts.repository.AccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Custom User Details Service Tests")
class CustomUserDetailsServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private CustomUserDetailsService customUserDetailsService;

    private Account testAccount;

    @BeforeEach
    void setUp() {
        testAccount = new Account();
        testAccount.setId(1L);
        testAccount.setAccountName("John Doe");
        testAccount.setAccountEmailAddress("john@example.com");
        testAccount.setAccountPassword("hashedPassword");
        testAccount.setAccountType("Customer");
    }

    @Test
    @DisplayName("Should load user by username successfully")
    void testLoadUserByUsernameSuccess() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("john@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("john@example.com");

        // ASSERT
        assertNotNull(userDetails);
        assertEquals("john@example.com", userDetails.getUsername());
        assertEquals("hashedPassword", userDetails.getPassword());
        assertTrue(userDetails.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_CUSTOMER")));
        verify(accountRepository, times(1)).findByAccountEmailAddress("john@example.com");
    }

    @Test
    @DisplayName("Should load manager user with correct role")
    void testLoadUserByUsernameManager() {
        // ARRANGE
        testAccount.setAccountType("Manager");
        when(accountRepository.findByAccountEmailAddress("john@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("john@example.com");

        // ASSERT
        assertTrue(userDetails.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_MANAGER")));
    }

    @Test
    @DisplayName("Should load employee user with correct role")
    void testLoadUserByUsernameEmployee() {
        // ARRANGE
        testAccount.setAccountType("Employee");
        when(accountRepository.findByAccountEmailAddress("john@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("john@example.com");

        // ASSERT
        assertTrue(userDetails.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_EMPLOYEE")));
    }

    @Test
    @DisplayName("Should throw exception when user not found")
    void testLoadUserByUsernameNotFound() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("unknown@example.com"))
                .thenReturn(Optional.empty());

        // ACT & ASSERT
        UsernameNotFoundException exception = assertThrows(
                UsernameNotFoundException.class,
                () -> customUserDetailsService.loadUserByUsername("unknown@example.com")
        );
        
        assertTrue(exception.getMessage().contains("User not found with email"));
        verify(accountRepository, times(1)).findByAccountEmailAddress("unknown@example.com");
    }
}
