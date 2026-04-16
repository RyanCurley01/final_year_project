package com.example.products.service;

import com.example.products.dto.ProductResponse;
import com.example.products.model.Product;
import com.example.products.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Product Service Unit Tests")
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private S3Service s3Service;

    @InjectMocks
    private ProductService productService;

    private Product testProduct;

    @BeforeEach
    void setUp() {
        testProduct = new Product();
        testProduct.setId(1L);
        testProduct.setAlbumTitle("Test Album");
        testProduct.setAlbumPrice(new BigDecimal("9.99"));
        testProduct.setAlbumCoverImageUrl("https://s3.amazonaws.com/bucket/cover.jpg");
        testProduct.setFileUrl("https://s3.amazonaws.com/bucket/song.mp3");
        testProduct.setPreviewUrl("https://s3.amazonaws.com/bucket/preview.mp3");
    }

    @Test
    @DisplayName("getAllProducts - Should return all products")
    void testGetAllProducts() {
        when(productRepository.findAll()).thenReturn(Arrays.asList(testProduct));

        List<Product> result = productService.getAllProducts();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAlbumTitle()).isEqualTo("Test Album");
        verify(productRepository).findAll();
    }

    @Test
    @DisplayName("getAllProductsWithSignedUrls - Should return products with signed URLs")
    void testGetAllProductsWithSignedUrls() {
        when(productRepository.findAll()).thenReturn(Arrays.asList(testProduct));
        when(s3Service.generatePresignedUrl(anyString())).thenReturn("https://signed-url.com/file");

        List<ProductResponse> result = productService.getAllProductsWithSignedUrls();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAlbumTitle()).isEqualTo("Test Album");
        assertThat(result.get(0).getAlbumCoverImageUrl()).isEqualTo("https://signed-url.com/file");
        verify(s3Service, times(3)).generatePresignedUrl(anyString());
    }

    @Test
    @DisplayName("getProductById - Should return product response when found")
    void testGetProductById() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));
        when(s3Service.generatePresignedUrl(anyString())).thenReturn("https://signed-url.com/file");

        ProductResponse result = productService.getProductById(1L);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
        assertThat(result.getAlbumTitle()).isEqualTo("Test Album");
    }

    @Test
    @DisplayName("getProductById - Should throw exception when not found")
    void testGetProductByIdNotFound() {
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> productService.getProductById(99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 99");
    }

    @Test
    @DisplayName("getProductsByAlbumCoverImageUrl - Should return matching products")
    void testGetProductsByAlbumCoverImageUrl() {
        String url = "https://s3.amazonaws.com/bucket/cover.jpg";
        when(productRepository.findByAlbumCoverImageUrl(url)).thenReturn(Arrays.asList(testProduct));

        List<Product> result = productService.getProductsByAlbumCoverImageUrl(url);

        assertThat(result).hasSize(1);
        verify(productRepository).findByAlbumCoverImageUrl(url);
    }

    @Test
    @DisplayName("createProduct - Should create product")
    void testCreateProduct() {
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        Product result = productService.createProduct(testProduct);

        assertThat(result.getId()).isEqualTo(1L);
        assertThat(result.getAlbumTitle()).isEqualTo("Test Album");
        verify(productRepository).save(testProduct);
    }

    @Test
    @DisplayName("updateProduct - Should update existing product")
    void testUpdateProduct() {
        Product updates = new Product();
        updates.setAlbumTitle("Updated Album");
        updates.setAlbumPrice(new BigDecimal("19.99"));

        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        productService.updateProduct(1L, updates);

        assertThat(testProduct.getAlbumTitle()).isEqualTo("Updated Album");
        assertThat(testProduct.getAlbumPrice()).isEqualTo(new BigDecimal("19.99"));
        verify(productRepository).save(testProduct);
    }

    @Test
    @DisplayName("updateProduct - Should update only provided fields")
    void testUpdateProductPartial() {
        Product updates = new Product();
        updates.setAlbumTitle("Partial Update");

        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        productService.updateProduct(1L, updates);

        assertThat(testProduct.getAlbumTitle()).isEqualTo("Partial Update");
        assertThat(testProduct.getAlbumPrice()).isEqualTo(new BigDecimal("9.99"));
        verify(productRepository).save(testProduct);
    }

    @Test
    @DisplayName("updateProduct - Should throw exception when not found")
    void testUpdateProductNotFound() {
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> productService.updateProduct(99L, new Product()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 99");
    }

    @Test
    @DisplayName("deleteProduct - Should delete product")
    void testDeleteProduct() {
        when(productRepository.existsById(1L)).thenReturn(true);

        productService.deleteProduct(1L);

        verify(productRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteProduct - Should throw exception when not found")
    void testDeleteProductNotFound() {
        when(productRepository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> productService.deleteProduct(99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 99");

        verify(productRepository, never()).deleteById(any());
    }

    @Test
    @DisplayName("updateProduct - Should update fileUrl and previewUrl")
    void testUpdateProductUrls() {
        Product updates = new Product();
        updates.setFileUrl("https://s3.amazonaws.com/bucket/new-song.mp3");
        updates.setPreviewUrl("https://s3.amazonaws.com/bucket/new-preview.mp3");
        updates.setAlbumCoverImageUrl("https://s3.amazonaws.com/bucket/new-cover.jpg");

        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        productService.updateProduct(1L, updates);

        assertThat(testProduct.getFileUrl()).isEqualTo("https://s3.amazonaws.com/bucket/new-song.mp3");
        assertThat(testProduct.getPreviewUrl()).isEqualTo("https://s3.amazonaws.com/bucket/new-preview.mp3");
        assertThat(testProduct.getAlbumCoverImageUrl()).isEqualTo("https://s3.amazonaws.com/bucket/new-cover.jpg");
        verify(productRepository).save(testProduct);
    }
}
