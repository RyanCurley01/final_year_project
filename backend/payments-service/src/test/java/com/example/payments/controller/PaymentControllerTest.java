package com.example.payments.controller;

import com.example.payments.model.Payment;
import com.example.payments.service.PaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.paypal.orders.Order;
import com.paypal.orders.LinkDescription;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PaymentController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Payment Controller Integration Tests")
class PaymentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PaymentService paymentService;

    @Autowired
    private ObjectMapper objectMapper;

    private Payment testPayment;

    @BeforeEach
    void setUp() {
        objectMapper.registerModule(new JavaTimeModule());
        
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
    @DisplayName("GET /api/payments/getAllPayments - Should return all payments")
    void testGetAllPayments() throws Exception {
        when(paymentService.getAllPayments()).thenReturn(Arrays.asList(testPayment));

        mockMvc.perform(get("/api/payments/getAllPayments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].paymentStatus", is("Completed")));
    }

    @Test
    @DisplayName("GET /api/payments/getAllPayments - Should filter by orderId")
    void testGetPaymentsByOrderId() throws Exception {
        when(paymentService.getPaymentsByOrderId(1L)).thenReturn(Arrays.asList(testPayment));

        mockMvc.perform(get("/api/payments/getAllPayments").param("orderId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId", is(1)));
    }

    @Test
    @DisplayName("GET /api/payments/getAllPayments - Should filter by customerId")
    void testGetPaymentsByCustomerId() throws Exception {
        when(paymentService.getPaymentsByCustomerId(4L)).thenReturn(Arrays.asList(testPayment));

        mockMvc.perform(get("/api/payments/getAllPayments").param("customerId", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/payments/getAllPayments - Should filter by status")
    void testGetPaymentsByStatus() throws Exception {
        when(paymentService.getPaymentsByStatus("Completed")).thenReturn(Arrays.asList(testPayment));

        mockMvc.perform(get("/api/payments/getAllPayments").param("status", "Completed"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].paymentStatus", is("Completed")));
    }

    @Test
    @DisplayName("GET /api/payments/{id} - Should return payment by id")
    void testGetPaymentById() throws Exception {
        when(paymentService.getPaymentById(1L)).thenReturn(Optional.of(testPayment));

        mockMvc.perform(get("/api/payments/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("GET /api/payments/{id} - Should return 404 when not found")
    void testGetPaymentByIdNotFound() throws Exception {
        when(paymentService.getPaymentById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/payments/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /api/payments/paypal/{paypalOrderId} - Should return payment by PayPal order ID")
    void testGetPaymentByPaypalOrderId() throws Exception {
        testPayment.setPaypalOrderId("PAYPAL123");
        when(paymentService.getPaymentByPaypalOrderId("PAYPAL123")).thenReturn(Optional.of(testPayment));

        mockMvc.perform(get("/api/payments/paypal/PAYPAL123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paypalOrderId", is("PAYPAL123")));
    }
    
    @Test
    @DisplayName("GET /api/payments/paypal/{paypalOrderId} - Should return 404 when not found")
    void testGetPaymentByPaypalOrderIdNotFound() throws Exception {
        when(paymentService.getPaymentByPaypalOrderId("INVALID")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/payments/paypal/INVALID"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("PUT /api/payments/{id} - Should update payment")
    void testUpdatePayment() throws Exception {
        when(paymentService.updatePayment(any(Long.class), any(Payment.class))).thenReturn(testPayment);

        mockMvc.perform(put("/api/payments/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testPayment)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("PUT /api/payments/{id} - Should return 404 when not found")
    void testUpdatePaymentNotFound() throws Exception {
        when(paymentService.updatePayment(any(Long.class), any(Payment.class)))
                .thenThrow(new IllegalArgumentException("Not found"));

        mockMvc.perform(put("/api/payments/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testPayment)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("DELETE /api/payments/{id} - Should delete payment")
    void testDeletePayment() throws Exception {
        mockMvc.perform(delete("/api/payments/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("DELETE /api/payments/{id} - Should return 404 when not found")
    void testDeletePaymentNotFound() throws Exception {
        doThrow(new IllegalArgumentException("Not found")).when(paymentService).deletePayment(99L);

        mockMvc.perform(delete("/api/payments/99"))
                .andExpect(status().isNotFound());
    }

    // ===== PayPal Integration Tests =====

    @Test
    @DisplayName("POST /api/payments/paypal/create-order - Should create PayPal order successfully")
    void testCreatePayPalOrder() throws Exception {
        // Create mock PayPal Order
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-123");
        when(mockOrder.status()).thenReturn("CREATED");
        
        // Create mock links
        LinkDescription approveLink = mock(LinkDescription.class);
        when(approveLink.href()).thenReturn("https://www.paypal.com/checkoutnow?token=PAYPAL-ORDER-123");
        when(approveLink.rel()).thenReturn("approve");
        when(approveLink.method()).thenReturn("GET");
        
        List<LinkDescription> links = Arrays.asList(approveLink);
        when(mockOrder.links()).thenReturn(links);

        // Mock service call
        when(paymentService.createPayPalOrder(
            any(BigDecimal.class), 
            any(String.class), 
            any(Long.class), 
            any(Long.class), 
            any(Long.class)
        )).thenReturn(mockOrder);

        // Create request body
        PaymentController.CreatePayPalOrderRequest request = new PaymentController.CreatePayPalOrderRequest();
        request.setAmount(new BigDecimal("49.99"));
        request.setCurrency("USD");
        request.setOrderId(1L);
        request.setProductId(5L);
        request.setAccountId(4L);

        mockMvc.perform(post("/api/payments/paypal/create-order")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("PAYPAL-ORDER-123")))
                .andExpect(jsonPath("$.status", is("CREATED")))
                .andExpect(jsonPath("$.links", hasSize(1)))
                .andExpect(jsonPath("$.links[0].rel", is("approve")))
                .andExpect(jsonPath("$.links[0].method", is("GET")));

        verify(paymentService).createPayPalOrder(
            eq(new BigDecimal("49.99")), 
            eq("USD"), 
            eq(1L), 
            eq(5L), 
            eq(4L)
        );
    }

    @Test
    @DisplayName("POST /api/payments/paypal/create-order - Should handle IOException")
    void testCreatePayPalOrderError() throws Exception {
        when(paymentService.createPayPalOrder(
            any(BigDecimal.class), 
            any(String.class), 
            any(Long.class), 
            any(Long.class), 
            any(Long.class)
        )).thenThrow(new IOException("PayPal API error"));

        PaymentController.CreatePayPalOrderRequest request = new PaymentController.CreatePayPalOrderRequest();
        request.setAmount(new BigDecimal("49.99"));
        request.setCurrency("USD");
        request.setOrderId(1L);
        request.setProductId(5L);
        request.setAccountId(4L);

        mockMvc.perform(post("/api/payments/paypal/create-order")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isInternalServerError())
                .andExpect(content().string(containsString("Error creating PayPal order")));
    }

    @Test
    @DisplayName("POST /api/payments/paypal/capture-order/{orderId} - Should capture order successfully")
    void testCapturePayPalOrder() throws Exception {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-123");
        when(mockOrder.status()).thenReturn("COMPLETED");
        
        LinkDescription selfLink = mock(LinkDescription.class);
        when(selfLink.href()).thenReturn("https://api.paypal.com/v2/checkout/orders/PAYPAL-ORDER-123");
        when(selfLink.rel()).thenReturn("self");
        when(selfLink.method()).thenReturn("GET");
        
        List<LinkDescription> links = Arrays.asList(selfLink);
        when(mockOrder.links()).thenReturn(links);

        when(paymentService.capturePayPalOrder(eq("PAYPAL-ORDER-123"), isNull(), isNull(), isNull())).thenReturn(mockOrder);

        mockMvc.perform(post("/api/payments/paypal/capture-order/PAYPAL-ORDER-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("PAYPAL-ORDER-123")))
                .andExpect(jsonPath("$.status", is("COMPLETED")))
                .andExpect(jsonPath("$.links", hasSize(1)))
                .andExpect(jsonPath("$.links[0].rel", is("self")));

        verify(paymentService).capturePayPalOrder(eq("PAYPAL-ORDER-123"), isNull(), isNull(), isNull());
    }

    @Test
    @DisplayName("POST /api/payments/paypal/capture-order/{orderId} - Should handle capture error")
    void testCapturePayPalOrderError() throws Exception {
        when(paymentService.capturePayPalOrder(eq("INVALID-ORDER"), isNull(), isNull(), isNull()))
                .thenThrow(new IOException("Order not found"));

        mockMvc.perform(post("/api/payments/paypal/capture-order/INVALID-ORDER"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().string(containsString("Error capturing PayPal order")));
    }

    @Test
    @DisplayName("GET /api/payments/paypal/order/{orderId} - Should get PayPal order details")
    void testGetPayPalOrderDetails() throws Exception {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-123");
        when(mockOrder.status()).thenReturn("APPROVED");
        
        LinkDescription captureLink = mock(LinkDescription.class);
        when(captureLink.href()).thenReturn("https://api.paypal.com/v2/checkout/orders/PAYPAL-ORDER-123/capture");
        when(captureLink.rel()).thenReturn("capture");
        when(captureLink.method()).thenReturn("POST");
        
        List<LinkDescription> links = Arrays.asList(captureLink);
        when(mockOrder.links()).thenReturn(links);

        when(paymentService.getPayPalOrderDetails("PAYPAL-ORDER-123")).thenReturn(mockOrder);

        mockMvc.perform(get("/api/payments/paypal/order/PAYPAL-ORDER-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("PAYPAL-ORDER-123")))
                .andExpect(jsonPath("$.status", is("APPROVED")))
                .andExpect(jsonPath("$.links", hasSize(1)))
                .andExpect(jsonPath("$.links[0].rel", is("capture")))
                .andExpect(jsonPath("$.links[0].method", is("POST")));

        verify(paymentService).getPayPalOrderDetails("PAYPAL-ORDER-123");
    }

    @Test
    @DisplayName("GET /api/payments/paypal/order/{orderId} - Should handle order not found")
    void testGetPayPalOrderDetailsNotFound() throws Exception {
        when(paymentService.getPayPalOrderDetails("NONEXISTENT"))
                .thenThrow(new IOException("Order not found"));

        mockMvc.perform(get("/api/payments/paypal/order/NONEXISTENT"))
                .andExpect(status().isNotFound())
                .andExpect(content().string(containsString("PayPal order not found")));
    }

    @Test
    @DisplayName("GET /api/payments/paypal/success - Should return success HTML page")
    void testPayPalSuccess() throws Exception {
        mockMvc.perform(get("/api/payments/paypal/success").param("token", "PAYPAL-ORDER-123"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Payment Approved!")))
                .andExpect(content().string(containsString("PAYPAL-ORDER-123")))
                .andExpect(content().string(containsString("capture the payment")));
    }

    @Test
    @DisplayName("GET /api/payments/paypal/success - Should handle missing token")
    void testPayPalSuccessNoToken() throws Exception {
        mockMvc.perform(get("/api/payments/paypal/success"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Payment Approved!")))
                .andExpect(content().string(containsString("N/A")));
    }

    @Test
    @DisplayName("GET /api/payments/paypal/cancel - Should return cancellation HTML page")
    void testPayPalCancel() throws Exception {
        mockMvc.perform(get("/api/payments/paypal/cancel"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Payment Cancelled")))
                .andExpect(content().string(containsString("cancelled the PayPal payment")));
    }

    @Test
    @DisplayName("POST /api/payments/paypal/create-order - Should handle order with null links")
    void testCreatePayPalOrderWithNullLinks() throws Exception {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-456");
        when(mockOrder.status()).thenReturn("CREATED");
        when(mockOrder.links()).thenReturn(null);

        when(paymentService.createPayPalOrder(
            any(BigDecimal.class), 
            any(String.class), 
            any(Long.class), 
            any(Long.class), 
            any(Long.class)
        )).thenReturn(mockOrder);

        PaymentController.CreatePayPalOrderRequest request = new PaymentController.CreatePayPalOrderRequest();
        request.setAmount(new BigDecimal("29.99"));
        request.setCurrency("EUR");
        request.setOrderId(2L);
        request.setProductId(10L);
        request.setAccountId(7L);

        mockMvc.perform(post("/api/payments/paypal/create-order")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("PAYPAL-ORDER-456")))
                .andExpect(jsonPath("$.status", is("CREATED")))
                .andExpect(jsonPath("$.links").doesNotExist());
    }

    @Test
    @DisplayName("POST /api/payments/paypal/capture-order/{orderId} - Should handle order with empty links")
    void testCapturePayPalOrderWithEmptyLinks() throws Exception {
        Order mockOrder = mock(Order.class);
        when(mockOrder.id()).thenReturn("PAYPAL-ORDER-789");
        when(mockOrder.status()).thenReturn("COMPLETED");
        when(mockOrder.links()).thenReturn(Arrays.asList());

        when(paymentService.capturePayPalOrder(eq("PAYPAL-ORDER-789"), isNull(), isNull(), isNull())).thenReturn(mockOrder);

        mockMvc.perform(post("/api/payments/paypal/capture-order/PAYPAL-ORDER-789"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("PAYPAL-ORDER-789")))
                .andExpect(jsonPath("$.status", is("COMPLETED")))
                .andExpect(jsonPath("$.links", hasSize(0)));
    }
}
