package com.example.stock.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "Stock")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Stock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "StockID")
    private Long id;

    @NotNull(message = "Product ID is required")
    @Column(name = "ProductID", nullable = false)
    private Long productId;

    @NotNull(message = "Availability status is required")
    @Column(name = "IsAvailable", nullable = false)
    @JsonProperty("isAvailable")
    private Boolean isAvailable = true;
}
