package com.example.products.service;

import com.example.products.model.Account;
import com.example.products.repository.AccountRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("CustomUserDetailsService Unit Tests")
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
        testAccount.setAccountEmailAddress("customer@example.com");
        testAccount.setAccountPassword("$2a$10$encodedPassword");
        testAccount.setAccountType("Customer");
    }

    @Test
    @DisplayName("loadUserByUsername - Should load customer user")
    void testLoadUserByUsernameCustomer() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("customer@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("customer@example.com");

        // ASSERT
        assertThat(userDetails.getUsername()).isEqualTo("customer@example.com");
        assertThat(userDetails.getPassword()).isEqualTo("$2a$10$encodedPassword");
        assertThat(userDetails.getAuthorities()).hasSize(1);
        assertThat(userDetails.getAuthorities().iterator().next().getAuthority())
                .isEqualTo("ROLE_CUSTOMER");
        verify(accountRepository).findByAccountEmailAddress("customer@example.com");
    }

    @Test
    @DisplayName("loadUserByUsername - Should load manager user")
    void testLoadUserByUsernameManager() {
        // ARRANGE
        testAccount.setAccountType("Manager");
        testAccount.setAccountEmailAddress("manager@example.com");
        when(accountRepository.findByAccountEmailAddress("manager@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("manager@example.com");

        // ASSERT
        assertThat(userDetails.getAuthorities().iterator().next().getAuthority())
                .isEqualTo("ROLE_MANAGER");
    }

    @Test
    @DisplayName("loadUserByUsername - Should load employee user")
    void testLoadUserByUsernameEmployee() {
        // ARRANGE
        testAccount.setAccountType("Employee");
        testAccount.setAccountEmailAddress("employee@example.com");
        when(accountRepository.findByAccountEmailAddress("employee@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("employee@example.com");

        // ASSERT
        assertThat(userDetails.getAuthorities().iterator().next().getAuthority())
                .isEqualTo("ROLE_EMPLOYEE");
    }

    @Test
    @DisplayName("loadUserByUsername - Should throw UsernameNotFoundException when user not found")
    void testLoadUserByUsernameNotFound() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("notfound@example.com"))
                .thenReturn(Optional.empty());

        // ACT & ASSERT
        assertThatThrownBy(() -> customUserDetailsService.loadUserByUsername("notfound@example.com"))
                .isInstanceOf(UsernameNotFoundException.class)
                .hasMessageContaining("User not found with email: notfound@example.com");
        verify(accountRepository).findByAccountEmailAddress("notfound@example.com");
    }
}
