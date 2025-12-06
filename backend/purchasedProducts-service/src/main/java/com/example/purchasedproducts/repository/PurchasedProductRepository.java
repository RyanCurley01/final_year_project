package com.example.purchasedproducts.repository;

import com.example.purchasedproducts.model.PurchasedProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PurchasedProductRepository extends JpaRepository<PurchasedProduct, Long> {
    
    List<PurchasedProduct> findByOrderItemId(Long orderItemId);
    
    List<PurchasedProduct> findByProductId(Long productId);
}
