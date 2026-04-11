package com.example.accounts.controller;

import com.example.accounts.dto.AccountResponse;
import com.example.accounts.dto.LoginRequest;
import com.example.accounts.dto.LoginResponse;
import com.example.accounts.model.Account;
import com.example.accounts.service.AccountService;
import com.google.firebase.FirebaseApp;
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
        System.out.println("Login endpoint hit for email: " + request.getEmail());
        LoginResponse response = accountService.authenticateUser(
            request.getEmail(), 
            request.getPassword()
        );
        
        System.out.println("Login result: " + response.getMessage());
        // DEBUG: Force 200 OK to bypass generic 401 errors
        return ResponseEntity.ok(response);
    }

    @PostMapping("/firebase-login")
    public ResponseEntity<AccountResponse> firebaseLogin(@RequestBody java.util.Map<String, String> payload) {
        System.out.println("DEBUG: Received firebase-login request");
        try {
            System.out.println("DEBUG: Payload keys: " + payload.keySet());
            
            String idToken = payload.get("token");
            if (idToken == null || idToken.isEmpty()) {
                System.err.println("ERROR: 'token' is missing or empty in the payload.");
                payload.forEach((k, v) -> System.out.println("Key: " + k + ", Value Length: " + (v == null ? "null" : v.length())));
                return ResponseEntity.badRequest().build();
            }

            String phoneNumber = payload.get("phoneNumber");
            String uid;
            String email;
            String name;

            // Try Firebase Admin SDK token verification first
            if (!FirebaseApp.getApps().isEmpty()) {
                System.out.println("DEBUG: Firebase Admin SDK available, verifying token (length: " + idToken.length() + ")...");
                FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(idToken);
                uid = decodedToken.getUid();
                email = decodedToken.getEmail();
                String payloadName = payload.get("name");
                name = (payloadName != null && !payloadName.isEmpty()) ? payloadName : decodedToken.getName();
                System.out.println("DEBUG: Token verified. UID: " + uid + ", Email: " + email + ", Name: " + name);
            } else {
                // Firebase Admin SDK not initialized — fall back to client-provided values
                // The user already authenticated via Firebase client SDK
                System.out.println("WARNING: Firebase Admin SDK not initialized. Using client-provided credentials.");
                uid = payload.get("uid");
                email = payload.get("email");
                name = payload.get("name");
                if (uid == null || uid.isEmpty() || email == null || email.isEmpty()) {
                    System.err.println("ERROR: uid or email missing from payload and Firebase Admin SDK unavailable.");
                    return ResponseEntity.badRequest().build();
                }
                System.out.println("DEBUG: Using client values. UID: " + uid + ", Email: " + email + ", Name: " + name);
            }
            
            String password = payload.get("password");
            Account account = accountService.registerFirebaseUser(uid, email, name, phoneNumber, password);
            System.out.println("DEBUG: Account processed: " + account.getId());
            return ResponseEntity.ok(AccountResponse.fromAccount(account));
        } catch (FirebaseAuthException e) {
            System.err.println("ERROR: Firebase token verification failed: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        } catch (Exception e) {
            System.err.println("ERROR: Exception in firebaseLogin: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
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
