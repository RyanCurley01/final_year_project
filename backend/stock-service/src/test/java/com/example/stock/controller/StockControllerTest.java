package com.example.stock.controller;

import com.example.stock.model.Stock;
import com.example.stock.service.StockService;
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
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StockController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Stock Controller Integration Tests")
class StockControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private StockService stockService;

    @Autowired
    private ObjectMapper objectMapper;

    private Stock testStock;

    @BeforeEach
    void setUp() {
        testStock = new Stock();
        testStock.setId(1L);
        testStock.setProductId(5L);
        testStock.setStockQuantity(100);
    }

    @Test
    @DisplayName("GET /api/stock/getAllStock - Should return all stock")
    void testGetAllStock() throws Exception {
        when(stockService.getAllStock()).thenReturn(Arrays.asList(testStock));

        mockMvc.perform(get("/api/stock/getAllStock"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/stock/getAllStock - Should filter by productId")
    void testGetStockByProductId() throws Exception {
        when(stockService.getStockByProductId(5L)).thenReturn(Optional.of(testStock));

        mockMvc.perform(get("/api/stock/getAllStock").param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/stock/{id} - Should return stock by id")
    void testGetStockById() throws Exception {
        when(stockService.getStockById(1L)).thenReturn(Optional.of(testStock));

        mockMvc.perform(get("/api/stock/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("POST /api/stock - Should create stock")
    void testCreateStock() throws Exception {
        when(stockService.createStock(any(Stock.class))).thenReturn(testStock);

        mockMvc.perform(post("/api/stock")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testStock)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("POST /api/stock - Should return 400 when stock exists")
    void testCreateStockAlreadyExists() throws Exception {
        when(stockService.createStock(any(Stock.class)))
                .thenThrow(new IllegalArgumentException("Stock exists"));

        mockMvc.perform(post("/api/stock")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testStock)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PUT /api/stock/{id} - Should update stock")
    void testUpdateStock() throws Exception {
        when(stockService.updateStock(any(Long.class), any(Stock.class))).thenReturn(testStock);

        mockMvc.perform(put("/api/stock/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testStock)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("DELETE /api/stock/{id} - Should delete stock")
    void testDeleteStock() throws Exception {
        mockMvc.perform(delete("/api/stock/1"))
                .andExpect(status().isNoContent());
    }
}
