package com.example.customersummary.service;

import com.example.customersummary.model.CustomerSummary;
import com.example.customersummary.repository.AccountRepository;
import com.example.customersummary.repository.CustomerSummaryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CustomerSummaryService {

    private final CustomerSummaryRepository customerSummaryRepository;
    private final AccountRepository accountRepository;

    public List<CustomerSummary> getAllCustomerSummaries() {
        List<CustomerSummary> summaries = customerSummaryRepository.findAll();
        Map<Long, String> accountNames = accountRepository.findAllById(summaries.stream()
                        .map(CustomerSummary::getAccountId)
                        .distinct()
                        .toList())
                .stream()
                .collect(Collectors.toMap(
                        account -> account.getId(),
                        account -> account.getAccountName(),
                        (first, ignored) -> first));
        summaries.forEach(summary -> summary.setAccountName(accountNames.get(summary.getAccountId())));
        return summaries;
    }

    public Optional<CustomerSummary> getCustomerSummaryById(Long id) {
        return customerSummaryRepository.findById(id);
    }

    public List<CustomerSummary> getCustomerSummariesByAccountId(Long accountId) {
        return customerSummaryRepository.findByAccountId(accountId);
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
