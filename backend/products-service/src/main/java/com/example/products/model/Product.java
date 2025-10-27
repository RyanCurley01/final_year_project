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

    @Column(name = "GameTitle", length = 10)
    private String gameTitle;

    @Column(name = "AlbumTitle", length = 10)
    private String albumTitle;

    @Column(name = "Platform", length = 10)
    private String platform; // For games: PC, PS5, Xbox, etc.

    @Column(name = "GamePrice", precision = 4, scale = 2)
    private BigDecimal gamePrice;

    @Column(name = "AlbumPrice", precision = 4, scale = 2)
    private BigDecimal albumPrice;

    @Column(name = "artist", length = 7)
    private String artist; // For albums

    @Column(name = "genre", length = 20)
    private String genre;

    @Column(name = "file_url", length = 255)
    private String fileUrl; // URL to download full game/album

    @Column(name = "preview_url", length = 255)
    private String previewUrl; // URL for preview/demo

    @Column(name = "StockQuantity")
    private Integer stockQuantity;
}
