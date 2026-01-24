package com.example.products.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "Products")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ProductID")
    private Long id;

    @Column(name = "AlbumTitle", length = 100)
    private String albumTitle;

    @Column(name = "AlbumPrice", precision = 6, scale = 2)
    private BigDecimal albumPrice;

    @Column(name = "albumCoverImageUrl", length = 255)
    private String albumCoverImageUrl; // For albums

    @Column(name = "file_url", length = 255)
    private String fileUrl; // URL to download full game/album

    @Column(name = "preview_url", length = 255)
    private String previewUrl; // URL for preview/demo

    @Column(name = "StockQuantity")
    private Integer stockQuantity;
}
