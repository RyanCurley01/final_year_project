package com.example.customersummary.service;

import com.example.customersummary.model.CustomerSummary;
import com.example.customersummary.repository.CustomerSummaryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CustomerSummaryService {

    private final CustomerSummaryRepository customerSummaryRepository;

    public List<CustomerSummary> getAllCustomerSummaries() {
        return customerSummaryRepository.findAll();
    }

    public Optional<CustomerSummary> getCustomerSummaryById(Long id) {
        return customerSummaryRepository.findById(id);
    }

    public List<CustomerSummary> getCustomerSummariesByCustomerId(Long customerId) {
        return customerSummaryRepository.findByCustomerId(customerId);
    }

    public List<CustomerSummary> getCustomerSummariesByProductId(Long productId) {
        return customerSummaryRepository.findByProductId(productId);
    }

    public List<CustomerSummary> getCustomerSummariesByOrderId(Long orderId) {
        return customerSummaryRepository.findByOrderId(orderId);
    }

    @Transactional
    public CustomerSummary createCustomerSummary(CustomerSummary customerSummary) {
        return customerSummaryRepository.save(customerSummary);
    }

    @Transactional
    public void deleteCustomerSummary(Long id) {
        if (!customerSummaryRepository.existsById(id)) {
            throw new IllegalArgumentException("Customer summary not found with id: " + id);
        }
        customerSummaryRepository.deleteById(id);
    }
}
