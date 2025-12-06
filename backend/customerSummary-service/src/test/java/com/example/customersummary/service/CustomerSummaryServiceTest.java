package com.example.customersummary.service;

import com.example.customersummary.model.CustomerSummary;
import com.example.customersummary.repository.CustomerSummaryRepository;
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
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
@DisplayName("CustomerSummary Service Unit Tests")
class CustomerSummaryServiceTest {

    @Mock
    private CustomerSummaryRepository customerSummaryRepository;

    @InjectMocks
    private CustomerSummaryService customerSummaryService;

    private CustomerSummary testCustomerSummary;

    @BeforeEach
    void setUp() {
        testCustomerSummary = new CustomerSummary();
        testCustomerSummary.setId(1L);
        testCustomerSummary.setAccountId(4L);
        testCustomerSummary.setProductId(5L);
        testCustomerSummary.setOrderId(1L);
    }

    @Test
    @DisplayName("getAllCustomerSummaries - Should return all summaries")
    void testGetAllCustomerSummaries() {
        when(customerSummaryRepository.findAll()).thenReturn(Arrays.asList(testCustomerSummary));

        assertThat(customerSummaryService.getAllCustomerSummaries()).hasSize(1);
        verify(customerSummaryRepository).findAll();
    }

    @Test
    @DisplayName("getCustomerSummaryById - Should return summary when found")
    void testGetCustomerSummaryById() {
        when(customerSummaryRepository.findById(1L)).thenReturn(Optional.of(testCustomerSummary));

        assertThat(customerSummaryService.getCustomerSummaryById(1L)).isPresent();
    }

    @Test
    @DisplayName("getCustomerSummariesByAccountId - Should return summaries for account")
    void testGetCustomerSummariesByAccountId() {
        when(customerSummaryRepository.findByAccountId(4L)).thenReturn(Arrays.asList(testCustomerSummary));

        assertThat(customerSummaryService.getCustomerSummariesByAccountId(4L)).hasSize(1);
    }

    @Test
    @DisplayName("getCustomerSummariesByProductId - Should return summaries for product")
    void testGetCustomerSummariesByProductId() {
        when(customerSummaryRepository.findByProductId(5L)).thenReturn(Arrays.asList(testCustomerSummary));

        assertThat(customerSummaryService.getCustomerSummariesByProductId(5L)).hasSize(1);
    }

    @Test
    @DisplayName("getCustomerSummariesByOrderId - Should return summaries for order")
    void testGetCustomerSummariesByOrderId() {
        when(customerSummaryRepository.findByOrderId(1L)).thenReturn(Arrays.asList(testCustomerSummary));

        assertThat(customerSummaryService.getCustomerSummariesByOrderId(1L)).hasSize(1);
    }

    @Test
    @DisplayName("createCustomerSummary - Should create customer summary")
    void testCreateCustomerSummary() {
        when(customerSummaryRepository.save(any(CustomerSummary.class))).thenReturn(testCustomerSummary);

        CustomerSummary result = customerSummaryService.createCustomerSummary(testCustomerSummary);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
        assertThat(result.getAccountId()).isEqualTo(4L);
        assertThat(result.getProductId()).isEqualTo(5L);
        assertThat(result.getOrderId()).isEqualTo(1L);
        verify(customerSummaryRepository).save(testCustomerSummary);
    }

    @Test
    @DisplayName("deleteCustomerSummary - Should delete customer summary when exists")
    void testDeleteCustomerSummary() {
        when(customerSummaryRepository.existsById(1L)).thenReturn(true);

        customerSummaryService.deleteCustomerSummary(1L);

        verify(customerSummaryRepository).existsById(1L);
        verify(customerSummaryRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteCustomerSummary - Should throw exception when not found")
    void testDeleteCustomerSummaryNotFound() {
        when(customerSummaryRepository.existsById(999L)).thenReturn(false);

        assertThatThrownBy(() -> customerSummaryService.deleteCustomerSummary(999L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Customer summary not found with id: 999");

        verify(customerSummaryRepository).existsById(999L);
        verify(customerSummaryRepository, never()).deleteById(any());
    }
}
