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
import java.util.Collections;
import java.util.Optional;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
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

    // -------------------------------------------------------------------------
    // GET /api/customer-summary/getAllCustomerSummaries
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries - Should return all summaries")
    void testGetAllCustomerSummaries() throws Exception {
        when(customerSummaryService.getAllCustomerSummaries())
                .thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries - Should return empty list when none exist")
    void testGetAllCustomerSummariesEmpty() throws Exception {
        when(customerSummaryService.getAllCustomerSummaries()).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries?accountId=4 - Should filter by accountId")
    void testGetCustomerSummariesByAccountId() throws Exception {
        when(customerSummaryService.getCustomerSummariesByAccountId(4L))
                .thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries")
                .param("accountId", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountId", is(4)));

        verify(customerSummaryService).getCustomerSummariesByAccountId(4L);
        verify(customerSummaryService, never()).getAllCustomerSummaries();
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries?productId=5 - Should filter by productId")
    void testGetCustomerSummariesByProductId() throws Exception {
        when(customerSummaryService.getCustomerSummariesByProductId(5L))
                .thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries")
                .param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));

        verify(customerSummaryService).getCustomerSummariesByProductId(5L);
    }

    @Test
    @DisplayName("GET /api/customer-summary/getAllCustomerSummaries?orderId=1 - Should filter by orderId")
    void testGetCustomerSummariesByOrderId() throws Exception {
        when(customerSummaryService.getCustomerSummariesByOrderId(1L))
                .thenReturn(Arrays.asList(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/getAllCustomerSummaries")
                .param("orderId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId", is(1)));

        verify(customerSummaryService).getCustomerSummariesByOrderId(1L);
    }

    // -------------------------------------------------------------------------
    // GET /api/customer-summary/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/customer-summary/{id} - Should return customer summary by id")
    void testGetCustomerSummaryById() throws Exception {
        when(customerSummaryService.getCustomerSummaryById(1L))
                .thenReturn(Optional.of(testCustomerSummary));

        mockMvc.perform(get("/api/customer-summary/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.accountId", is(4)))
                .andExpect(jsonPath("$.productId", is(5)))
                .andExpect(jsonPath("$.orderId", is(1)));
    }

    @Test
    @DisplayName("GET /api/customer-summary/{id} - Should return 404 when not found")
    void testGetCustomerSummaryByIdNotFound() throws Exception {
        when(customerSummaryService.getCustomerSummaryById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/customer-summary/99"))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // POST /api/customer-summary
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/customer-summary - Should create customer summary and return 201")
    void testCreateCustomerSummary() throws Exception {
        // ARRANGE
        CustomerSummary newSummary = new CustomerSummary();
        newSummary.setId(2L);
        newSummary.setAccountId(10L);
        newSummary.setProductId(20L);
        newSummary.setOrderId(5L);

        when(customerSummaryService.createCustomerSummary(any(CustomerSummary.class)))
                .thenReturn(newSummary);

        // ACT & ASSERT
        mockMvc.perform(post("/api/customer-summary")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newSummary)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(2)))
                .andExpect(jsonPath("$.accountId", is(10)))
                .andExpect(jsonPath("$.productId", is(20)))
                .andExpect(jsonPath("$.orderId", is(5)));
    }

    @Test
    @DisplayName("POST /api/customer-summary - Should return 400 when creation fails with illegal argument")
    void testCreateCustomerSummaryInvalidData() throws Exception {
        // ARRANGE
        when(customerSummaryService.createCustomerSummary(any(CustomerSummary.class)))
                .thenThrow(new IllegalArgumentException("Invalid summary data"));

        // ACT & ASSERT
        mockMvc.perform(post("/api/customer-summary")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testCustomerSummary)))
                .andExpect(status().isBadRequest());
    }

    // -------------------------------------------------------------------------
    // DELETE /api/customer-summary/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("DELETE /api/customer-summary/{id} - Should delete summary and return 204")
    void testDeleteCustomerSummary() throws Exception {
        // ARRANGE
        doNothing().when(customerSummaryService).deleteCustomerSummary(1L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/customer-summary/1"))
                .andExpect(status().isNoContent());

        verify(customerSummaryService, times(1)).deleteCustomerSummary(1L);
    }

    @Test
    @DisplayName("DELETE /api/customer-summary/{id} - Should return 404 when summary not found")
    void testDeleteCustomerSummaryNotFound() throws Exception {
        // ARRANGE
        doThrow(new IllegalArgumentException("Customer summary not found with id: 999"))
                .when(customerSummaryService).deleteCustomerSummary(999L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/customer-summary/999"))
                .andExpect(status().isNotFound());
    }
}
