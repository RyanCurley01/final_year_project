package com.example.stock.repository;

import com.example.stock.model.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StockRepository extends JpaRepository<Stock, Long> {
    
    Optional<Stock> findByProductId(Long productId);
    
    boolean existsByProductId(Long productId);
}
