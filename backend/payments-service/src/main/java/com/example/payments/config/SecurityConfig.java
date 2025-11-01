package com.example.payments.config;

import com.example.payments.service.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final CustomUserDetailsService customUserDetailsService;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.disable())
            .authorizeHttpRequests(auth -> auth
                // PayPal endpoints - authenticated customers can create/capture orders
                .requestMatchers(HttpMethod.POST, "/api/payments/paypal/create-order").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/payments/paypal/capture-order/**").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/payments/paypal/order/**").authenticated()
                
                // Customers can create and view their own payments
                .requestMatchers(HttpMethod.POST, "/api/payments").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/payments/{id}").authenticated()
                
                // Manager and Employee can view all payments
                .requestMatchers(HttpMethod.GET, "/api/payments").hasAnyRole("MANAGER", "EMPLOYEE")
                
                // Manager and Employee can update payments
                .requestMatchers(HttpMethod.PUT, "/api/payments/**").hasAnyRole("MANAGER", "EMPLOYEE")
                
                // Only Manager can delete payments
                .requestMatchers(HttpMethod.DELETE, "/api/payments/**").hasRole("MANAGER")
                
                // All other requests must be authenticated
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults())
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .headers(headers -> headers
                .frameOptions(frameOptions -> frameOptions.disable())
            );
        return http.build();
    }
}
