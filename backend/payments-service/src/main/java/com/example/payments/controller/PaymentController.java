package com.example.payments.controller;

// Import the local Payment model and Payment Service
import com.example.payments.model.Payment;
import com.example.payments.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
// Import Spring web classes and annotations
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Tag this class as a REST controller serving API data
@RestController
// Base route for this specific controller is /api/payments
@RequestMapping("/api/payments")
// Allow browsers fetching from other ports/domains (useful for React frontend dev)
@CrossOrigin(origins = "*")
// Build a constructor for final fields automatically
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    // GET endpoint: Retrieves a list of payments. Supports optional filter query params.
    // e.g. /api/payments/getAllPayments?status=COMPLETED
    @GetMapping("/getAllPayments")
    public ResponseEntity<List<Payment>> getAllPayments(
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String status) {
        
        // Return payments that belong just to a specific order
        if (orderId != null) {
            return ResponseEntity.ok(paymentService.getPaymentsByOrderId(orderId));
        }
        // Return payments that belong just to a specific customer account
        if (customerId != null) {
            return ResponseEntity.ok(paymentService.getPaymentsByCustomerId(customerId));
        }
        // Return payments that matched a specific status parameter
        if (status != null) {
            return ResponseEntity.ok(paymentService.getPaymentsByStatus(status));
        }
        
        // If no query parameters were passed, retrieve all payments
        return ResponseEntity.ok(paymentService.getAllPayments());
    }

    // GET endpoint: Retrieve exactly one payment record by its primary key ID
    @GetMapping("/{id}")
    public ResponseEntity<Payment> getPaymentById(@PathVariable Long id) {
        return paymentService.getPaymentById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // GET endpoint: Retrieve a single payment mapped entirely via its external PayPal token string
    @GetMapping("/paypal/{paypalOrderId}")
    public ResponseEntity<Payment> getPaymentByPaypalOrderId(@PathVariable String paypalOrderId) {
        return paymentService.getPaymentByPaypalOrderId(paypalOrderId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // PUT endpoint: Allows callers to modify fields in an existing payment entity
    @PutMapping("/{id}")
    public ResponseEntity<Payment> updatePayment(
            @PathVariable Long id,
            @RequestBody Payment paymentDetails) {
        try {
            // Save updated fields to the database
            Payment updatedPayment = paymentService.updatePayment(id, paymentDetails);
            return ResponseEntity.ok(updatedPayment);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // DELETE endpoint: Hard delete a payment record from the database
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        try {
            paymentService.deletePayment(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ===== PayPal REST Endpoints ===== //

    // POST endpoint: Start the PayPal payment loop before showing the frontend popup to the user
    @PostMapping("/paypal/create-order")
    public ResponseEntity<?> createPayPalOrder(@RequestBody CreatePayPalOrderRequest request) {
        try {
            // Delegate the remote initialization call to the service using variables from the Request body
            com.paypal.orders.Order order = paymentService.createPayPalOrder(
                request.getAmount(), 
                request.getCurrency(),
                request.getOrderId(),
                request.getProductId(),
                request.getAccountId()
            );
            
            // Re-package specific minimal data fields for the frontend so it is simpler to interpret
            com.example.payments.dto.PayPalOrderResponse response = new com.example.payments.dto.PayPalOrderResponse();
            response.setId(order.id());
            response.setStatus(order.status());
            
            // Format external HATEOAS references given by PayPal (like approval links and actions)
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
            
            // Return to frontend to begin the UI popup
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            // Dump basic HTTP 500 block if checkout fails to prepare remotely
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Error creating PayPal order: " + e.getMessage());
        }
    }

    // POST endpoint: Secure funds and finalized completed state once the frontend user validates the charge
    @PostMapping("/paypal/capture-order/{orderId}")
    public ResponseEntity<?> capturePayPalOrder(@PathVariable String orderId) {
        try {
            // Force capture action
            com.paypal.orders.Order order = paymentService.capturePayPalOrder(orderId);
            
            // Return structured success confirmation identical to the schema used in create
            com.example.payments.dto.PayPalOrderResponse response = new com.example.payments.dto.PayPalOrderResponse();
            response.setId(order.id());
            response.setStatus(order.status());
            
            // Copy HATEOAS capture validation resources
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

    // GET endpoint: Manual fallback query checking actual external status if web hooks fail
    @GetMapping("/paypal/order/{orderId}")
    public ResponseEntity<?> getPayPalOrderDetails(@PathVariable String orderId) {
        try {
            // Request PayPal external REST service API loop directly
            com.paypal.orders.Order order = paymentService.getPayPalOrderDetails(orderId);
            
            // Convert to lightweight JSON DTO wrapper
            com.example.payments.dto.PayPalOrderResponse response = new com.example.payments.dto.PayPalOrderResponse();
            response.setId(order.id());
            response.setStatus(order.status());
            
            // Re-package API metadata pointers
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

    // Direct URL fallback executed if a legacy browser session completes successfully natively 
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

    // Direct URL fallback executed if a legacy browser session hits 'cancel' natively
    @GetMapping("/paypal/cancel")
    public ResponseEntity<String> paypalCancel() {
        return ResponseEntity.ok(
            "<html><body>" +
            "<h1>Payment Cancelled</h1>" +
            "<p>You cancelled the PayPal payment.</p>" +
            "</body></html>"
        );
    }

    // Inner DTO class representing incoming JSON request body structures during the initial Checkout stage 
    public static class CreatePayPalOrderRequest {
        private java.math.BigDecimal amount; // Using BigDecimal limits arbitrary precision math errors
        private String currency;   // Currency definition (e.g., 'USD')
        private Long orderId;      // Corresponding order record
        private Long productId;    // Product purchased   
        private Long accountId;    // Buyer account ID  

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