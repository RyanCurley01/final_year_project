package com.example.stock.service;

import com.example.stock.model.Stock;
import com.example.stock.repository.StockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Stock Service Unit Tests")
class StockServiceTest {

    @Mock
    private StockRepository stockRepository;

    @InjectMocks
    private StockService stockService;

    private Stock testStock;

    @BeforeEach
    void setUp() {
        testStock = new Stock();
        testStock.setId(1L);
        testStock.setProductId(5L);
        testStock.setStockQuantity(100);
    }

    @Test
    @DisplayName("getAllStock - Should return all stock")
    void testGetAllStock() {
        when(stockRepository.findAll()).thenReturn(Arrays.asList(testStock));

        assertThat(stockService.getAllStock()).hasSize(1);
    }

    @Test
    @DisplayName("getStockById - Should return stock when found")
    void testGetStockById() {
        when(stockRepository.findById(1L)).thenReturn(Optional.of(testStock));

        assertThat(stockService.getStockById(1L)).isPresent();
    }

    @Test
    @DisplayName("getStockByProductId - Should return stock for product")
    void testGetStockByProductId() {
        when(stockRepository.findByProductId(5L)).thenReturn(Optional.of(testStock));

        assertThat(stockService.getStockByProductId(5L)).isPresent();
    }

    @Test
    @DisplayName("createStock - Should create stock")
    void testCreateStock() {
        when(stockRepository.existsByProductId(5L)).thenReturn(false);
        when(stockRepository.save(any(Stock.class))).thenReturn(testStock);

        assertThat(stockService.createStock(testStock).getId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("createStock - Should throw exception when stock exists")
    void testCreateStockAlreadyExists() {
        when(stockRepository.existsByProductId(5L)).thenReturn(true);

        assertThatThrownBy(() -> stockService.createStock(testStock))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("updateStock - Should update stock")
    void testUpdateStock() {
        Stock updates = new Stock();
        updates.setStockQuantity(50);

        when(stockRepository.findById(1L)).thenReturn(Optional.of(testStock));
        when(stockRepository.save(any(Stock.class))).thenReturn(testStock);

        stockService.updateStock(1L, updates);

        verify(stockRepository).save(testStock);
    }

    @Test
    @DisplayName("updateStock - Should throw exception when stock not found")
    void testUpdateStockNotFound() {
        Stock updates = new Stock();
        updates.setStockQuantity(50);

        when(stockRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> stockService.updateStock(999L, updates))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Stock not found with id: 999");
    }

    @Test
    @DisplayName("updateStock - Should update productId when changed")
    void testUpdateStockWithNewProductId() {
        Stock updates = new Stock();
        updates.setProductId(10L);
        updates.setStockQuantity(75);

        when(stockRepository.findById(1L)).thenReturn(Optional.of(testStock));
        when(stockRepository.existsByProductId(10L)).thenReturn(false);
        when(stockRepository.save(any(Stock.class))).thenReturn(testStock);

        Stock result = stockService.updateStock(1L, updates);

        verify(stockRepository).save(testStock);
        assertThat(testStock.getProductId()).isEqualTo(10L);
        assertThat(testStock.getStockQuantity()).isEqualTo(75);
    }

    @Test
    @DisplayName("updateStock - Should throw exception when new productId already exists")
    void testUpdateStockProductIdAlreadyExists() {
        Stock updates = new Stock();
        updates.setProductId(10L);

        when(stockRepository.findById(1L)).thenReturn(Optional.of(testStock));
        when(stockRepository.existsByProductId(10L)).thenReturn(true);

        assertThatThrownBy(() -> stockService.updateStock(1L, updates))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Stock already exists for product ID: 10");
    }

    @Test
    @DisplayName("deleteStock - Should delete stock")
    void testDeleteStock() {
        when(stockRepository.existsById(1L)).thenReturn(true);

        stockService.deleteStock(1L);

        verify(stockRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteStock - Should throw exception when stock not found")
    void testDeleteStockNotFound() {
        when(stockRepository.existsById(999L)).thenReturn(false);

        assertThatThrownBy(() -> stockService.deleteStock(999L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Stock not found with id: 999");

        verify(stockRepository, never()).deleteById(any());
    }
}
