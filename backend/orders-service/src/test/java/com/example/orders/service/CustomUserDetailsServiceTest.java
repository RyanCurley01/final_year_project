package com.example.orders.service;

import com.example.orders.model.Account;
import com.example.orders.repository.AccountRepository;
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
    @DisplayName("loadUserByUsername - Should load user and map role")
    void testLoadUserByUsername() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("customer@example.com"))
                .thenReturn(Optional.of(testAccount));

        // ACT
        UserDetails userDetails = customUserDetailsService.loadUserByUsername("customer@example.com");

        // ASSERT
        assertThat(userDetails.getUsername()).isEqualTo("customer@example.com");
        assertThat(userDetails.getAuthorities().iterator().next().getAuthority())
                .isEqualTo("ROLE_CUSTOMER");
    }

    @Test
    @DisplayName("loadUserByUsername - Should throw exception when user not found")
    void testLoadUserByUsernameNotFound() {
        // ARRANGE
        when(accountRepository.findByAccountEmailAddress("notfound@example.com"))
                .thenReturn(Optional.empty());

        // ACT & ASSERT
        assertThatThrownBy(() -> customUserDetailsService.loadUserByUsername("notfound@example.com"))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}
