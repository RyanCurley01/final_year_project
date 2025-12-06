package com.example.orderitems.controller;

import com.example.orderitems.model.OrderItem;
import com.example.orderitems.service.OrderItemService;
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

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderItemController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("OrderItem Controller Integration Tests")
class OrderItemControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrderItemService orderItemService;

    @Autowired
    private ObjectMapper objectMapper;

    private OrderItem testOrderItem;

    @BeforeEach
    void setUp() {
        testOrderItem = new OrderItem();
        testOrderItem.setId(1L);
        testOrderItem.setOrderId(1L);
        testOrderItem.setProductId(5L);
        testOrderItem.setQuantity(2);
        testOrderItem.setUnitPrice(new BigDecimal("49.99"));
    }

    @Test
    @DisplayName("GET /api/order-items/getAllOrderItems - Should return all order items")
    void testGetAllOrderItems() throws Exception {
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getAllOrderItems()).thenReturn(items);

        mockMvc.perform(get("/api/order-items/getAllOrderItems"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].orderId", is(1)));
    }

    @Test
    @DisplayName("GET /api/order-items/getAllOrderItems - Should filter by orderId")
    void testGetAllOrderItemsByOrderId() throws Exception {
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getOrderItemsByOrderId(1L)).thenReturn(items);

        mockMvc.perform(get("/api/order-items/getAllOrderItems").param("orderId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId", is(1)));
    }

    @Test
    @DisplayName("GET /api/order-items/getAllOrderItems - Should filter by productId")
    void testGetAllOrderItemsByProductId() throws Exception {
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getOrderItemsByProductId(5L)).thenReturn(items);

        mockMvc.perform(get("/api/order-items/getAllOrderItems").param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/order-items/{id} - Should return order item by id")
    void testGetOrderItemById() throws Exception {
        when(orderItemService.getOrderItemById(1L)).thenReturn(Optional.of(testOrderItem));

        mockMvc.perform(get("/api/order-items/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("GET /api/order-items/{id} - Should return 404 when not found")
    void testGetOrderItemByIdNotFound() throws Exception {
        when(orderItemService.getOrderItemById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/order-items/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/order-items - Should create new order item")
    void testCreateOrderItem() throws Exception {
        when(orderItemService.createOrderItem(any(OrderItem.class))).thenReturn(testOrderItem);

        mockMvc.perform(post("/api/order-items")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testOrderItem)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(1)));
    }

    @Test
    @DisplayName("PUT /api/order-items/{id} - Should update order item")
    void testUpdateOrderItem() throws Exception {
        when(orderItemService.updateOrderItem(any(Long.class), any(OrderItem.class))).thenReturn(testOrderItem);

        mockMvc.perform(put("/api/order-items/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testOrderItem)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("PUT /api/order-items/{id} - Should return 404 when not found")
    void testUpdateOrderItemNotFound() throws Exception {
        when(orderItemService.updateOrderItem(any(Long.class), any(OrderItem.class)))
                .thenThrow(new IllegalArgumentException("Not found"));

        mockMvc.perform(put("/api/order-items/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testOrderItem)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("DELETE /api/order-items/{id} - Should delete order item")
    void testDeleteOrderItem() throws Exception {
        mockMvc.perform(delete("/api/order-items/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("DELETE /api/order-items/{id} - Should return 404 when not found")
    void testDeleteOrderItemNotFound() throws Exception {
        doThrow(new IllegalArgumentException("Not found")).when(orderItemService).deleteOrderItem(99L);

        mockMvc.perform(delete("/api/order-items/99"))
                .andExpect(status().isNotFound());
    }
}
