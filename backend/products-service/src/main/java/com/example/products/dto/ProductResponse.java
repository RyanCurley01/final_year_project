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
    private String albumTitle;
    private BigDecimal albumPrice;
    private String albumCoverImageUrl;
    private String fileUrl;
    private String previewUrl;

    public static ProductResponse fromProduct(Product product,
                                             String signedAlbumCoverUrl,
                                             String signedFileUrl,
                                             String signedPreviewUrl) {
        return new ProductResponse(
                product.getId(),
                product.getAlbumTitle(),
                product.getAlbumPrice(),
                signedAlbumCoverUrl,
                signedFileUrl,
                signedPreviewUrl
        );
    }
}
