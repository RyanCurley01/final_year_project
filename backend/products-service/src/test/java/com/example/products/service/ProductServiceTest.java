package com.example.products.service;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Product Service Unit Tests")
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private ProductService productService;

    private Product testProduct;

    @BeforeEach
    void setUp() {
        testProduct = new Product();
        testProduct.setId(1L);
        testProduct.setGameTitle("Test Game");
        testProduct.setAlbumTitle("Test Album");
        testProduct.setPlatform("PC");
        testProduct.setArtist("Test Artist");
        testProduct.setGenre("Action");
        testProduct.setGamePrice(new BigDecimal("49.99"));
        testProduct.setAlbumPrice(new BigDecimal("9.99"));
        testProduct.setStockQuantity(100);
    }

    @Test
    @DisplayName("getAllProducts - Should return all products")
    void testGetAllProducts() {
        // ARRANGE
        Product product2 = new Product();
        product2.setId(2L);
        product2.setGameTitle("Another Game");

        List<Product> products = Arrays.asList(testProduct, product2);
        when(productRepository.findAll()).thenReturn(products);

        // ACT
        List<Product> result = productService.getAllProducts();

        // ASSERT
        assertThat(result).hasSize(2);
        assertThat(result.get(0).getGameTitle()).isEqualTo("Test Game");
        verify(productRepository).findAll();
    }

    @Test
    @DisplayName("getProductById - Should return product when found")
    void testGetProductById() {
        // ARRANGE
        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));

        // ACT
        Optional<Product> result = productService.getProductById(1L);

        // ASSERT
        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(1L);
        verify(productRepository).findById(1L);
    }

    @Test
    @DisplayName("getProductById - Should return empty when not found")
    void testGetProductByIdNotFound() {
        // ARRANGE
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT
        Optional<Product> result = productService.getProductById(99L);

        // ASSERT
        assertThat(result).isEmpty();
        verify(productRepository).findById(99L);
    }

    @Test
    @DisplayName("getProductsByGenre - Should return products by genre")
    void testGetProductsByGenre() {
        // ARRANGE
        List<Product> products = Arrays.asList(testProduct);
        when(productRepository.findByGenre("Action")).thenReturn(products);

        // ACT
        List<Product> result = productService.getProductsByGenre("Action");

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getGenre()).isEqualTo("Action");
        verify(productRepository).findByGenre("Action");
    }

    @Test
    @DisplayName("getProductsByArtist - Should return products by artist")
    void testGetProductsByArtist() {
        // ARRANGE
        List<Product> products = Arrays.asList(testProduct);
        when(productRepository.findByArtist("Test Artist")).thenReturn(products);

        // ACT
        List<Product> result = productService.getProductsByArtist("Test Artist");

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getArtist()).isEqualTo("Test Artist");
        verify(productRepository).findByArtist("Test Artist");
    }

    @Test
    @DisplayName("getProductsByPlatform - Should return products by platform")
    void testGetProductsByPlatform() {
        // ARRANGE
        List<Product> products = Arrays.asList(testProduct);
        when(productRepository.findByPlatform("PC")).thenReturn(products);

        // ACT
        List<Product> result = productService.getProductsByPlatform("PC");

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getPlatform()).isEqualTo("PC");
        verify(productRepository).findByPlatform("PC");
    }

    @Test
    @DisplayName("createProduct - Should create new product")
    void testCreateProduct() {
        // ARRANGE
        Product newProduct = new Product();
        newProduct.setGameTitle("New Game");

        Product savedProduct = new Product();
        savedProduct.setId(3L);
        savedProduct.setGameTitle("New Game");

        when(productRepository.save(any(Product.class))).thenReturn(savedProduct);

        // ACT
        Product result = productService.createProduct(newProduct);

        // ASSERT
        assertThat(result.getId()).isEqualTo(3L);
        assertThat(result.getGameTitle()).isEqualTo("New Game");
        verify(productRepository).save(newProduct);
    }

    @Test
    @DisplayName("updateProduct - Should update all fields")
    void testUpdateProduct() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGameTitle("Updated Game");
        updateDetails.setAlbumTitle("Updated Album");
        updateDetails.setPlatform("PS5");
        updateDetails.setArtist("Updated Artist");
        updateDetails.setGenre("RPG");
        updateDetails.setGamePrice(new BigDecimal("39.99"));
        updateDetails.setAlbumPrice(new BigDecimal("19.99"));
        updateDetails.setFileUrl("http://example.com/file");
        updateDetails.setPreviewUrl("http://example.com/preview");
        updateDetails.setStockQuantity(50);

        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        // ACT
        Product result = productService.updateProduct(1L, updateDetails);

        // ASSERT
        assertThat(result.getGameTitle()).isEqualTo("Updated Game");
        assertThat(result.getGenre()).isEqualTo("RPG");
        assertThat(result.getStockQuantity()).isEqualTo(50);
        verify(productRepository).findById(1L);
        verify(productRepository).save(testProduct);
    }

    @Test
    @DisplayName("updateProduct - Should update only non-null fields")
    void testUpdateProductPartial() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGameTitle("Updated Game");
        updateDetails.setGenre(null); // Should not update

        when(productRepository.findById(1L)).thenReturn(Optional.of(testProduct));
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        // ACT
        Product result = productService.updateProduct(1L, updateDetails);

        // ASSERT
        assertThat(result.getGameTitle()).isEqualTo("Updated Game");
        assertThat(result.getGenre()).isEqualTo("Action"); // Original value
        verify(productRepository).save(testProduct);
    }

    @Test
    @DisplayName("updateProduct - Should throw exception when product not found")
    void testUpdateProductNotFound() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGameTitle("Updated Game");

        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        assertThatThrownBy(() -> productService.updateProduct(99L, updateDetails))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 99");
        verify(productRepository).findById(99L);
        verify(productRepository, never()).save(any());
    }

    @Test
    @DisplayName("deleteProduct - Should delete existing product")
    void testDeleteProduct() {
        // ARRANGE
        when(productRepository.existsById(1L)).thenReturn(true);
        doNothing().when(productRepository).deleteById(1L);

        // ACT
        productService.deleteProduct(1L);

        // ASSERT
        verify(productRepository).existsById(1L);
        verify(productRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteProduct - Should throw exception when product not found")
    void testDeleteProductNotFound() {
        // ARRANGE
        when(productRepository.existsById(99L)).thenReturn(false);

        // ACT & ASSERT
        assertThatThrownBy(() -> productService.deleteProduct(99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 99");
        verify(productRepository).existsById(99L);
        verify(productRepository, never()).deleteById(any());
    }
}
