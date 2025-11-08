package com.example.payments.controller;

import com.example.payments.model.Payment;
import com.example.payments.service.PaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Optional;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
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
}
