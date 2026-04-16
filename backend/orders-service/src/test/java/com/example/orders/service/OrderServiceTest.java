package com.example.orders.service;

import com.example.orders.model.Order;
import com.example.orders.repository.OrderRepository;
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
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Order Service Unit Tests")
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @InjectMocks
    private OrderService orderService;

    private Order testOrder;

    @BeforeEach
    void setUp() {
        testOrder = new Order();
        testOrder.setId(1L);
        testOrder.setAccountId(4L);
        testOrder.setOrderDate(LocalDateTime.now());
        testOrder.setTotalAmount(new BigDecimal("99.99"));
    }

    @Test
    @DisplayName("getAllOrders - Should return all orders")
    void testGetAllOrders() {
        // ARRANGE
        List<Order> orders = Arrays.asList(testOrder);
        when(orderRepository.findAll()).thenReturn(orders);

        // ACT
        List<Order> result = orderService.getAllOrders();

        // ASSERT
        assertThat(result).hasSize(1);
        verify(orderRepository).findAll();
    }

    @Test
    @DisplayName("getOrderById - Should return order when found")
    void testGetOrderById() {
        // ARRANGE
        when(orderRepository.findById(1L)).thenReturn(Optional.of(testOrder));

        // ACT
        Optional<Order> result = orderService.getOrderById(1L);

        // ASSERT
        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(1L);
        verify(orderRepository).findById(1L);
    }

    @Test
    @DisplayName("getOrdersByCustomerId - Should return orders for customer")
    void testGetOrdersByCustomerId() {
        // ARRANGE
        List<Order> orders = Arrays.asList(testOrder);
        when(orderRepository.findByAccountId(4L)).thenReturn(orders);

        // ACT
        List<Order> result = orderService.getOrdersByCustomerId(4L);

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAccountId()).isEqualTo(4L);
        verify(orderRepository).findByAccountId(4L);
    }

    @Test
    @DisplayName("createOrder - Should create new order")
    void testCreateOrder() {
        // ARRANGE
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);

        // ACT
        Order result = orderService.createOrder(testOrder);

        // ASSERT
        assertThat(result.getId()).isEqualTo(1L);
        verify(orderRepository).save(testOrder);
    }

    @Test
    @DisplayName("updateOrder - Should update existing order")
    void testUpdateOrder() {
        // ARRANGE
        Order updateDetails = new Order();
        updateDetails.setTotalAmount(new BigDecimal("199.99"));
        updateDetails.setAccountId(5L);

        when(orderRepository.findById(1L)).thenReturn(Optional.of(testOrder));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);

        // ACT
        Order result = orderService.updateOrder(1L, updateDetails);

        // ASSERT
        assertThat(result.getTotalAmount()).isEqualTo(new BigDecimal("199.99"));
        verify(orderRepository).save(testOrder);
    }

    @Test
    @DisplayName("updateOrder - Should throw exception when order not found")
    void testUpdateOrderNotFound() {
        // ARRANGE
        when(orderRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        assertThatThrownBy(() -> orderService.updateOrder(99L, new Order()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("updateOrder - Should update only orderDate when other fields null")
    void testUpdateOrderPartialOrderDate() {
        // ARRANGE
        Order updateDetails = new Order();
        LocalDateTime newDate = LocalDateTime.of(2026, 5, 1, 12, 0);
        updateDetails.setOrderDate(newDate);

        when(orderRepository.findById(1L)).thenReturn(Optional.of(testOrder));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);

        // ACT
        Order result = orderService.updateOrder(1L, updateDetails);

        // ASSERT
        assertThat(result.getOrderDate()).isEqualTo(newDate);
        verify(orderRepository).save(testOrder);
    }

    @Test
    @DisplayName("deleteOrder - Should delete existing order")
    void testDeleteOrder() {
        // ARRANGE
        when(orderRepository.existsById(1L)).thenReturn(true);

        // ACT
        orderService.deleteOrder(1L);

        // ASSERT
        verify(orderRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteOrder - Should throw exception when order not found")
    void testDeleteOrderNotFound() {
        // ARRANGE
        when(orderRepository.existsById(99L)).thenReturn(false);

        // ACT & ASSERT
        assertThatThrownBy(() -> orderService.deleteOrder(99L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
