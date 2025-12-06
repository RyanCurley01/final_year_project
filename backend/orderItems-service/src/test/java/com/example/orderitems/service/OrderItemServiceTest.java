package com.example.orderitems.service;

import com.example.orderitems.model.OrderItem;
import com.example.orderitems.repository.OrderItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderItem Service Unit Tests")
class OrderItemServiceTest {

    @Mock
    private OrderItemRepository orderItemRepository;

    @InjectMocks
    private OrderItemService orderItemService;

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
    @DisplayName("getAllOrderItems - Should return all order items")
    void testGetAllOrderItems() {
        when(orderItemRepository.findAll()).thenReturn(Arrays.asList(testOrderItem));

        List<OrderItem> result = orderItemService.getAllOrderItems();

        assertThat(result).hasSize(1);
        verify(orderItemRepository).findAll();
    }

    @Test
    @DisplayName("getOrderItemById - Should return order item when found")
    void testGetOrderItemById() {
        when(orderItemRepository.findById(1L)).thenReturn(Optional.of(testOrderItem));

        Optional<OrderItem> result = orderItemService.getOrderItemById(1L);

        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("getOrderItemsByOrderId - Should return items for order")
    void testGetOrderItemsByOrderId() {
        when(orderItemRepository.findByOrderId(1L)).thenReturn(Arrays.asList(testOrderItem));

        List<OrderItem> result = orderItemService.getOrderItemsByOrderId(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getOrderId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("getOrderItemsByProductId - Should return items for product")
    void testGetOrderItemsByProductId() {
        when(orderItemRepository.findByProductId(5L)).thenReturn(Arrays.asList(testOrderItem));

        List<OrderItem> result = orderItemService.getOrderItemsByProductId(5L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getProductId()).isEqualTo(5L);
    }

    @Test
    @DisplayName("createOrderItem - Should create new order item")
    void testCreateOrderItem() {
        when(orderItemRepository.save(any(OrderItem.class))).thenReturn(testOrderItem);

        OrderItem result = orderItemService.createOrderItem(testOrderItem);

        assertThat(result.getId()).isEqualTo(1L);
        verify(orderItemRepository).save(testOrderItem);
    }

    @Test
    @DisplayName("updateOrderItem - Should update existing order item")
    void testUpdateOrderItem() {
        OrderItem updates = new OrderItem();
        updates.setQuantity(5);
        updates.setUnitPrice(new BigDecimal("39.99"));

        when(orderItemRepository.findById(1L)).thenReturn(Optional.of(testOrderItem));
        when(orderItemRepository.save(any(OrderItem.class))).thenReturn(testOrderItem);

        OrderItem result = orderItemService.updateOrderItem(1L, updates);

        assertThat(result.getQuantity()).isEqualTo(5);
        verify(orderItemRepository).save(testOrderItem);
    }

    @Test
    @DisplayName("updateOrderItem - Should throw exception when not found")
    void testUpdateOrderItemNotFound() {
        when(orderItemRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderItemService.updateOrderItem(99L, new OrderItem()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("deleteOrderItem - Should delete order item")
    void testDeleteOrderItem() {
        when(orderItemRepository.existsById(1L)).thenReturn(true);

        orderItemService.deleteOrderItem(1L);

        verify(orderItemRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteOrderItem - Should throw exception when not found")
    void testDeleteOrderItemNotFound() {
        when(orderItemRepository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> orderItemService.deleteOrderItem(99L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
