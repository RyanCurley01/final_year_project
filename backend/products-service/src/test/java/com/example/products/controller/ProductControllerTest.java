package com.example.products.controller;

import com.example.products.dto.ProductResponse;
import com.example.products.model.Product;
import com.example.products.service.ProductService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProductController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Product Controller Integration Tests")
class ProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProductService productService;

    @Autowired
    private ObjectMapper objectMapper;

    private Product testProduct;
    private ProductResponse testProductResponse;

    @BeforeEach
    void setUp() {
        testProduct = new Product();
        testProduct.setId(1L);
        testProduct.setAlbumTitle("Test Album");
        testProduct.setAlbumPrice(new BigDecimal("9.99"));
        testProduct.setAlbumCoverImageUrl("https://s3.amazonaws.com/bucket/cover.jpg");
        testProduct.setFileUrl("https://s3.amazonaws.com/bucket/song.mp3");
        testProduct.setPreviewUrl("https://s3.amazonaws.com/bucket/preview.mp3");

        testProductResponse = new ProductResponse(
                1L,
                "Test Album",
                new BigDecimal("9.99"),
                "https://signed-url.com/cover.jpg",
                "https://signed-url.com/song.mp3",
                "https://signed-url.com/preview.mp3"
        );
    }

    @Test
    @DisplayName("GET /api/products/health - Should return health status")
    void testHealthCheck() throws Exception {
        mockMvc.perform(get("/api/products/health"))
                .andExpect(status().isOk())
                .andExpect(content().string("Products Service is Healthy"));
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts - Should return all products with signed URLs")
    void testGetAllProducts() throws Exception {
        ProductResponse response2 = new ProductResponse(
                2L, "Another Album", new BigDecimal("14.99"),
                "https://signed-url.com/cover2.jpg",
                "https://signed-url.com/song2.mp3",
                "https://signed-url.com/preview2.mp3"
        );

        when(productService.getAllProductsWithSignedUrls())
                .thenReturn(Arrays.asList(testProductResponse, response2));

        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].albumTitle", is("Test Album")))
                .andExpect(jsonPath("$[0].albumPrice", is(9.99)))
                .andExpect(jsonPath("$[0].albumCoverImageUrl", is("https://signed-url.com/cover.jpg")))
                .andExpect(jsonPath("$[0].fileUrl", is("https://signed-url.com/song.mp3")))
                .andExpect(jsonPath("$[0].previewUrl", is("https://signed-url.com/preview.mp3")))
                .andExpect(jsonPath("$[1].albumTitle", is("Another Album")));
    }

    @Test
    @DisplayName("GET /api/products - Should return all products (root path)")
    void testGetAllProductsRootPath() throws Exception {
        when(productService.getAllProductsWithSignedUrls())
                .thenReturn(Arrays.asList(testProductResponse));

        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/products/{id} - Should return product by id")
    void testGetProductById() throws Exception {
        when(productService.getProductById(1L)).thenReturn(testProductResponse);

        mockMvc.perform(get("/api/products/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.albumTitle", is("Test Album")))
                .andExpect(jsonPath("$.albumPrice", is(9.99)))
                .andExpect(jsonPath("$.albumCoverImageUrl", is("https://signed-url.com/cover.jpg")));
    }

    @Test
    @DisplayName("GET /api/products/{id} - Should return 404 when not found")
    void testGetProductByIdNotFound() throws Exception {
        when(productService.getProductById(99L))
                .thenThrow(new IllegalArgumentException("Product not found with id: 99"));

        mockMvc.perform(get("/api/products/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/products - Should create new product")
    void testCreateProduct() throws Exception {
        when(productService.createProduct(any(Product.class))).thenReturn(testProduct);

        mockMvc.perform(post("/api/products")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testProduct)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.albumTitle", is("Test Album")))
                .andExpect(jsonPath("$.albumPrice", is(9.99)));
    }

    @Test
    @DisplayName("PUT /api/products/{id} - Should update product")
    void testUpdateProduct() throws Exception {
        Product updatedProduct = new Product();
        updatedProduct.setId(1L);
        updatedProduct.setAlbumTitle("Updated Album");
        updatedProduct.setAlbumPrice(new BigDecimal("19.99"));
        updatedProduct.setAlbumCoverImageUrl("https://s3.amazonaws.com/bucket/cover.jpg");
        updatedProduct.setFileUrl("https://s3.amazonaws.com/bucket/song.mp3");
        updatedProduct.setPreviewUrl("https://s3.amazonaws.com/bucket/preview.mp3");

        when(productService.updateProduct(any(Long.class), any(Product.class))).thenReturn(updatedProduct);

        mockMvc.perform(put("/api/products/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updatedProduct)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.albumTitle", is("Updated Album")))
                .andExpect(jsonPath("$.albumPrice", is(19.99)));
    }

    @Test
    @DisplayName("PUT /api/products/{id} - Should return 404 when not found")
    void testUpdateProductNotFound() throws Exception {
        when(productService.updateProduct(any(Long.class), any(Product.class)))
                .thenThrow(new IllegalArgumentException("Product not found"));

        mockMvc.perform(put("/api/products/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testProduct)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("DELETE /api/products/{id} - Should delete product")
    void testDeleteProduct() throws Exception {
        mockMvc.perform(delete("/api/products/1"))
                .andExpect(status().isNoContent());

        verify(productService).deleteProduct(1L);
    }

    @Test
    @DisplayName("DELETE /api/products/{id} - Should return 404 when not found")
    void testDeleteProductNotFound() throws Exception {
        doThrow(new IllegalArgumentException("Product not found"))
                .when(productService).deleteProduct(99L);

        mockMvc.perform(delete("/api/products/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts - Should return empty list when no products")
    void testGetAllProductsEmpty() throws Exception {
        when(productService.getAllProductsWithSignedUrls()).thenReturn(List.of());

        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }
}
