package com.example.orderitems.service;

import com.example.orderitems.model.OrderItem;
import com.example.orderitems.repository.OrderItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class OrderItemService {

    private final OrderItemRepository orderItemRepository;

    public List<OrderItem> getAllOrderItems() {
        return orderItemRepository.findAll();
    }

    public Optional<OrderItem> getOrderItemById(Long id) {
        return orderItemRepository.findById(id);
    }

    public List<OrderItem> getOrderItemsByOrderId(Long orderId) {
        return orderItemRepository.findByOrderId(orderId);
    }

    public List<OrderItem> getOrderItemsByProductId(Long productId) {
        return orderItemRepository.findByProductId(productId);
    }

    @Transactional
    public OrderItem createOrderItem(OrderItem orderItem) {
        return orderItemRepository.save(orderItem);
    }

    @Transactional
    public OrderItem updateOrderItem(Long id, OrderItem orderItemDetails) {
        OrderItem orderItem = orderItemRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Order item not found with id: " + id));

        if (orderItemDetails.getOrderId() != null) {
            orderItem.setOrderId(orderItemDetails.getOrderId());
        }
        if (orderItemDetails.getProductId() != null) {
            orderItem.setProductId(orderItemDetails.getProductId());
        }
        if (orderItemDetails.getQuantity() != null) {
            orderItem.setQuantity(orderItemDetails.getQuantity());
        }
        if (orderItemDetails.getUnitPrice() != null) {
            orderItem.setUnitPrice(orderItemDetails.getUnitPrice());
        }

        return orderItemRepository.save(orderItem);
    }

    @Transactional
    public void deleteOrderItem(Long id) {
        if (!orderItemRepository.existsById(id)) {
            throw new IllegalArgumentException("Order item not found with id: " + id);
        }
        orderItemRepository.deleteById(id);
    }
}
