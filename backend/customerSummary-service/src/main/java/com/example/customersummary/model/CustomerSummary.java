package com.example.customersummary.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "CustomerSummary")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CustomerSummary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CustomerSummaryID")
    private Long id;

    @NotNull(message = "Account ID is required")
    @Column(name = "AccountID", nullable = false)
    private Long accountId;

    @NotNull(message = "Product ID is required")
    @Column(name = "ProductID", nullable = false)
    private Long productId;

    @NotNull(message = "Order ID is required")
    @Column(name = "OrderID", nullable = false)
    private Long orderId;
}
