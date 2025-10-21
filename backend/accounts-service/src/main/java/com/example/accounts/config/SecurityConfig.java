package com.example.accounts.config;

import com.example.accounts.service.CustomUserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import org.springframework.security.config.Customizer;
import org.springframework.security.core.userdetails.UserDetailsService;
import lombok.RequiredArgsConstructor;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig
{
    private final CustomUserDetailsService customUserDetailsService;
    // To return hashed password
    @Bean
    public PasswordEncoder passwordEncoder()
    {
        return new BCryptPasswordEncoder();
    }

    // Defines security rules as to what endpoints a manager, employee or customer have access to
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception
    {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/accounts/register", "/api/accounts/login").permitAll()

                .requestMatchers("/api/accounts/manager/**").hasRole("MANAGER")

                .requestMatchers("/api/accounts/employee/**").hasAnyRole("MANAGER", "EMPLOYEE")

                .requestMatchers("/api/accounts/customer/**").hasAnyRole("MANAGER", "EMPLOYEE", "CUSTOMER")

                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults());

        return http.build();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return customUserDetailsService;
    }
}