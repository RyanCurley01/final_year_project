package com.example.accounts.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/*
 * Entity classes for each service represent
 * the class fields to be mapped to the database columns
 */
@Entity
@Table(name = "Accounts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "AccountID")
    private Long id;

    @Column(name = "FirebaseUID", unique = true, length = 128)
    private String firebaseUid;

    @NotBlank(message = "Account name is required")
    @Column(name = "AccountName", nullable = false, length = 100)
    private String accountName;

    @NotBlank(message = "Phone number is required")
    @Column(name = "AccountPhoneNumber", length = 15)
    private String accountPhoneNumber;

    @Email(message = "Email should be valid")
    @NotBlank(message = "Email is required")
    @Column(name = "AccountEmailAddress", unique = true, nullable = false, length = 100)
    private String accountEmailAddress;

    @NotBlank(message = "Password is required")
    @Column(name = "AccountPassword", nullable = false, length = 255)
    private String accountPassword;

    @NotBlank(message = "Account type is required")
    @Column(name = "AccountType", nullable = false)
    private String accountType; // Manager, Employee, Customer
}
