package com.example.payments.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// Tags this class as a JPA entity mapped to a relational database table
@Entity
// Specifies the physical table name it maps to
@Table(name = "Payments")
// Lombok: Auto-generate getters, setters, equals, and hashcode
@Data
// Lombok: Creates a no-argument constructor (needed by Hibernate)
@NoArgsConstructor
// Lombok: Creates an all-argument constructor
@AllArgsConstructor
public class Payment {

    // Defines the primary key column
    @Id
    // Configures auto-incrementation behavior matching backend SQL setup
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PaymentID")
    private Long id;

    // References the ID of the overarching Order this belongs to
    @Column(name = "OrderID")
    private Long orderId;

    // References the specific product bought
    @Column(name = "ProductID")
    private Long productId;

    // Connects checkout data directly to a user's account ID
    @Column(name = "AccountID")
    private Long accountId;

    // Validation: Ensures price payload cannot be entirely empty
    @NotNull(message = "Payment amount is required")
    // Validation: Ensures negative cash balances aren't committed to the DB
    @Positive(message = "Payment amount must be positive")
    // DB Config: Column cannot be null, stores exactly 10 total digits with 2 decimal places
    @Column(name = "PaymentAmount", nullable = false, precision = 10, scale = 2)
    private BigDecimal paymentAmount;

    // Validation marking payment status requirement
    @NotNull(message = "Payment status is required")
    @Column(name = "PaymentStatus", nullable = false)
    private String paymentStatus; // E.g., 'COMPLETED', 'PENDING'

    // Timestamp logging when a transaction occurred locally
    @Column(name = "PaymentDateAndTime")
    private LocalDateTime paymentDateAndTime;

    // The unique String identifier issued by the remote PayPal architecture
    @Column(name = "PayPalOrderID", unique = true)
    private String paypalOrderId; 

    // Callback that runs immediately before saving a new row for the very first time
    @PrePersist
    protected void onCreate() {
        // Defaults to current server time if left entirely blank
        if (paymentDateAndTime == null) {
            paymentDateAndTime = LocalDateTime.now();
        }
        // Defaults new unstarted rows directly to 'PENDING' state
        if (paymentStatus == null) {
            paymentStatus = "PENDING";
        }
    }
}