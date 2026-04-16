package com.example.payments.service;

// Import the Payment model and its repository
import com.example.payments.model.Payment;
import com.example.payments.repository.PaymentRepository;
// Import PayPal SDK classes for creating and capturing orders
import com.paypal.core.PayPalHttpClient;
import com.paypal.http.HttpResponse;
import com.paypal.orders.*;
// Import Lombok and SLF4J annotations
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

// Mark as a Spring Service to hold business logic
@Service
// Generate constructor for final fields automatically
@RequiredArgsConstructor
// Enable standard SLF4J logging (provides the 'log' object)
@Slf4j
public class PaymentService {

    // Inject database repository for Payment entities
    private final PaymentRepository paymentRepository;
    // Inject the configured PayPal HTTP Client context
    private final PayPalHttpClient payPalHttpClient;

    // Fetch all payments in the database
    public List<Payment> getAllPayments() {
        return paymentRepository.findAll();
    }

    // Fetch a single payment by its primary key
    public Optional<Payment> getPaymentById(Long id) {
        return paymentRepository.findById(id);
    }

    // Fetch all payments tied to a specific order ID
    public List<Payment> getPaymentsByOrderId(Long orderId) {
        return paymentRepository.findByOrderId(orderId);
    }

    // Fetch all payments tied to a specific account ID
    public List<Payment> getPaymentsByCustomerId(Long customerId) {
        return paymentRepository.findByAccountId(customerId);
    }

    // Fetch all payments matching a specific status (e.g., PENDING, COMPLETED)
    public List<Payment> getPaymentsByStatus(String paymentStatus) {
        return paymentRepository.findByPaymentStatus(paymentStatus);
    }

    // Fetch a payment specifically by its external PayPal Order ID
    public Optional<Payment> getPaymentByPaypalOrderId(String paypalOrderId) {
        return paymentRepository.findByPaypalOrderId(paypalOrderId);
    }

    // Save a new payment entity. @Transactional ensures database atomicity
    @Transactional
    public Payment createPayment(Payment payment) {
        return paymentRepository.save(payment);
    }

    // Update an existing payment entity fields, committing changes back to the database
    @Transactional
    public Payment updatePayment(Long id, Payment paymentDetails) {
        // Find existing record or throw exception if not found
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found with id: " + id));

        // Update fields only if new values are provided
        if (paymentDetails.getOrderId() != null) {
            payment.setOrderId(paymentDetails.getOrderId());
        }
        if (paymentDetails.getProductId() != null) {
            payment.setProductId(paymentDetails.getProductId());
        }
        if (paymentDetails.getAccountId() != null) {
            payment.setAccountId(paymentDetails.getAccountId());
        }
        if (paymentDetails.getPaymentAmount() != null) {
            payment.setPaymentAmount(paymentDetails.getPaymentAmount());
        }
        if (paymentDetails.getPaymentStatus() != null) {
            payment.setPaymentStatus(paymentDetails.getPaymentStatus());
        }
        if (paymentDetails.getPaymentDateAndTime() != null) {
            payment.setPaymentDateAndTime(paymentDetails.getPaymentDateAndTime());
        }

        return paymentRepository.save(payment);
    }

    // Delete a payment by its database ID
    @Transactional
    public void deletePayment(Long id) {
        if (!paymentRepository.existsById(id)) {
            throw new IllegalArgumentException("Payment not found with id: " + id);
        }
        paymentRepository.deleteById(id);
    }

    // ===== PayPal Integration Methods ===== //

    /**
     * Creates a PayPal order for checkout (simple wrapper without DB persistence)
     * @param amount The payment amount
     * @param currency Currency code (e.g., "USD", "EUR")
     * @return PayPal Order with ID and approval URL
     */
    public Order createPayPalOrder(BigDecimal amount, String currency) throws IOException {
        return createPayPalOrder(amount, currency, null, null, null);
    }

    /**
     * Creates a PayPal order for checkout and stores a pending record in the database
     * @param amount The payment amount
     * @param currency Currency code (e.g., "USD", "EUR")
     * @param orderId Internal order ID (optional)
     * @param productId Product ID (optional)
     * @param accountId Account ID (optional)
     * @return PayPal Order with ID and approval URL
     */
    @Transactional
    public Order createPayPalOrder(BigDecimal amount, String currency, Long orderId, Long productId, Long accountId) throws IOException {
        // Setup payload requesting PayPal to authorize and capture funds immediately
        OrderRequest orderRequest = new OrderRequest();
        orderRequest.checkoutPaymentIntent("CAPTURE");

        // Format the purchase unit data (price and currency) required by PayPal
        List<PurchaseUnitRequest> purchaseUnits = new ArrayList<>();
        purchaseUnits.add(
            new PurchaseUnitRequest()
                .amountWithBreakdown(
                    new AmountWithBreakdown()
                        .currencyCode(currency)
                        // PayPal requires prices formatted correctly as strings with 2 decimal places
                        .value(amount.setScale(2, RoundingMode.HALF_UP).toString())
                )
        );
        orderRequest.purchaseUnits(purchaseUnits);

        // Provide return URLs used if the user completes or cancels the PayPal flow
        ApplicationContext applicationContext = new ApplicationContext()
            .returnUrl("https://www.example.com/payment/success")
            .cancelUrl("https://www.example.com/payment/cancel");
        orderRequest.applicationContext(applicationContext);

        // Build the HTTP POST request to PayPal's API
        OrdersCreateRequest request = new OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody(orderRequest);

        try {
            // Execute request via PayPal SDK
            HttpResponse<Order> response = payPalHttpClient.execute(request);
            Order paypalOrder = response.result();
            log.info("Created PayPal order: {}", paypalOrder.id());

            // No DB record created here — Payment row is only created after successful capture
            // in capturePayPalOrder() to avoid orphaned PENDING rows when users cancel.

            // Return the PayPal order details to the frontend to trigger the checkout popup
            return paypalOrder;
        } catch (IOException e) {
            log.error("Error creating PayPal order", e);
            throw e;
        }
    }

    /**
     * Sent to PayPal after the user approves payment to finalize the charge.
     * Creates the Payment DB record only after successful capture.
     * @param paypalOrderId The assigned PayPal order identifier
     * @param productId Product ID from the original create-order request (optional)
     * @param accountId Account ID from the original create-order request (optional)
     * @return Captured order details verifying the charge was successful
     */
    @Transactional
    public Order capturePayPalOrder(String paypalOrderId, Long orderId, Long productId, Long accountId) throws IOException {
        // Create request signaling to PayPal that we are ready to capture funds
        OrdersCaptureRequest request = new OrdersCaptureRequest(paypalOrderId);
        request.prefer("return=representation");

        try {
            // Trigger capture
            HttpResponse<Order> response = payPalHttpClient.execute(request);
            Order capturedOrder = response.result();
            log.info("Captured PayPal order: {}", paypalOrderId);

            // Extract the captured amount from the PayPal response
            BigDecimal capturedAmount = BigDecimal.ZERO;
            if (capturedOrder.purchaseUnits() != null && !capturedOrder.purchaseUnits().isEmpty()) {
                String amountValue = capturedOrder.purchaseUnits().get(0).amountWithBreakdown().value();
                capturedAmount = new BigDecimal(amountValue);
            }

            // Create the Payment record now that funds are confirmed captured
            Payment payment = new Payment();
            payment.setPaypalOrderId(paypalOrderId);
            payment.setPaymentAmount(capturedAmount);
            payment.setPaymentStatus("COMPLETED");
            payment.setOrderId(orderId);
            payment.setProductId(productId);
            payment.setAccountId(accountId);
            paymentRepository.save(payment);
            log.info("Created COMPLETED Payment record for PayPal order: {}", paypalOrderId);

            return capturedOrder;
        } catch (IOException e) {
            log.error("Error capturing PayPal order: {}", paypalOrderId, e);
            throw e;
        }
    }

    /**
     * Looks up an existing PayPal order to verify details directly from the gateway
     * @param orderId The internal PayPal order ID
     * @return PayPal Order details payload
     */
    public Order getPayPalOrderDetails(String orderId) throws IOException {
        // Generate an API request to read the order data
        OrdersGetRequest request = new OrdersGetRequest(orderId);

        try {
            // Execute exact status check from PayPal
            HttpResponse<Order> response = payPalHttpClient.execute(request);
            return response.result();
        } catch (IOException e) {
            log.error("Error getting PayPal order details: {}", orderId, e);
            throw e;
        }
    }
}
