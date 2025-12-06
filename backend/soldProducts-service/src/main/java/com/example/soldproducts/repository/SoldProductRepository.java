package com.example.soldproducts.repository;

import com.example.soldproducts.model.SoldProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SoldProductRepository extends JpaRepository<SoldProduct, Long> {
    
    List<SoldProduct> findByOrderItemId(Long orderItemId);
    
    List<SoldProduct> findByProductId(Long productId);
}
