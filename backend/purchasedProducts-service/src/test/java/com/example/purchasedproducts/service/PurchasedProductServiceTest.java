package com.example.purchasedproducts.service;

import com.example.purchasedproducts.model.PurchasedProduct;
import com.example.purchasedproducts.repository.PurchasedProductRepository;
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
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("PurchasedProduct Service Unit Tests")
class PurchasedProductServiceTest {

    @Mock
    private PurchasedProductRepository purchasedProductRepository;

    @InjectMocks
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
    @DisplayName("getAllPurchasedProducts - Should return all purchased products")
    void testGetAllPurchasedProducts() {
        when(purchasedProductRepository.findAll()).thenReturn(Arrays.asList(testPurchasedProduct));

        assertThat(purchasedProductService.getAllPurchasedProducts()).hasSize(1);
        verify(purchasedProductRepository).findAll();
    }

    @Test
    @DisplayName("getPurchasedProductById - Should return purchased product when found")
    void testGetPurchasedProductById() {
        when(purchasedProductRepository.findById(1L)).thenReturn(Optional.of(testPurchasedProduct));

        assertThat(purchasedProductService.getPurchasedProductById(1L)).isPresent();
    }

    @Test
    @DisplayName("getPurchasedProductsByOrderItemId - Should return purchased products for order item")
    void testGetPurchasedProductsByOrderItemId() {
        when(purchasedProductRepository.findByOrderItemId(1L)).thenReturn(Arrays.asList(testPurchasedProduct));

        assertThat(purchasedProductService.getPurchasedProductsByOrderItemId(1L)).hasSize(1);
    }

    @Test
    @DisplayName("getPurchasedProductsByProductId - Should return purchased products for product")
    void testGetPurchasedProductsByProductId() {
        when(purchasedProductRepository.findByProductId(5L)).thenReturn(Arrays.asList(testPurchasedProduct));

        assertThat(purchasedProductService.getPurchasedProductsByProductId(5L)).hasSize(1);
    }
}
