package com.example.payments.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "Payments")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PaymentID")
    private Long id;

    @Column(name = "OrderID")
    private Long orderId;

    @Column(name = "ProductID")
    private Long productId;

    @Column(name = "AccountID")
    private Long accountId;

    @NotNull(message = "Payment amount is required")
    @Positive(message = "Payment amount must be positive")
    @Column(name = "PaymentAmount", nullable = false, precision = 10, scale = 2)
    private BigDecimal paymentAmount;

    @NotNull(message = "Payment status is required")
    @Column(name = "PaymentStatus", nullable = false)
    private String paymentStatus; // COMPLETED, UNCOMPLETED, PENDING

    @Column(name = "PaymentDateAndTime")
    private LocalDateTime paymentDateAndTime;

    @Column(name = "PayPalOrderID", unique = true)
    private String paypalOrderId; // Store PayPal order ID for tracking

    @PrePersist
    protected void onCreate() {
        if (paymentDateAndTime == null) {
            paymentDateAndTime = LocalDateTime.now();
        }
        if (paymentStatus == null) {
            paymentStatus = "PENDING";
        }
    }
}
