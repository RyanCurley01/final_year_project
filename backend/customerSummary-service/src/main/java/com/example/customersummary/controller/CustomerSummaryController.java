package com.example.customersummary.controller;

import com.example.customersummary.model.CustomerSummary;
import com.example.customersummary.service.CustomerSummaryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/customer-summary")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class CustomerSummaryController {

    private final CustomerSummaryService customerSummaryService;

    @GetMapping
    public ResponseEntity<List<CustomerSummary>> getAllCustomerSummaries(
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) Long orderId) {
        
        if (accountId != null) {
            return ResponseEntity.ok(customerSummaryService.getCustomerSummariesByAccountId(accountId));
        }
        if (productId != null) {
            return ResponseEntity.ok(customerSummaryService.getCustomerSummariesByProductId(productId));
        }
        if (orderId != null) {
            return ResponseEntity.ok(customerSummaryService.getCustomerSummariesByOrderId(orderId));
        }
        
        return ResponseEntity.ok(customerSummaryService.getAllCustomerSummaries());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CustomerSummary> getCustomerSummaryById(@PathVariable Long id) {
        return customerSummaryService.getCustomerSummaryById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<CustomerSummary> createCustomerSummary(@Valid @RequestBody CustomerSummary customerSummary) {
        CustomerSummary createdSummary = customerSummaryService.createCustomerSummary(customerSummary);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdSummary);
    }
}
