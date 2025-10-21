package com.example.accounts.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "Account")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "AccountID")
    private Long id;

    @NotBlank(message = "Account name is required")
    @Column(name = "AccountName", nullable = false, length = 10)
    private String accountName;

    @NotBlank(message = "Phone number is required")
    @Column(name = "AccountPhoneNumber", length = 10)
    private String accountPhoneNumber;

    @Email(message = "Email should be valid")
    @NotBlank(message = "Email is required")
    @Column(name = "AccountEmailAddress", unique = true, nullable = false, length = 20)
    private String accountEmailAddress;

    @NotBlank(message = "Password is required")
    @Column(name = "AccountPassword", nullable = false, length = 10)
    private String accountPassword;

    @NotBlank(message = "Account type is required")
    @Column(name = "AccountType", nullable = false)
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
