package com.example.products.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Product type is required")
    @Column(name = "product_type", nullable = false)
    private String productType; // "GAME" or "ALBUM"

    @Column(name = "game_title")
    private String gameTitle;

    @Column(name = "album_title")
    private String albumTitle;

    @Column(name = "platform")
    private String platform; // For games: PC, PS5, Xbox, etc.

    @Column(name = "artist")
    private String artist; // For albums

    @Column(name = "genre")
    private String genre;

    @NotNull(message = "Price is required")
    @Positive(message = "Price must be positive")
    @Column(name = "price", nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(name = "file_url")
    private String fileUrl; // URL to download full game/album

    @Column(name = "preview_url")
    private String previewUrl; // URL for preview/demo

    @Column(name = "stock_quantity")
    private Integer stockQuantity;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
