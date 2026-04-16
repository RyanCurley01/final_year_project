package com.example.orders.controller;

import com.example.orders.model.Order;
import com.example.orders.service.OrderService;
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
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Order Controller Integration Tests")
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrderService orderService;

    @Autowired
    private ObjectMapper objectMapper;

    private Order testOrder;

    @BeforeEach
    void setUp() {
        objectMapper.registerModule(new JavaTimeModule());
        
        testOrder = new Order();
        testOrder.setId(1L);
        testOrder.setAccountId(4L);
        testOrder.setOrderDate(LocalDateTime.now());
        testOrder.setTotalAmount(new BigDecimal("99.99"));
    }

    @Test
    @DisplayName("GET /api/orders/getAllOrders - Should return all orders")
    void testGetAllOrders() throws Exception {
        // ARRANGE
        Order order2 = new Order();
        order2.setId(2L);
        order2.setAccountId(5L);

        List<Order> orders = Arrays.asList(testOrder, order2);
        when(orderService.getAllOrders()).thenReturn(orders);

        // ACT & ASSERT
        mockMvc.perform(get("/api/orders/getAllOrders")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/orders/getAllOrders - Should filter by customerId")
    void testGetAllOrdersByCustomerId() throws Exception {
        // ARRANGE
        List<Order> orders = Arrays.asList(testOrder);
        when(orderService.getOrdersByCustomerId(4L)).thenReturn(orders);

        // ACT & ASSERT
        mockMvc.perform(get("/api/orders/getAllOrders")
                .param("customerId", "4")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/orders/{id} - Should return order by id")
    void testGetOrderById() throws Exception {
        // ARRANGE
        when(orderService.getOrderById(1L)).thenReturn(Optional.of(testOrder));

        // ACT & ASSERT
        mockMvc.perform(get("/api/orders/1")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/orders/{id} - Should return 404 when order not found")
    void testGetOrderByIdNotFound() throws Exception {
        // ARRANGE
        when(orderService.getOrderById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        mockMvc.perform(get("/api/orders/99")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/orders - Should create new order")
    void testCreateOrder() throws Exception {
        // ARRANGE
        Order newOrder = new Order();
        newOrder.setAccountId(5L);
        newOrder.setOrderDate(LocalDateTime.now());
        newOrder.setTotalAmount(new BigDecimal("149.99"));

        Order createdOrder = new Order();
        createdOrder.setId(3L);
        createdOrder.setAccountId(5L);
        createdOrder.setOrderDate(newOrder.getOrderDate());
        createdOrder.setTotalAmount(new BigDecimal("149.99"));

        when(orderService.createOrder(any(Order.class))).thenReturn(createdOrder);

        // ACT & ASSERT
        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newOrder)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(3)))
                .andExpect(jsonPath("$.accountId", is(5)));
    }

    @Test
    @DisplayName("PUT /api/orders/{id} - Should update existing order")
    void testUpdateOrder() throws Exception {
        // ARRANGE
        Order updateDetails = new Order();
        updateDetails.setTotalAmount(new BigDecimal("199.99"));

        Order updatedOrder = new Order();
        updatedOrder.setId(1L);
        updatedOrder.setAccountId(4L);
        updatedOrder.setTotalAmount(new BigDecimal("199.99"));

        when(orderService.updateOrder(any(Long.class), any(Order.class))).thenReturn(updatedOrder);

        // ACT & ASSERT
        mockMvc.perform(put("/api/orders/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateDetails)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("PUT /api/orders/{id} - Should return 404 when order not found")
    void testUpdateOrderNotFound() throws Exception {
        // ARRANGE
        Order updateDetails = new Order();
        updateDetails.setTotalAmount(new BigDecimal("199.99"));

        when(orderService.updateOrder(any(Long.class), any(Order.class)))
                .thenThrow(new IllegalArgumentException("Order not found"));

        // ACT & ASSERT
        mockMvc.perform(put("/api/orders/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateDetails)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /api/orders/account/{accountId} - Should return orders by account id")
    void testGetOrdersByAccountId() throws Exception {
        // ARRANGE
        List<Order> orders = Arrays.asList(testOrder);
        when(orderService.getOrdersByCustomerId(4L)).thenReturn(orders);

        // ACT & ASSERT
        mockMvc.perform(get("/api/orders/account/4")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }
}
