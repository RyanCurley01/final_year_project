package com.example.payments.service;

import com.example.payments.model.Payment;
import com.example.payments.repository.PaymentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Payment Service Unit Tests")
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @InjectMocks
    private PaymentService paymentService;

    private Payment testPayment;

    @BeforeEach
    void setUp() {
        testPayment = new Payment();
        testPayment.setId(1L);
        testPayment.setOrderId(1L);
        testPayment.setProductId(5L);
        testPayment.setAccountId(4L);
        testPayment.setPaymentAmount(new BigDecimal("99.99"));
        testPayment.setPaymentStatus("Completed");
        testPayment.setPaymentDateAndTime(LocalDateTime.now());
    }

    @Test
    @DisplayName("getAllPayments - Should return all payments")
    void testGetAllPayments() {
        when(paymentRepository.findAll()).thenReturn(Arrays.asList(testPayment));

        assertThat(paymentService.getAllPayments()).hasSize(1);
        verify(paymentRepository).findAll();
    }

    @Test
    @DisplayName("getPaymentById - Should return payment when found")
    void testGetPaymentById() {
        when(paymentRepository.findById(1L)).thenReturn(Optional.of(testPayment));

        assertThat(paymentService.getPaymentById(1L)).isPresent();
    }

    @Test
    @DisplayName("getPaymentsByOrderId - Should return payments for order")
    void testGetPaymentsByOrderId() {
        when(paymentRepository.findByOrderId(1L)).thenReturn(Arrays.asList(testPayment));

        assertThat(paymentService.getPaymentsByOrderId(1L)).hasSize(1);
    }

    @Test
    @DisplayName("getPaymentsByCustomerId - Should return payments for customer")
    void testGetPaymentsByCustomerId() {
        when(paymentRepository.findByAccountId(4L)).thenReturn(Arrays.asList(testPayment));

        assertThat(paymentService.getPaymentsByCustomerId(4L)).hasSize(1);
    }

    @Test
    @DisplayName("getPaymentsByStatus - Should return payments by status")
    void testGetPaymentsByStatus() {
        when(paymentRepository.findByPaymentStatus("Completed")).thenReturn(Arrays.asList(testPayment));

        assertThat(paymentService.getPaymentsByStatus("Completed")).hasSize(1);
    }

    @Test
    @DisplayName("createPayment - Should create payment")
    void testCreatePayment() {
        when(paymentRepository.save(any(Payment.class))).thenReturn(testPayment);

        assertThat(paymentService.createPayment(testPayment).getId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("updatePayment - Should update payment")
    void testUpdatePayment() {
        Payment updates = new Payment();
        updates.setPaymentStatus("Pending");

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(testPayment));
        when(paymentRepository.save(any(Payment.class))).thenReturn(testPayment);

        paymentService.updatePayment(1L, updates);

        verify(paymentRepository).save(testPayment);
    }

    @Test
    @DisplayName("updatePayment - Should throw exception when not found")
    void testUpdatePaymentNotFound() {
        when(paymentRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> paymentService.updatePayment(99L, new Payment()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("deletePayment - Should delete payment")
    void testDeletePayment() {
        when(paymentRepository.existsById(1L)).thenReturn(true);

        paymentService.deletePayment(1L);

        verify(paymentRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deletePayment - Should throw exception when not found")
    void testDeletePaymentNotFound() {
        when(paymentRepository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> paymentService.deletePayment(99L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
