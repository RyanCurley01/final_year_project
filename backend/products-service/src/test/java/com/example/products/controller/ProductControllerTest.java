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

/**
 * Integration Tests for ProductController.
 *
 * The list endpoint is @GetMapping(value = {"", "/"}) — it maps to both /api/products
 * and /api/products/. There is no /getAllProducts path on this controller.
 * The albumCoverImageUrl query parameter is accepted but unused (filtering is in the
 * service layer), so no filter branching occurs at the controller level.
 */
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

    // -------------------------------------------------------------------------
    // GET /api/products/health
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/products/health - Should return health status string")
    void testHealthCheck() throws Exception {
        mockMvc.perform(get("/api/products/health"))
                .andExpect(status().isOk())
                .andExpect(content().string("Products Service is Healthy"));
    }

    // -------------------------------------------------------------------------
    // GET /api/products  (and /api/products/)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/products - Should return all products with signed URLs")
    void testGetAllProducts() throws Exception {
        // ARRANGE
        ProductResponse response2 = new ProductResponse(
                2L, "Another Album", new BigDecimal("14.99"),
                "https://signed-url.com/cover2.jpg",
                "https://signed-url.com/song2.mp3",
                "https://signed-url.com/preview2.mp3"
        );

        when(productService.getAllProductsWithSignedUrls())
                .thenReturn(Arrays.asList(testProductResponse, response2));

        // ACT & ASSERT
        mockMvc.perform(get("/api/products"))
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
    @DisplayName("GET /api/products/ - Trailing slash should also return all products")
    void testGetAllProductsTrailingSlash() throws Exception {
        // ARRANGE
        when(productService.getAllProductsWithSignedUrls())
                .thenReturn(Arrays.asList(testProductResponse));

        // ACT & ASSERT
        mockMvc.perform(get("/api/products/"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/products - Should return empty list when no products exist")
    void testGetAllProductsEmpty() throws Exception {
        // ARRANGE
        when(productService.getAllProductsWithSignedUrls()).thenReturn(List.of());

        // ACT & ASSERT
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("GET /api/products?albumCoverImageUrl=x - Should ignore unused query param and return all products")
    void testGetAllProductsWithIgnoredQueryParam() throws Exception {
        // ARRANGE — the controller accepts this param but does nothing with it
        when(productService.getAllProductsWithSignedUrls())
                .thenReturn(Arrays.asList(testProductResponse));

        // ACT & ASSERT
        mockMvc.perform(get("/api/products").param("albumCoverImageUrl", "https://example.com/cover.jpg"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        verify(productService).getAllProductsWithSignedUrls();
    }

    // -------------------------------------------------------------------------
    // GET /api/products/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/products/{id} - Should return product with signed URLs by id")
    void testGetProductById() throws Exception {
        // ARRANGE
        when(productService.getProductById(1L)).thenReturn(testProductResponse);

        // ACT & ASSERT
        mockMvc.perform(get("/api/products/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.albumTitle", is("Test Album")))
                .andExpect(jsonPath("$.albumPrice", is(9.99)))
                .andExpect(jsonPath("$.albumCoverImageUrl", is("https://signed-url.com/cover.jpg")))
                .andExpect(jsonPath("$.fileUrl", is("https://signed-url.com/song.mp3")))
                .andExpect(jsonPath("$.previewUrl", is("https://signed-url.com/preview.mp3")));
    }

    @Test
    @DisplayName("GET /api/products/{id} - Should return 404 when not found")
    void testGetProductByIdNotFound() throws Exception {
        // ARRANGE
        when(productService.getProductById(99L))
                .thenThrow(new IllegalArgumentException("Product not found with id: 99"));

        // ACT & ASSERT
        mockMvc.perform(get("/api/products/99"))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // POST /api/products
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/products - Should create new product and return 201")
    void testCreateProduct() throws Exception {
        // ARRANGE
        when(productService.createProduct(any(Product.class))).thenReturn(testProduct);

        // ACT & ASSERT
        mockMvc.perform(post("/api/products")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testProduct)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.albumTitle", is("Test Album")))
                .andExpect(jsonPath("$.albumPrice", is(9.99)));
    }

    // -------------------------------------------------------------------------
    // PUT /api/products/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("PUT /api/products/{id} - Should update product")
    void testUpdateProduct() throws Exception {
        // ARRANGE
        Product updatedProduct = new Product();
        updatedProduct.setId(1L);
        updatedProduct.setAlbumTitle("Updated Album");
        updatedProduct.setAlbumPrice(new BigDecimal("19.99"));
        updatedProduct.setAlbumCoverImageUrl("https://s3.amazonaws.com/bucket/cover.jpg");
        updatedProduct.setFileUrl("https://s3.amazonaws.com/bucket/song.mp3");
        updatedProduct.setPreviewUrl("https://s3.amazonaws.com/bucket/preview.mp3");

        when(productService.updateProduct(any(Long.class), any(Product.class))).thenReturn(updatedProduct);

        // ACT & ASSERT
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
        // ARRANGE
        when(productService.updateProduct(any(Long.class), any(Product.class)))
                .thenThrow(new IllegalArgumentException("Product not found"));

        // ACT & ASSERT
        mockMvc.perform(put("/api/products/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testProduct)))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // DELETE /api/products/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("DELETE /api/products/{id} - Should delete product and return 204")
    void testDeleteProduct() throws Exception {
        // ARRANGE
        doNothing().when(productService).deleteProduct(1L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/products/1"))
                .andExpect(status().isNoContent());

        verify(productService).deleteProduct(1L);
    }

    @Test
    @DisplayName("DELETE /api/products/{id} - Should return 404 when not found")
    void testDeleteProductNotFound() throws Exception {
        // ARRANGE
        doThrow(new IllegalArgumentException("Product not found"))
                .when(productService).deleteProduct(99L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/products/99"))
                .andExpect(status().isNotFound());
    }
}
