package com.example.accounts.controller;

import com.example.accounts.dto.AccountResponse;
import com.example.accounts.dto.LoginRequest;
import com.example.accounts.dto.LoginResponse;
import com.example.accounts.model.Account;
import com.example.accounts.service.AccountService;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.FirebaseAuthException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/accounts")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @GetMapping("/getAllAccounts")
    public ResponseEntity<List<AccountResponse>> getAllAccounts(
            @RequestParam(required = false) String accountType) {
        
        if (accountType != null && !accountType.isEmpty()) {
            return ResponseEntity.ok(accountService.getAccountsByTypeResponse(accountType));
        }
        return ResponseEntity.ok(accountService.getAllAccountsResponse());
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request)
    {   
        LoginResponse response = accountService.authenticateUser(
            request.getEmail(), 
            request.getPassword()
        );
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
        }
    }

    @PostMapping("/firebase-login")
    public ResponseEntity<AccountResponse> firebaseLogin(@RequestBody java.util.Map<String, String> payload) throws FirebaseAuthException {
        String idToken = payload.get("token");
        FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(idToken);
        String uid = decodedToken.getUid();
        
        Account account = accountService.registerFirebaseUser(uid, decodedToken.getEmail(), decodedToken.getName());
        return ResponseEntity.ok(AccountResponse.fromAccount(account));
    }

    @GetMapping("/{id}")
    public ResponseEntity<AccountResponse> getAccountById(@PathVariable Long id) {
        return accountService.getAccountByIdResponse(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<AccountResponse> createAccount(@Valid @RequestBody Account account) {
        try {
            AccountResponse createdAccount = accountService.createAccountResponse(account);
            return ResponseEntity.status(HttpStatus.CREATED).body(createdAccount);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<AccountResponse> updateAccount(
            @PathVariable Long id,
            @RequestBody Account accountDetails) {
        try {
            AccountResponse updatedAccount = accountService.updateAccountResponse(id, accountDetails);
            return ResponseEntity.ok(updatedAccount);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAccount(@PathVariable Long id) {
        try {
            accountService.deleteAccount(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
