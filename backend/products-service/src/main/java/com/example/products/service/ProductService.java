package com.example.products.service;

import com.example.products.model.Product;
import com.example.products.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    public List<Product> getAllProducts() {
        return productRepository.findAll();
    }

    public Optional<Product> getProductById(Long id) {
        return productRepository.findById(id);
    }

    public List<Product> getProductsByType(String productType) {
        return productRepository.findByProductType(productType);
    }

    public List<Product> getProductsByGenre(String genre) {
        return productRepository.findByGenre(genre);
    }

    public List<Product> getProductsByArtist(String artist) {
        return productRepository.findByArtist(artist);
    }

    public List<Product> getProductsByPlatform(String platform) {
        return productRepository.findByPlatform(platform);
    }

    @Transactional
    public Product createProduct(Product product) {
        return productRepository.save(product);
    }

    @Transactional
    public Product updateProduct(Long id, Product productDetails) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found with id: " + id));

        if (productDetails.getProductType() != null) {
            product.setProductType(productDetails.getProductType());
        }
        if (productDetails.getGameTitle() != null) {
            product.setGameTitle(productDetails.getGameTitle());
        }
        if (productDetails.getAlbumTitle() != null) {
            product.setAlbumTitle(productDetails.getAlbumTitle());
        }
        if (productDetails.getPlatform() != null) {
            product.setPlatform(productDetails.getPlatform());
        }
        if (productDetails.getArtist() != null) {
            product.setArtist(productDetails.getArtist());
        }
        if (productDetails.getGenre() != null) {
            product.setGenre(productDetails.getGenre());
        }
        if (productDetails.getPrice() != null) {
            product.setPrice(productDetails.getPrice());
        }
        if (productDetails.getFileUrl() != null) {
            product.setFileUrl(productDetails.getFileUrl());
        }
        if (productDetails.getPreviewUrl() != null) {
            product.setPreviewUrl(productDetails.getPreviewUrl());
        }
        if (productDetails.getStockQuantity() != null) {
            product.setStockQuantity(productDetails.getStockQuantity());
        }
        if (productDetails.getDescription() != null) {
            product.setDescription(productDetails.getDescription());
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
