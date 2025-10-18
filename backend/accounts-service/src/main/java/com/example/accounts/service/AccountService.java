package com.example.accounts.service;

import com.example.accounts.model.Account;
import com.example.accounts.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;

    public List<Account> getAllAccounts() {
        return accountRepository.findAll();
    }

    public List<Account> getAccountsByType(String accountType) {
        return accountRepository.findByAccountType(accountType);
    }

    public Optional<Account> getAccountById(Long id) {
        return accountRepository.findById(id);
    }

    public Optional<Account> getAccountByEmail(String email) {
        return accountRepository.findByAccountEmailAddress(email);
    }

    @Transactional
    public Account createAccount(Account account) {
        if (accountRepository.existsByAccountEmailAddress(account.getAccountEmailAddress())) {
            throw new IllegalArgumentException("Email already exists");
        }
        // Hash the password before saving
        account.setAccountPassword(passwordEncoder.encode(account.getAccountPassword()));
        return accountRepository.save(account);
    }

    @Transactional
    public Account updateAccount(Long id, Account accountDetails) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Account not found with id: " + id));

        if (accountDetails.getAccountName() != null) {
            account.setAccountName(accountDetails.getAccountName());
        }
        if (accountDetails.getAccountPhoneNumber() != null) {
            account.setAccountPhoneNumber(accountDetails.getAccountPhoneNumber());
        }
        if (accountDetails.getAccountEmailAddress() != null) {
            account.setAccountEmailAddress(accountDetails.getAccountEmailAddress());
        }
        if (accountDetails.getAccountPassword() != null) {
            account.setAccountPassword(passwordEncoder.encode(accountDetails.getAccountPassword()));
        }
        if (accountDetails.getAccountType() != null) {
            account.setAccountType(accountDetails.getAccountType());
        }

        return accountRepository.save(account);
    }

    @Transactional
    public void deleteAccount(Long id) {
        if (!accountRepository.existsById(id)) {
            throw new IllegalArgumentException("Account not found with id: " + id);
        }
        accountRepository.deleteById(id);
    }
}
