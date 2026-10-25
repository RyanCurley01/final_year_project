package com.example.soldproducts.config;

import com.example.soldproducts.model.Account;
import com.example.soldproducts.repository.AccountRepository;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class FirebaseBearerAuthenticationFilter extends OncePerRequestFilter {

    private static final Set<String> ACCOUNT_ROLES = Set.of("MANAGER", "EMPLOYEE", "CUSTOMER");

    private final AccountRepository accountRepository;

    @Override
    protected void doFilterInternal(
            @NonNull
            HttpServletRequest request,
            @NonNull
            HttpServletResponse response,
            @NonNull
            FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        if (FirebaseApp.getApps().isEmpty()) {
            response.sendError(HttpStatus.SERVICE_UNAVAILABLE.value(), "Firebase authentication is not configured");
            return;
        }

        String idToken = authorization.substring("Bearer ".length()).trim();
        try {
            FirebaseToken firebaseToken = FirebaseAuth.getInstance().verifyIdToken(idToken, true);
            Account account = accountRepository.findByFirebaseUid(firebaseToken.getUid()).orElse(null);
            if (account == null || account.getAccountType() == null) {
                response.sendError(HttpStatus.UNAUTHORIZED.value(), "Account is not registered");
                return;
            }

            String role = account.getAccountType().trim().toUpperCase(Locale.ROOT);
            if (!ACCOUNT_ROLES.contains(role)) {
                response.sendError(HttpStatus.FORBIDDEN.value(), "Account role is not authorized");
                return;
            }

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            account.getAccountEmailAddress(),
                            null,
                            Set.of(new SimpleGrantedAuthority("ROLE_" + role)));
            SecurityContextHolder.getContext().setAuthentication(authentication);
            filterChain.doFilter(request, response);
        } catch (FirebaseAuthException exception) {
            SecurityContextHolder.clearContext();
            response.sendError(HttpStatus.UNAUTHORIZED.value(), "Invalid Firebase ID token");
        }
    }
}
