package com.example.payments.config;

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
// import org.springframework.web.cors.CorsConfiguration;
// import org.springframework.web.cors.CorsConfigurationSource;
// import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {


    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // @Bean
    // public CorsConfigurationSource corsConfigurationSource() {
    //     CorsConfiguration configuration = new CorsConfiguration();
    //     configuration.setAllowedOrigins(Arrays.asList("*"));
    //     configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
    //     configuration.setAllowedHeaders(Arrays.asList("*"));
    //     configuration.setAllowCredentials(false);
    //     configuration.setMaxAge(3600L);
        
    //     UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    //     source.registerCorsConfiguration("/**", configuration);
    //     return source;
    // }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(auth -> auth
                // PayPal endpoints  (updated to match new REST paths)
                .requestMatchers(HttpMethod.POST, "/api/payments/paypal/orders").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/payments/paypal/orders/*/capture").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/payments/paypal/orders/*").permitAll()

                // View individual payment or PayPal payment by ID
                .requestMatchers(HttpMethod.GET, "/api/payments/{id}").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/payments/paypal/**").permitAll()

                // Manager and Employee can view all payments
                .requestMatchers(HttpMethod.GET, "/api/payments").hasAnyRole("MANAGER", "EMPLOYEE")

                // Manager and Employee can update payments
                .requestMatchers(HttpMethod.PUT, "/api/payments/**").hasAnyRole("MANAGER", "EMPLOYEE")

                // Only Manager can delete payments
                .requestMatchers(HttpMethod.DELETE, "/api/payments/**").hasRole("MANAGER")

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
