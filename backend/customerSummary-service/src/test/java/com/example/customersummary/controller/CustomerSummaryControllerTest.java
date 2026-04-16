package com.example.customersummary.controller;

import com.example.customersummary.model.CustomerSummary;
import com.example.customersummary.service.CustomerSummaryService;
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

@WebMvcTest(CustomerSummaryController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("CustomerSummary Controller Integration Tests")
class CustomerSummaryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
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
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries - Should return all summaries")
    void testGetAllCustomerSummaries() throws Exception {
        when(customerSummaryService.getAllCustomerSummaries()).thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries - Should filter by accountId")
    void testGetCustomerSummariesByAccountId() throws Exception {
        when(customerSummaryService.getCustomerSummariesByAccountId(4L)).thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries").param("accountId", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries - Should filter by productId")
    void testGetCustomerSummariesByProductId() throws Exception {
        when(customerSummaryService.getCustomerSummariesByProductId(5L)).thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries").param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries - Should filter by orderId")
    void testGetCustomerSummariesByOrderId() throws Exception {
        when(customerSummaryService.getCustomerSummariesByOrderId(1L)).thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries").param("orderId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId", is(1)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/{id} - Should return customer summary by id")
    void testGetCustomerSummaryById() throws Exception {
        when(customerSummaryService.getCustomerSummaryById(1L)).thenReturn(Optional.of(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/{id} - Should return 404 when not found")
    void testGetCustomerSummaryByIdNotFound() throws Exception {
        when(customerSummaryService.getCustomerSummaryById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/customer-summary/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/customer-summary - Should create customer summary")
    void testCreateCustomerSummary() throws Exception {
        CustomerSummary newSummary = new CustomerSummary();
        newSummary.setId(2L);
        newSummary.setAccountId(10L);
        newSummary.setProductId(20L);
        newSummary.setOrderId(5L);

        when(customerSummaryService.createCustomerSummary(any(CustomerSummary.class))).thenReturn(newSummary);

        mockMvc.perform(post("/api/customer-summary")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newSummary)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(2)))
                .andExpect(jsonPath("$.accountId", is(10)))
                .andExpect(jsonPath("$.productId", is(20)))
                .andExpect(jsonPath("$.orderId", is(5)));
    }
}
