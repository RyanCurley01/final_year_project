package com.example.soldproducts.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "Sold_Products")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SoldProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SoldProductsID")
    private Long id;

    @NotNull(message = "Order item ID is required")
    @Column(name = "OrderItemID", nullable = false)
    private Long orderItemId;

    @NotNull(message = "Product ID is required")
    @Column(name = "ProductID", nullable = false)
    private Long productId;
}
