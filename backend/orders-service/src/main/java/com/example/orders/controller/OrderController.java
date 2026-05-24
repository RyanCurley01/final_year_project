package com.example.orders.controller;

import com.example.orders.model.Order;
import com.example.orders.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Tag class as a controller returning JSON data instead of views
@RestController
// Base mapping so endpoints are accessible at '/api/orders'
@RequestMapping("/api/orders")
// Enable cross-origin requests for decoupled frontend development
@CrossOrigin(origins = "*")
// Tell Lombok to build a constructor auto-injecting dependencies
@RequiredArgsConstructor
public class OrderController {

    // Service class containing querying logic for data lookups
    private final OrderService orderService;

    // GET mapping to list all orders globally
    @GetMapping
    public ResponseEntity<List<Order>> getAllOrders(
            // Optional query parameter (e.g. ?customerId=10)
            @RequestParam(required = false) Long customerId) {
        
        // If a customerId is provided, filter the results just for them
        if (customerId != null) {
            return ResponseEntity.ok(orderService.getOrdersByCustomerId(customerId));
        }
        
        // Otherwise return everything in the database
        return ResponseEntity.ok(orderService.getAllOrders());
    }

    // GET mapping returning one single order looking up by path parameter ID
    @GetMapping("/{id}")
    public ResponseEntity<Order> getOrderById(@PathVariable Long id) {
        return orderService.getOrderById(id)
                // Wrap found object in 200 OK
                .map(ResponseEntity::ok)
                // Return 404 block if no record matches
                .orElse(ResponseEntity.notFound().build());
    }

    // GET mapping identical to customerId filter, specifically finding their account
    @GetMapping("/account/{accountId}")
    public ResponseEntity<List<Order>> getOrdersByAccountId(@PathVariable Long accountId) {
        return ResponseEntity.ok(orderService.getOrdersByCustomerId(accountId));
    }

    // POST mapping expecting JSON payload of a new order
    @PostMapping
    public ResponseEntity<Order> createOrder(
            // Ensures @NotNull constraint values are met before saving
            @Valid @RequestBody Order order) {
        Order createdOrder = orderService.createOrder(order);
        // Returns the final formatted structure wrapped via 201 flag
        return ResponseEntity.status(HttpStatus.CREATED).body(createdOrder);
    }

    // PUT endpoint resolving complete data overwrites matching a specific ID parameter
    @PutMapping("/{id}")
    public ResponseEntity<Order> updateOrder(
            @PathVariable Long id,
            @RequestBody Order orderDetails) {
        try {
            Order updatedOrder = orderService.updateOrder(id, orderDetails);
            return ResponseEntity.ok(updatedOrder);
        } catch (IllegalArgumentException e) {
            // Returns a 404 if updating an ID that doesn't exist yet
            return ResponseEntity.notFound().build();
        }
    }
}