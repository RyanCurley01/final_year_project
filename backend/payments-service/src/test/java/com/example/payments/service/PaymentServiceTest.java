package com.example.payments.service;

import com.example.payments.model.Payment;
import com.example.payments.repository.PaymentRepository;
import com.paypal.core.PayPalHttpClient;
import com.paypal.http.HttpResponse;
import com.paypal.orders.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Payment Service Unit Tests")
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private PayPalHttpClient payPalHttpClient;

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

    @Test
    @DisplayName("getPaymentByPaypalOrderId - Should return payment when found")
    void testGetPaymentByPaypalOrderId() {
        testPayment.setPaypalOrderId("PAYPAL-123");
        when(paymentRepository.findByPaypalOrderId("PAYPAL-123")).thenReturn(Optional.of(testPayment));

        assertThat(paymentService.getPaymentByPaypalOrderId("PAYPAL-123")).isPresent();
    }

    @Test
    @DisplayName("getPaymentByPaypalOrderId - Should return empty when not found")
    void testGetPaymentByPaypalOrderIdNotFound() {
        when(paymentRepository.findByPaypalOrderId("INVALID")).thenReturn(Optional.empty());

        assertThat(paymentService.getPaymentByPaypalOrderId("INVALID")).isEmpty();
    }

    @Test
    @DisplayName("updatePayment - Should update only provided fields")
    void testUpdatePaymentPartialUpdate() {
        Payment updates = new Payment();
        updates.setPaymentAmount(new BigDecimal("149.99"));

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(testPayment));
        when(paymentRepository.save(any(Payment.class))).thenReturn(testPayment);

        paymentService.updatePayment(1L, updates);

        assertThat(testPayment.getPaymentAmount()).isEqualTo(new BigDecimal("149.99"));
        assertThat(testPayment.getPaymentStatus()).isEqualTo("Completed");
        verify(paymentRepository).save(testPayment);
    }

    @Test
    @DisplayName("updatePayment - Should update all fields when provided")
    void testUpdatePaymentAllFields() {
        LocalDateTime newDateTime = LocalDateTime.of(2026, 6, 15, 10, 30);
        Payment updates = new Payment();
        updates.setOrderId(10L);
        updates.setProductId(20L);
        updates.setAccountId(30L);
        updates.setPaymentAmount(new BigDecimal("250.00"));
        updates.setPaymentStatus("Refunded");
        updates.setPaymentDateAndTime(newDateTime);

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(testPayment));
        when(paymentRepository.save(any(Payment.class))).thenReturn(testPayment);

        paymentService.updatePayment(1L, updates);

        assertThat(testPayment.getOrderId()).isEqualTo(10L);
        assertThat(testPayment.getProductId()).isEqualTo(20L);
        assertThat(testPayment.getAccountId()).isEqualTo(30L);
        assertThat(testPayment.getPaymentAmount()).isEqualTo(new BigDecimal("250.00"));
        assertThat(testPayment.getPaymentStatus()).isEqualTo("Refunded");
        assertThat(testPayment.getPaymentDateAndTime()).isEqualTo(newDateTime);
        verify(paymentRepository).save(testPayment);
    }

    // ===== PayPal Integration Method Tests ===== //

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("createPayPalOrder - Should create order via PayPal SDK")
    void testCreatePayPalOrder() throws IOException {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-001");

        HttpResponse<Order> mockResponse = mock(HttpResponse.class);
        when(mockResponse.result()).thenReturn(mockOrder);
        when(payPalHttpClient.execute(any(OrdersCreateRequest.class))).thenReturn(mockResponse);

        Order result = paymentService.createPayPalOrder(new BigDecimal("49.99"), "USD", 1L, 5L, 4L);

        assertThat(result.id()).isEqualTo("PAYPAL-ORDER-001");
        verify(payPalHttpClient).execute(any(OrdersCreateRequest.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("createPayPalOrder - Simple 2-arg overload should delegate")
    void testCreatePayPalOrderSimple() throws IOException {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-002");

        HttpResponse<Order> mockResponse = mock(HttpResponse.class);
        when(mockResponse.result()).thenReturn(mockOrder);
        when(payPalHttpClient.execute(any(OrdersCreateRequest.class))).thenReturn(mockResponse);

        Order result = paymentService.createPayPalOrder(new BigDecimal("19.99"), "EUR");

        assertThat(result.id()).isEqualTo("PAYPAL-ORDER-002");
    }

    @Test
    @DisplayName("createPayPalOrder - Should throw IOException on failure")
    void testCreatePayPalOrderFailure() throws IOException {
        when(payPalHttpClient.execute(any(OrdersCreateRequest.class))).thenThrow(new IOException("PayPal error"));

        assertThatThrownBy(() -> paymentService.createPayPalOrder(new BigDecimal("10.00"), "USD"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("PayPal error");
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("capturePayPalOrder - Should capture and create payment record")
    void testCapturePayPalOrder() throws IOException {
        AmountWithBreakdown amount = mock(AmountWithBreakdown.class);
        when(amount.value()).thenReturn("99.99");

        PurchaseUnit purchaseUnit = mock(PurchaseUnit.class);
        when(purchaseUnit.amountWithBreakdown()).thenReturn(amount);

        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-003");
        when(mockOrder.purchaseUnits()).thenReturn(Collections.singletonList(purchaseUnit));

        HttpResponse<Order> mockResponse = mock(HttpResponse.class);
        when(mockResponse.result()).thenReturn(mockOrder);
        when(payPalHttpClient.execute(any(OrdersCaptureRequest.class))).thenReturn(mockResponse);
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        Order result = paymentService.capturePayPalOrder("PAYPAL-ORDER-003", 1L, 5L, 4L);

        assertThat(result.id()).isEqualTo("PAYPAL-ORDER-003");
        verify(paymentRepository).save(any(Payment.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("capturePayPalOrder - Should handle empty purchase units")
    void testCapturePayPalOrderEmptyPurchaseUnits() throws IOException {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-004");
        when(mockOrder.purchaseUnits()).thenReturn(Collections.emptyList());

        HttpResponse<Order> mockResponse = mock(HttpResponse.class);
        when(mockResponse.result()).thenReturn(mockOrder);
        when(payPalHttpClient.execute(any(OrdersCaptureRequest.class))).thenReturn(mockResponse);
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        Order result = paymentService.capturePayPalOrder("PAYPAL-ORDER-004", null, null, null);

        assertThat(result.id()).isEqualTo("PAYPAL-ORDER-004");
        verify(paymentRepository).save(any(Payment.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("capturePayPalOrder - Should handle null purchase units")
    void testCapturePayPalOrderNullPurchaseUnits() throws IOException {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-006");
        when(mockOrder.purchaseUnits()).thenReturn(null);

        HttpResponse<Order> mockResponse = mock(HttpResponse.class);
        when(mockResponse.result()).thenReturn(mockOrder);
        when(payPalHttpClient.execute(any(OrdersCaptureRequest.class))).thenReturn(mockResponse);
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        Order result = paymentService.capturePayPalOrder("PAYPAL-ORDER-006", 1L, 2L, 3L);

        assertThat(result.id()).isEqualTo("PAYPAL-ORDER-006");
        verify(paymentRepository).save(any(Payment.class));
    }

    @Test
    @DisplayName("capturePayPalOrder - Should throw IOException on failure")
    void testCapturePayPalOrderFailure() throws IOException {
        when(payPalHttpClient.execute(any(OrdersCaptureRequest.class))).thenThrow(new IOException("Capture failed"));

        assertThatThrownBy(() -> paymentService.capturePayPalOrder("INVALID", null, null, null))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("Capture failed");
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("getPayPalOrderDetails - Should return order details")
    void testGetPayPalOrderDetails() throws IOException {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-005");
        when(mockOrder.status()).thenReturn("COMPLETED");

        HttpResponse<Order> mockResponse = mock(HttpResponse.class);
        when(mockResponse.result()).thenReturn(mockOrder);
        when(payPalHttpClient.execute(any(OrdersGetRequest.class))).thenReturn(mockResponse);

        Order result = paymentService.getPayPalOrderDetails("PAYPAL-ORDER-005");

        assertThat(result.id()).isEqualTo("PAYPAL-ORDER-005");
        assertThat(result.status()).isEqualTo("COMPLETED");
    }

    @Test
    @DisplayName("getPayPalOrderDetails - Should throw IOException on failure")
    void testGetPayPalOrderDetailsFailure() throws IOException {
        when(payPalHttpClient.execute(any(OrdersGetRequest.class))).thenThrow(new IOException("Not found"));

        assertThatThrownBy(() -> paymentService.getPayPalOrderDetails("INVALID"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("Not found");
    }
}
