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
    public Account registerFirebaseUser(String firebaseUid, String email, String name, String phoneNumber, String password) {
        System.out.println("DEBUG: registerFirebaseUser called for Email: " + email + ", UID: " + firebaseUid);
        Optional<Account> existingByUid = accountRepository.findByFirebaseUid(firebaseUid);
        if (existingByUid.isPresent()) {
            System.out.println("DEBUG: Found existing account by UID: " + existingByUid.get().getId());
            return existingByUid.get();
        }

        Optional<Account> existingByEmail = accountRepository.findByAccountEmailAddress(email);
        if (existingByEmail.isPresent()) {
            // Link existing account
            System.out.println("DEBUG: Found existing account by Email: " + existingByEmail.get().getId() + ". Linking UID.");
            Account existing = existingByEmail.get();
            existing.setFirebaseUid(firebaseUid);
            return accountRepository.save(existing);
        }

        System.out.println("DEBUG: Creating new Firebase account.");
        return createFirebaseAccount(firebaseUid, email, name, phoneNumber, password);
    }

    private Account createFirebaseAccount(String firebaseUid, String email, String name, String phoneNumber, String password) {
        Account newAccount = new Account();
        newAccount.setFirebaseUid(firebaseUid);
        newAccount.setAccountEmailAddress(email);
        newAccount.setAccountName(name != null ? name : "User");
        // Use the user's actual password if provided, otherwise generate a random one
        if (password != null && !password.isEmpty()) {
            newAccount.setAccountPassword(passwordEncoder.encode(password));
        } else {
            newAccount.setAccountPassword(passwordEncoder.encode("FIREBASE-" + java.util.UUID.randomUUID().toString()));
        }
        newAccount.setAccountType("Customer"); // Default type
        newAccount.setAccountPhoneNumber(phoneNumber != null ? phoneNumber : ""); 
        
        return accountRepository.save(newAccount);
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
            System.out.println("User not found: " + email);
            return new LoginResponse(false, "User not found", null, null, null, null);
        }
        
        Account account = accountOptional.get();
        
        // Check if password matches
        boolean matches = passwordEncoder.matches(password, account.getAccountPassword());
        System.out.println("Password match for " + email + ": " + matches);
        
        if (matches) {
            return new LoginResponse(
                true, 
                "Login successful", 
                account.getId(),
                account.getAccountName(),
                account.getAccountType(),
                account.getAccountEmailAddress()
            );
        } else {
            // Check if this is a Firebase/Google-linked account
            // Real Firebase UIDs are 28+ char alphanumeric strings; ignore placeholder UIDs like "uid_john"
            String uid = account.getFirebaseUid();
            boolean isRealFirebaseUid = uid != null && uid.length() >= 20 && !uid.startsWith("uid_");
            if (isRealFirebaseUid) {
                System.out.println("Login attempt on Firebase-linked account: " + email);
                return new LoginResponse(false, "FIREBASE_ACCOUNT", null, null, null, null);
            }
            return new LoginResponse(false, "Invalid password", null, null, null, null);
        }
    }
}
