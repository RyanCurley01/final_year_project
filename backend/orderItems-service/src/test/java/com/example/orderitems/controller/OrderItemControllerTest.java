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
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration Tests for OrderItemController.
 *
 * The base list endpoint is @GetMapping (no path suffix), mapping to /api/order-items.
 * Query parameters orderId and productId filter results when supplied.
 * There is no /getAllOrderItems path on this controller.
 */
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

    // -------------------------------------------------------------------------
    // GET /api/order-items
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/order-items - Should return all order items when no filter supplied")
    void testGetAllOrderItems() throws Exception {
        // ARRANGE
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getAllOrderItems()).thenReturn(items);

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].orderId", is(1)));

        verify(orderItemService).getAllOrderItems();
        verify(orderItemService, never()).getOrderItemsByOrderId(any());
        verify(orderItemService, never()).getOrderItemsByProductId(any());
    }

    @Test
    @DisplayName("GET /api/order-items - Should return empty list when none exist")
    void testGetAllOrderItemsEmpty() throws Exception {
        // ARRANGE
        when(orderItemService.getAllOrderItems()).thenReturn(Collections.emptyList());

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("GET /api/order-items?orderId=1 - Should filter by orderId")
    void testGetAllOrderItemsByOrderId() throws Exception {
        // ARRANGE
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getOrderItemsByOrderId(1L)).thenReturn(items);

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items").param("orderId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId", is(1)));

        verify(orderItemService).getOrderItemsByOrderId(1L);
        verify(orderItemService, never()).getAllOrderItems();
    }

    @Test
    @DisplayName("GET /api/order-items?productId=5 - Should filter by productId")
    void testGetAllOrderItemsByProductId() throws Exception {
        // ARRANGE
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getOrderItemsByProductId(5L)).thenReturn(items);

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items").param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId", is(5)));

        verify(orderItemService).getOrderItemsByProductId(5L);
        verify(orderItemService, never()).getAllOrderItems();
    }

    @Test
    @DisplayName("GET /api/order-items?orderId=1 - orderId filter takes priority over productId")
    void testOrderIdFilterTakesPriorityOverProductId() throws Exception {
        // ARRANGE — both params supplied; controller checks orderId first
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getOrderItemsByOrderId(1L)).thenReturn(items);

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items")
                .param("orderId", "1")
                .param("productId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId", is(1)));

        verify(orderItemService).getOrderItemsByOrderId(1L);
        verify(orderItemService, never()).getOrderItemsByProductId(any());
    }

    // -------------------------------------------------------------------------
    // GET /api/order-items/order/{orderId}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/order-items/order/{orderId} - Should return items by orderId path variable")
    void testGetOrderItemsByOrderIdPath() throws Exception {
        // ARRANGE
        List<OrderItem> items = Arrays.asList(testOrderItem);
        when(orderItemService.getOrderItemsByOrderId(1L)).thenReturn(items);

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items/order/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].orderId", is(1)));
    }

    // -------------------------------------------------------------------------
    // GET /api/order-items/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("GET /api/order-items/{id} - Should return order item by id")
    void testGetOrderItemById() throws Exception {
        // ARRANGE
        when(orderItemService.getOrderItemById(1L)).thenReturn(Optional.of(testOrderItem));

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.orderId", is(1)))
                .andExpect(jsonPath("$.productId", is(5)))
                .andExpect(jsonPath("$.quantity", is(2)));
    }

    @Test
    @DisplayName("GET /api/order-items/{id} - Should return 404 when not found")
    void testGetOrderItemByIdNotFound() throws Exception {
        // ARRANGE
        when(orderItemService.getOrderItemById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        mockMvc.perform(get("/api/order-items/99"))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // POST /api/order-items
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/order-items - Should create new order item and return 201")
    void testCreateOrderItem() throws Exception {
        // ARRANGE
        when(orderItemService.createOrderItem(any(OrderItem.class))).thenReturn(testOrderItem);

        // ACT & ASSERT
        mockMvc.perform(post("/api/order-items")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testOrderItem)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.orderId", is(1)))
                .andExpect(jsonPath("$.productId", is(5)));
    }

    // -------------------------------------------------------------------------
    // PUT /api/order-items/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("PUT /api/order-items/{id} - Should update order item")
    void testUpdateOrderItem() throws Exception {
        // ARRANGE
        OrderItem updatedItem = new OrderItem();
        updatedItem.setId(1L);
        updatedItem.setOrderId(1L);
        updatedItem.setProductId(5L);
        updatedItem.setQuantity(10);
        updatedItem.setUnitPrice(new BigDecimal("39.99"));

        when(orderItemService.updateOrderItem(any(Long.class), any(OrderItem.class))).thenReturn(updatedItem);

        // ACT & ASSERT
        mockMvc.perform(put("/api/order-items/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updatedItem)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity", is(10)));
    }

    @Test
    @DisplayName("PUT /api/order-items/{id} - Should return 404 when not found")
    void testUpdateOrderItemNotFound() throws Exception {
        // ARRANGE
        when(orderItemService.updateOrderItem(any(Long.class), any(OrderItem.class)))
                .thenThrow(new IllegalArgumentException("Not found"));

        // ACT & ASSERT
        mockMvc.perform(put("/api/order-items/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testOrderItem)))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // DELETE /api/order-items/{id}
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("DELETE /api/order-items/{id} - Should delete order item and return 204")
    void testDeleteOrderItem() throws Exception {
        // ARRANGE
        doNothing().when(orderItemService).deleteOrderItem(1L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/order-items/1"))
                .andExpect(status().isNoContent());

        verify(orderItemService, times(1)).deleteOrderItem(1L);
    }

    @Test
    @DisplayName("DELETE /api/order-items/{id} - Should return 404 when not found")
    void testDeleteOrderItemNotFound() throws Exception {
        // ARRANGE
        doThrow(new IllegalArgumentException("Not found")).when(orderItemService).deleteOrderItem(99L);

        // ACT & ASSERT
        mockMvc.perform(delete("/api/order-items/99"))
                .andExpect(status().isNotFound());
    }
}
