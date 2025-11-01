package com.example.payments.service;

import com.example.payments.model.Payment;
import com.example.payments.repository.PaymentRepository;
import com.paypal.core.PayPalHttpClient;
import com.paypal.http.HttpResponse;
import com.paypal.orders.*;
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

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final PayPalHttpClient payPalHttpClient;

    public List<Payment> getAllPayments() {
        return paymentRepository.findAll();
    }

    public Optional<Payment> getPaymentById(Long id) {
        return paymentRepository.findById(id);
    }

    public List<Payment> getPaymentsByOrderId(Long orderId) {
        return paymentRepository.findByOrderId(orderId);
    }

    public List<Payment> getPaymentsByCustomerId(Long customerId) {
        return paymentRepository.findByAccountId(customerId);
    }

    public List<Payment> getPaymentsByStatus(String paymentStatus) {
        return paymentRepository.findByPaymentStatus(paymentStatus);
    }

    @Transactional
    public Payment createPayment(Payment payment) {
        return paymentRepository.save(payment);
    }

    @Transactional
    public Payment updatePayment(Long id, Payment paymentDetails) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found with id: " + id));

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

    @Transactional
    public void deletePayment(Long id) {
        if (!paymentRepository.existsById(id)) {
            throw new IllegalArgumentException("Payment not found with id: " + id);
        }
        paymentRepository.deleteById(id);
    }

    // ===== PayPal Integration Methods =====

    /**
     * Creates a PayPal order for checkout
     * @param amount The payment amount
     * @param currency Currency code (e.g., "USD", "EUR")
     * @return PayPal Order with ID and approval URL
     */
    public Order createPayPalOrder(BigDecimal amount, String currency) throws IOException {
        OrderRequest orderRequest = new OrderRequest();
        orderRequest.checkoutPaymentIntent("CAPTURE");

        // Set up purchase unit
        List<PurchaseUnitRequest> purchaseUnits = new ArrayList<>();
        purchaseUnits.add(
            new PurchaseUnitRequest()
                .amountWithBreakdown(
                    new AmountWithBreakdown()
                        .currencyCode(currency)
                        .value(amount.setScale(2, RoundingMode.HALF_UP).toString())
                )
        );
        orderRequest.purchaseUnits(purchaseUnits);

        ApplicationContext applicationContext = new ApplicationContext()
            .returnUrl("https://www.example.com/payment/success")
            .cancelUrl("https://www.example.com/payment/cancel");
        orderRequest.applicationContext(applicationContext);

        // Create order request
        OrdersCreateRequest request = new OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody(orderRequest);

        try {
            HttpResponse<Order> response = payPalHttpClient.execute(request);
            log.info("Created PayPal order: {}", response.result().id());
            return response.result();
        } catch (IOException e) {
            log.error("Error creating PayPal order", e);
            throw e;
        }
    }

    /**
     * Captures payment for a PayPal order
     * @param orderId The PayPal order ID to capture
     * @return Captured order details
     */
    public Order capturePayPalOrder(String orderId) throws IOException {
        OrdersCaptureRequest request = new OrdersCaptureRequest(orderId);
        request.prefer("return=representation");

        try {
            HttpResponse<Order> response = payPalHttpClient.execute(request);
            log.info("Captured PayPal order: {}", orderId);
            return response.result();
        } catch (IOException e) {
            log.error("Error capturing PayPal order: {}", orderId, e);
            throw e;
        }
    }

    /**
     * Gets details of a PayPal order
     * @param orderId The PayPal order ID
     * @return Order details
     */
    public Order getPayPalOrderDetails(String orderId) throws IOException {
        OrdersGetRequest request = new OrdersGetRequest(orderId);

        try {
            HttpResponse<Order> response = payPalHttpClient.execute(request);
            return response.result();
        } catch (IOException e) {
            log.error("Error getting PayPal order details: {}", orderId, e);
            throw e;
        }
    }
}
