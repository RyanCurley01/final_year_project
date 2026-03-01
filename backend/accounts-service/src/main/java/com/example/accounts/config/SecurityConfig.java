package com.example.accounts.config;

import com.example.accounts.service.CustomUserDetailsService;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import org.springframework.security.config.Customizer;
// import org.springframework.web.cors.CorsConfiguration;
// import org.springframework.web.cors.CorsConfigurationSource;
// import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import lombok.RequiredArgsConstructor;

@Configuration
@EnableWebSecurity(debug = true) // Enable debug logs
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

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authConfig) throws Exception {
        return authConfig.getAuthenticationManager();
    }

    @Bean
    public org.springframework.web.cors.CorsConfigurationSource corsConfigurationSource() {
        org.springframework.web.cors.CorsConfiguration configuration = new org.springframework.web.cors.CorsConfiguration();
        configuration.setAllowedOrigins(java.util.Arrays.asList("*"));
        configuration.setAllowedMethods(java.util.Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(java.util.Arrays.asList("*"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3600L);
        
        org.springframework.web.cors.UrlBasedCorsConfigurationSource source = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    // Defines security rules as to what endpoints a manager, employee or customer have access to
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception
    {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults()) // Uses corsConfigurationSource bean if available
            .authorizeHttpRequests(auth -> auth
                // Explicitly allow login endpoints
                .requestMatchers("/api/accounts/login").permitAll()
                .requestMatchers("/api/accounts/firebase-login").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/accounts").permitAll()
                .requestMatchers("/error").permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                
                // Manager-only endpoints 
                .requestMatchers(HttpMethod.GET, "/api/accounts/getAllAccounts").hasRole("MANAGER")
                .requestMatchers(HttpMethod.DELETE, "/api/accounts /**").hasRole("MANAGER")

                // Manager and Employee only endpoints 
                .requestMatchers(HttpMethod.GET, "/api/accounts/{id}").hasAnyRole("MANAGER", "EMPLOYEE")
                .requestMatchers(HttpMethod.PUT, "/api/accounts/{id}").hasAnyRole("MANAGER", "EMPLOYEE")
                
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