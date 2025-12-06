package com.example.stock.service;

import com.example.stock.model.Account;
import com.example.stock.repository.AccountRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("CustomUserDetailsService Unit Tests")
class CustomUserDetailsServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private CustomUserDetailsService customUserDetailsService;

    @Test
    @DisplayName("loadUserByUsername - Should load user")
    void testLoadUserByUsername() {
        Account account = new Account();
        account.setAccountEmailAddress("test@example.com");
        account.setAccountPassword("password");
        account.setAccountType("Manager");

        when(accountRepository.findByAccountEmailAddress("test@example.com"))
                .thenReturn(Optional.of(account));

        UserDetails userDetails = customUserDetailsService.loadUserByUsername("test@example.com");

        assertThat(userDetails.getUsername()).isEqualTo("test@example.com");
    }

    @Test
    @DisplayName("loadUserByUsername - Should throw exception when not found")
    void testLoadUserByUsernameNotFound() {
        when(accountRepository.findByAccountEmailAddress("notfound@example.com"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> customUserDetailsService.loadUserByUsername("notfound@example.com"))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}
