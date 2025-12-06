package com.example.accounts;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.session.SessionAutoConfiguration;

@SpringBootApplication(exclude = {SessionAutoConfiguration.class})
public class AccountsServiceApplication {

    public static void main(String[] args) {
        // Starts the Spring Boot application and runs the web server
        SpringApplication.run(AccountsServiceApplication.class, args);
    }
}
