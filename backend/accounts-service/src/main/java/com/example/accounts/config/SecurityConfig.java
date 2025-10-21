package com.example.accounts.config;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import org.springframework.security.config.Customizer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;

@Configuration
@EnableWebSecurity
public class SecurityConfig
{
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
                .requestMatchers("/api/accounts/register", "/api/account/login").permitAll()

                .requestMatchers("/api/accounts/manager/**").hasRole("MANAGER")

                .requestMatchers("/api/accounts/employee/**").hasAnyRole("MANAGER", "EMPLOYEE")

                .requestMatchers("/api/accounts/customer/**").hasAnyRole("MANAGER", "EMPLOYEE", "CUSTOMER")

                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults());

        return http.build();
    }


    // Test users for development (REMOVE IN PRODUCTION)
    // REPLACE WITH DATABASE AUTHENTICATION
    @Bean
    public UserDetailsService userDetailsService()
    {
        // Create a test MANAGER user
        UserDetails manager = User.builder()
            .username("manager@test.com")
            .password(passwordEncoder().encode("manager123"))
            .roles("MANAGER")
            .build();
        
        // Create a test EMPLOYEE user
        UserDetails employee = User.builder()
            .username("employee@test.com")
            .password(passwordEncoder().encode("employee123"))
            .roles("EMPLOYEE")
            .build();
        
        // Create a test CUSTOMER user
        UserDetails customer = User.builder()
            .username("customer@test.com")
            .password(passwordEncoder().encode("customer123"))
            .roles("CUSTOMER")
            .build();
        
        // Return an in-memory user store with all three users
        return new InMemoryUserDetailsManager(manager, employee, customer);
    }
}