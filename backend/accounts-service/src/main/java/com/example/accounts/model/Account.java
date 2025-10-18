package com.example.accounts.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "accounts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Account name is required")
    @Column(name = "account_name", nullable = false)
    private String accountName;

    @NotBlank(message = "Phone number is required")
    @Column(name = "account_phone_number")
    private String accountPhoneNumber;

    @Email(message = "Email should be valid")
    @NotBlank(message = "Email is required")
    @Column(name = "account_email_address", unique = true, nullable = false)
    private String accountEmailAddress;

    @NotBlank(message = "Password is required")
    @Column(name = "account_password", nullable = false)
    private String accountPassword;

    @NotBlank(message = "Account type is required")
    @Column(name = "account_type", nullable = false)
    private String accountType; // Manager, Employee, Customer

    @Column(name = "created_at")
    private java.time.LocalDateTime createdAt;

    @Column(name = "updated_at")
    private java.time.LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = java.time.LocalDateTime.now();
        updatedAt = java.time.LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = java.time.LocalDateTime.now();
    }
}
