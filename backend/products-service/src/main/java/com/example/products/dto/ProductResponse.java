package com.example.products.dto;

import com.example.products.model.Product;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductResponse {
    private Long id;
    private String gameTitle;
    private String albumTitle;
    private String platform;
    private BigDecimal gamePrice;
    private BigDecimal albumPrice;
    private String gameCoverImageUrl;      // Presigned URL
    private String albumCoverImageUrl;     // Presigned URL
    private String fileUrl;                // Presigned URL
    private String previewUrl;             // Presigned URL
    private Integer stockQuantity;

    public static ProductResponse fromProduct(Product product, String signedGameCoverUrl, 
                                             String signedAlbumCoverUrl, String signedFileUrl, 
                                             String signedPreviewUrl) {
        return new ProductResponse(
                product.getId(),
                product.getGameTitle(),
                product.getAlbumTitle(),
                product.getPlatform(),
                product.getGamePrice(),
                product.getAlbumPrice(),
                signedGameCoverUrl,
                signedAlbumCoverUrl,
                signedFileUrl,
                signedPreviewUrl,
                product.getStockQuantity()
        );
    }
}
