package com.example.soldproducts.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

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

    @Column(name = "AccountName", nullable = false)
    private String accountName;

    @Column(name = "AccountPhoneNumber")
    private String accountPhoneNumber;

    @Column(name = "AccountEmailAddress", unique = true, nullable = false)
    private String accountEmailAddress;

    @Column(name = "AccountPassword", nullable = false)
    private String accountPassword;

    @Column(name = "AccountType", nullable = false)
    private String accountType;
}
