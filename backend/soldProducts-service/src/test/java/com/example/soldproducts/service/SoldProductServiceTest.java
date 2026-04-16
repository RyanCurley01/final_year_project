package com.example.soldproducts.service;

import com.example.soldproducts.model.SoldProduct;
import com.example.soldproducts.repository.SoldProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("SoldProduct Service Unit Tests")
class SoldProductServiceTest {

    @Mock
    private SoldProductRepository soldProductRepository;

    @InjectMocks
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
    @DisplayName("getAllSoldProducts - Should return all sold products")
    void testGetAllSoldProducts() {
        when(soldProductRepository.findAll()).thenReturn(Arrays.asList(testSoldProduct));

        assertThat(soldProductService.getAllSoldProducts()).hasSize(1);
        verify(soldProductRepository).findAll();
    }

    @Test
    @DisplayName("getSoldProductById - Should return sold product when found")
    void testGetSoldProductById() {
        when(soldProductRepository.findById(1L)).thenReturn(Optional.of(testSoldProduct));

        assertThat(soldProductService.getSoldProductById(1L)).isPresent();
    }

    @Test
    @DisplayName("getSoldProductsByOrderItemId - Should return sold products for order item")
    void testGetSoldProductsByOrderItemId() {
        when(soldProductRepository.findByOrderItemId(1L)).thenReturn(Arrays.asList(testSoldProduct));

        assertThat(soldProductService.getSoldProductsByOrderItemId(1L)).hasSize(1);
    }

    @Test
    @DisplayName("getSoldProductsByProductId - Should return sold products for product")
    void testGetSoldProductsByProductId() {
        when(soldProductRepository.findByProductId(5L)).thenReturn(Arrays.asList(testSoldProduct));

        assertThat(soldProductService.getSoldProductsByProductId(5L)).hasSize(1);
    }

    @Test
    @DisplayName("createSoldProduct - Should save and return sold product")
    void testCreateSoldProduct() {
        when(soldProductRepository.save(any(SoldProduct.class))).thenReturn(testSoldProduct);

        SoldProduct result = soldProductService.createSoldProduct(testSoldProduct);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
        verify(soldProductRepository).save(testSoldProduct);
    }

    @Test
    @DisplayName("deleteSoldProduct - Should delete when exists")
    void testDeleteSoldProduct() {
        when(soldProductRepository.existsById(1L)).thenReturn(true);

        soldProductService.deleteSoldProduct(1L);

        verify(soldProductRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteSoldProduct - Should throw when not found")
    void testDeleteSoldProductNotFound() {
        when(soldProductRepository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> soldProductService.deleteSoldProduct(99L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
