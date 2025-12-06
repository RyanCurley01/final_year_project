package com.example.payments.controller;

import com.example.payments.model.Payment;
import com.example.payments.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @GetMapping("/getAllPayments")
    public ResponseEntity<List<Payment>> getAllPayments(
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String status) {
        
        if (orderId != null) {
            return ResponseEntity.ok(paymentService.getPaymentsByOrderId(orderId));
        }
        if (customerId != null) {
            return ResponseEntity.ok(paymentService.getPaymentsByCustomerId(customerId));
        }
        if (status != null) {
            return ResponseEntity.ok(paymentService.getPaymentsByStatus(status));
        }
        
        return ResponseEntity.ok(paymentService.getAllPayments());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Payment> getPaymentById(@PathVariable Long id) {
        return paymentService.getPaymentById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/paypal/{paypalOrderId}")
    public ResponseEntity<Payment> getPaymentByPaypalOrderId(@PathVariable String paypalOrderId) {
        return paymentService.getPaymentByPaypalOrderId(paypalOrderId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Payment> updatePayment(
            @PathVariable Long id,
            @RequestBody Payment paymentDetails) {
        try {
            Payment updatedPayment = paymentService.updatePayment(id, paymentDetails);
            return ResponseEntity.ok(updatedPayment);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        try {
            paymentService.deletePayment(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ===== PayPal REST Endpoints =====

    @PostMapping("/paypal/create-order")
    public ResponseEntity<?> createPayPalOrder(@RequestBody CreatePayPalOrderRequest request) {
        try {
            com.paypal.orders.Order order = paymentService.createPayPalOrder(
                request.getAmount(), 
                request.getCurrency(),
                request.getOrderId(),
                request.getProductId(),
                request.getAccountId()
            );
            
            // Convert to simplified DTO for JSON response
            com.example.payments.dto.PayPalOrderResponse response = new com.example.payments.dto.PayPalOrderResponse();
            response.setId(order.id());
            response.setStatus(order.status());
            
            // Convert links
            if (order.links() != null) {
                java.util.List<com.example.payments.dto.PayPalOrderResponse.Link> links = order.links().stream()
                    .map(link -> new com.example.payments.dto.PayPalOrderResponse.Link(
                        link.href(), 
                        link.rel(), 
                        link.method()
                    ))
                    .collect(java.util.stream.Collectors.toList());
                response.setLinks(links);
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Error creating PayPal order: " + e.getMessage());
        }
    }

    @PostMapping("/paypal/capture-order/{orderId}")
    public ResponseEntity<?> capturePayPalOrder(@PathVariable String orderId) {
        try {
            com.paypal.orders.Order order = paymentService.capturePayPalOrder(orderId);
            
            // Convert to simplified DTO for JSON response
            com.example.payments.dto.PayPalOrderResponse response = new com.example.payments.dto.PayPalOrderResponse();
            response.setId(order.id());
            response.setStatus(order.status());
            
            // Convert links
            if (order.links() != null) {
                java.util.List<com.example.payments.dto.PayPalOrderResponse.Link> links = order.links().stream()
                    .map(link -> new com.example.payments.dto.PayPalOrderResponse.Link(
                        link.href(), 
                        link.rel(), 
                        link.method()
                    ))
                    .collect(java.util.stream.Collectors.toList());
                response.setLinks(links);
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Error capturing PayPal order: " + e.getMessage());
        }
    }

    @GetMapping("/paypal/order/{orderId}")
    public ResponseEntity<?> getPayPalOrderDetails(@PathVariable String orderId) {
        try {
            com.paypal.orders.Order order = paymentService.getPayPalOrderDetails(orderId);
            
            // Convert to simplified DTO for JSON response
            com.example.payments.dto.PayPalOrderResponse response = new com.example.payments.dto.PayPalOrderResponse();
            response.setId(order.id());
            response.setStatus(order.status());
            
            // Convert links
            if (order.links() != null) {
                java.util.List<com.example.payments.dto.PayPalOrderResponse.Link> links = order.links().stream()
                    .map(link -> new com.example.payments.dto.PayPalOrderResponse.Link(
                        link.href(), 
                        link.rel(), 
                        link.method()
                    ))
                    .collect(java.util.stream.Collectors.toList());
                response.setLinks(links);
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body("PayPal order not found: " + e.getMessage());
        }
    }

    @GetMapping("/paypal/success")
    public ResponseEntity<String> paypalSuccess(@RequestParam(required = false) String token) {
        return ResponseEntity.ok(
            "<html><body>" +
            "<h1>Payment Approved!</h1>" +
            "<p>Order ID: " + (token != null ? token : "N/A") + "</p>" +
            "<p>Now capture the payment using POST /api/payments/paypal/capture-order/" + token + "</p>" +
            "</body></html>"
        );
    }

    @GetMapping("/paypal/cancel")
    public ResponseEntity<String> paypalCancel() {
        return ResponseEntity.ok(
            "<html><body>" +
            "<h1>Payment Cancelled</h1>" +
            "<p>You cancelled the PayPal payment.</p>" +
            "</body></html>"
        );
    }

    // DTO for create order request
    public static class CreatePayPalOrderRequest {
        private java.math.BigDecimal amount;
        private String currency;
        private Long orderId;
        private Long productId;   
        private Long accountId;   

        public java.math.BigDecimal getAmount() {
            return amount;
        }

        public void setAmount(java.math.BigDecimal amount) {
            this.amount = amount;
        }

        public String getCurrency() {
            return currency;
        }

        public void setCurrency(String currency) {
            this.currency = currency;
        }

        public Long getOrderId() {
            return orderId;
        }

        public void setOrderId(Long orderId) {
            this.orderId = orderId;
        }

        public Long getProductId() {
            return productId;
        }

        public void setProductId(Long productId) {
            this.productId = productId;
        }

        public Long getAccountId() {
            return accountId;
        }

        public void setAccountId(Long accountId) {
            this.accountId = accountId;
        }
    }
}
