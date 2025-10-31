package com.example.purchasedproducts.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "Purchased_Products")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PurchasedProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PurchasedProductsID")
    private Long id;

    @NotNull(message = "Order item ID is required")
    @Column(name = "OrderItemID", nullable = false)
    private Long orderItemId;

    @NotNull(message = "Product ID is required")
    @Column(name = "ProductID", nullable = false)
    private Long productId;
}
