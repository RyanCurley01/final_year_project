package com.example.payments.service;

import com.example.payments.model.Payment;
import com.example.payments.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;

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
        return paymentRepository.findByCustomerId(customerId);
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
        if (paymentDetails.getCustomerId() != null) {
            payment.setCustomerId(paymentDetails.getCustomerId());
        }
        if (paymentDetails.getPaymentAmount() != null) {
            payment.setPaymentAmount(paymentDetails.getPaymentAmount());
        }
        if (paymentDetails.getPaymentStatus() != null) {
            payment.setPaymentStatus(paymentDetails.getPaymentStatus());
        }
        if (paymentDetails.getPaymentMethod() != null) {
            payment.setPaymentMethod(paymentDetails.getPaymentMethod());
        }
        if (paymentDetails.getTransactionId() != null) {
            payment.setTransactionId(paymentDetails.getTransactionId());
        }
        if (paymentDetails.getPaymentDate() != null) {
            payment.setPaymentDate(paymentDetails.getPaymentDate());
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
}
