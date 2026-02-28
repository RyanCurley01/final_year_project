package com.example.products.service;

import com.example.products.dto.ProductResponse;
import com.example.products.model.Product;
import com.example.products.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final S3Service s3Service;

    public List<Product> getAllProducts() {
        return productRepository.findAll();
    }

    public List<ProductResponse> getAllProductsWithSignedUrls() {
        return productRepository.findAll().stream()
                .map(this::toProductResponse)
                .collect(Collectors.toList());
    }

    public ProductResponse getProductById(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found with id: " + id));
        return toProductResponse(product);
    }

    public List<Product> getProductsByAlbumCoverImageUrl(String albumImageUrlString) {
        return productRepository.findByAlbumCoverImageUrl(albumImageUrlString);
    }

    private ProductResponse toProductResponse(Product product) {
        String signedAlbumCoverUrl = s3Service.generatePresignedUrl(product.getAlbumCoverImageUrl());
        String signedFileUrl = s3Service.generatePresignedUrl(product.getFileUrl());
        String signedPreviewUrl = s3Service.generatePresignedUrl(product.getPreviewUrl());

        return ProductResponse.fromProduct(product, signedAlbumCoverUrl, 
                                          signedFileUrl, signedPreviewUrl);
    }

    @Transactional
    public Product createProduct(Product product) {
        return productRepository.save(product);
    }

    @Transactional
    public Product updateProduct(Long id, Product productDetails) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found with id: " + id));

        if (productDetails.getAlbumTitle() != null) {
            product.setAlbumTitle(productDetails.getAlbumTitle());
        }
        if (productDetails.getAlbumCoverImageUrl() != null) {
            product.setAlbumCoverImageUrl(productDetails.getAlbumCoverImageUrl());
        }
        if (productDetails.getAlbumPrice() != null) {
            product.setAlbumPrice(productDetails.getAlbumPrice());
        }
        if (productDetails.getFileUrl() != null) {
            product.setFileUrl(productDetails.getFileUrl());
        }
        if (productDetails.getPreviewUrl() != null) {
            product.setPreviewUrl(productDetails.getPreviewUrl());
        }

        return productRepository.save(product);
    }

    @Transactional
    public void deleteProduct(Long id) {
        if (!productRepository.existsById(id)) {
            throw new IllegalArgumentException("Product not found with id: " + id);
        }
        productRepository.deleteById(id);
    }
}
