package com.example.customersummary.repository;

import com.example.customersummary.model.CustomerSummary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CustomerSummaryRepository extends JpaRepository<CustomerSummary, Long> {
    
    List<CustomerSummary> findByCustomerId(Long customerId);
    
    List<CustomerSummary> findByProductId(Long productId);
    
    List<CustomerSummary> findByOrderId(Long orderId);
}
