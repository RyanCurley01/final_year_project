package com.example.soldproducts.controller;

import com.example.soldproducts.model.SoldProduct;
import com.example.soldproducts.service.SoldProductService;
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

import java.util.Arrays;
import java.util.Optional;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SoldProductController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("SoldProduct Controller Integration Tests")
class SoldProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private SoldProductService soldProductService;

    private SoldProduct testSoldProduct;

    @BeforeEach
    void setUp() {
        testSoldProduct = new SoldProduct();
        testSoldProduct.setId(1L);
        testSoldProduct.setOrderItemId(1L);
        testSoldProduct.setProductId(5L);
    }

    @Test
    @DisplayName("GET /api/sold-products/getAllSoldProducts - Should return all sold products")
    void testGetAllSoldProducts() throws Exception {
        when(soldProductService.getAllSoldProducts()).thenReturn(Arrays.asList(testSoldProduct));

        mockMvc.perform(get("/api/sold-products/getAllSoldProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/sold-products/getAllSoldProducts - Should filter by orderItemId")
    void testGetSoldProductsByOrderItemId() throws Exception {
        when(soldProductService.getSoldProductsByOrderItemId(1L)).thenReturn(Arrays.asList(testSoldProduct));

        mockMvc.perform(get("/api/sold-products/getAllSoldProducts").param("orderItemId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderItemId", is(1)));
    }

    @Test
    @DisplayName("GET /api/sold-products/getAllSoldProducts - Should filter by productId")
    void testGetSoldProductsByProductId() throws Exception {
        when(soldProductService.getSoldProductsByProductId(5L)).thenReturn(Arrays.asList(testSoldProduct));

        mockMvc.perform(get("/api/sold-products/getAllSoldProducts").param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/sold-products/{id} - Should return sold product by id")
    void testGetSoldProductById() throws Exception {
        when(soldProductService.getSoldProductById(1L)).thenReturn(Optional.of(testSoldProduct));

        mockMvc.perform(get("/api/sold-products/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("GET /api/sold-products/{id} - Should return 404 when not found")
    void testGetSoldProductByIdNotFound() throws Exception {
        when(soldProductService.getSoldProductById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/sold-products/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/sold-products - Should create sold product")
    void testCreateSoldProduct() throws Exception {
        SoldProduct newProduct = new SoldProduct();
        newProduct.setId(2L);
        newProduct.setOrderItemId(3L);
        newProduct.setProductId(10L);

        when(soldProductService.createSoldProduct(any(SoldProduct.class))).thenReturn(newProduct);

        mockMvc.perform(post("/api/sold-products")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newProduct)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(2)))
                .andExpect(jsonPath("$.orderItemId", is(3)))
                .andExpect(jsonPath("$.productId", is(10)));
    }
}
