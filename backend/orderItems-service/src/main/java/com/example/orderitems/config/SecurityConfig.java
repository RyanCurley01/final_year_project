package com.example.orderitems.config;

import com.example.orderitems.service.CustomUserDetailsService;
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
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(auth -> auth
                // Customers can create and view their order items
                .requestMatchers(HttpMethod.POST, "/api/order-items").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/order-items/{id}").authenticated()
                
                // Manager and Employee can view all order items
                .requestMatchers(HttpMethod.GET, "/api/order-items").hasAnyRole("MANAGER", "EMPLOYEE")
                
                // Manager and Employee can update/delete order items
                .requestMatchers(HttpMethod.PUT, "/api/order-items/**").hasAnyRole("MANAGER", "EMPLOYEE")
                .requestMatchers(HttpMethod.DELETE, "/api/order-items/**").hasRole("MANAGER")
                
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
