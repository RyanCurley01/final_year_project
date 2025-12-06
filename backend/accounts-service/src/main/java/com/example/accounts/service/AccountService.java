package com.example.accounts.service;

import com.example.accounts.dto.AccountResponse;
import com.example.accounts.dto.LoginResponse;
import com.example.accounts.model.Account;
import com.example.accounts.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

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

    // DTO conversion methods
    public List<AccountResponse> getAllAccountsResponse() {
        return accountRepository.findAll().stream()
                .map(AccountResponse::fromAccount)
                .collect(Collectors.toList());
    }

    public List<AccountResponse> getAccountsByTypeResponse(String accountType) {
        return accountRepository.findByAccountType(accountType).stream()
                .map(AccountResponse::fromAccount)
                .collect(Collectors.toList());
    }

    public Optional<AccountResponse> getAccountByIdResponse(Long id) {
        return accountRepository.findById(id)
                .map(AccountResponse::fromAccount);
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
    public AccountResponse createAccountResponse(Account account) {
        Account savedAccount = createAccount(account);
        return AccountResponse.fromAccount(savedAccount);
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
    public AccountResponse updateAccountResponse(Long id, Account accountDetails) {
        Account updatedAccount = updateAccount(id, accountDetails);
        return AccountResponse.fromAccount(updatedAccount);
    }

    @Transactional
    public void deleteAccount(Long id) {
        if (!accountRepository.existsById(id)) {
            throw new IllegalArgumentException("Account not found with id: " + id);
        }
        accountRepository.deleteById(id);
    }

    public LoginResponse authenticateUser(String email, String password) {
        Optional<Account> accountOptional = accountRepository.findByAccountEmailAddress(email);
        
        if (accountOptional.isEmpty()) {
            return new LoginResponse(false, "User not found", null, null, null, null);
        }
        
        Account account = accountOptional.get();
        
        // Check if password matches
        if (passwordEncoder.matches(password, account.getAccountPassword())) {
            return new LoginResponse(
                true, 
                "Login successful", 
                account.getId(),
                account.getAccountName(),
                account.getAccountType(),
                account.getAccountEmailAddress()
            );
        } else {
            return new LoginResponse(false, "Invalid password", null, null, null, null);
        }
    }
}
