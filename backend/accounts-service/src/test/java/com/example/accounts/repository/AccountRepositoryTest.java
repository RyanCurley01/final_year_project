package com.example.accounts.repository;

import com.example.accounts.model.Account;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Repository Tests for AccountRepository
 * These tests verify database operations using an in-memory H2 database
 */
@DataJpaTest
@DisplayName("Account Repository Tests")
class AccountRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private AccountRepository accountRepository;

    private Account testAccount;

    @BeforeEach
    void setUp() {
        testAccount = new Account();
        testAccount.setAccountName("John Doe");
        testAccount.setAccountEmailAddress("john@example.com");
        testAccount.setAccountPassword("password123");
        testAccount.setAccountPhoneNumber("1234567890");
        testAccount.setAccountType("Customer");
    }

    @Test
    @DisplayName("Should save and find account by ID")
    void testSaveAndFindById() {
        // ARRANGE & ACT
        Account savedAccount = entityManager.persistAndFlush(testAccount);

        // ASSERT
        Optional<Account> foundAccount = accountRepository.findById(savedAccount.getId());
        
        assertTrue(foundAccount.isPresent());
        assertEquals("John Doe", foundAccount.get().getAccountName());
        assertEquals("john@example.com", foundAccount.get().getAccountEmailAddress());
    }
}
