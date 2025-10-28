package com.example.purchasedproducts.controller;

import com.example.purchasedproducts.model.PurchasedProduct;
import com.example.purchasedproducts.service.PurchasedProductService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Arrays;
import java.util.Optional;

import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PurchasedProductController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("PurchasedProduct Controller Integration Tests")
class PurchasedProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PurchasedProductService purchasedProductService;

    private PurchasedProduct testPurchasedProduct;

    @BeforeEach
    void setUp() {
        testPurchasedProduct = new PurchasedProduct();
        testPurchasedProduct.setId(1L);
        testPurchasedProduct.setOrderItemId(1L);
        testPurchasedProduct.setProductId(5L);
    }

    @Test
    @DisplayName("GET /api/purchased-products/getAllPurchasedProducts - Should return all purchased products")
    void testGetAllPurchasedProducts() throws Exception {
        when(purchasedProductService.getAllPurchasedProducts()).thenReturn(Arrays.asList(testPurchasedProduct));

        mockMvc.perform(get("/api/purchased-products/getAllPurchasedProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/purchased-products/getAllPurchasedProducts - Should filter by orderItemId")
    void testGetPurchasedProductsByOrderItemId() throws Exception {
        when(purchasedProductService.getPurchasedProductsByOrderItemId(1L)).thenReturn(Arrays.asList(testPurchasedProduct));

        mockMvc.perform(get("/api/purchased-products/getAllPurchasedProducts").param("orderItemId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderItemId", is(1)));
    }

    @Test
    @DisplayName("GET /api/purchased-products/getAllPurchasedProducts - Should filter by productId")
    void testGetPurchasedProductsByProductId() throws Exception {
        when(purchasedProductService.getPurchasedProductsByProductId(5L)).thenReturn(Arrays.asList(testPurchasedProduct));

        mockMvc.perform(get("/api/purchased-products/getAllPurchasedProducts").param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/purchased-products/{id} - Should return purchased product by id")
    void testGetPurchasedProductById() throws Exception {
        when(purchasedProductService.getPurchasedProductById(1L)).thenReturn(Optional.of(testPurchasedProduct));

        mockMvc.perform(get("/api/purchased-products/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("GET /api/purchased-products/{id} - Should return 404 when not found")
    void testGetPurchasedProductByIdNotFound() throws Exception {
        when(purchasedProductService.getPurchasedProductById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/purchased-products/99"))
                .andExpect(status().isNotFound());
    }
}
