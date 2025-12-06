package com.example.purchasedproducts.service;

import com.example.purchasedproducts.model.PurchasedProduct;
import com.example.purchasedproducts.repository.PurchasedProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PurchasedProductService {

    private final PurchasedProductRepository purchasedProductRepository;

    public List<PurchasedProduct> getAllPurchasedProducts() {
        return purchasedProductRepository.findAll();
    }

    public Optional<PurchasedProduct> getPurchasedProductById(Long id) {
        return purchasedProductRepository.findById(id);
    }

    public List<PurchasedProduct> getPurchasedProductsByOrderItemId(Long orderItemId) {
        return purchasedProductRepository.findByOrderItemId(orderItemId);
    }

    public List<PurchasedProduct> getPurchasedProductsByProductId(Long productId) {
        return purchasedProductRepository.findByProductId(productId);
    }

    @Transactional
    public PurchasedProduct createPurchasedProduct(PurchasedProduct purchasedProduct) {
        return purchasedProductRepository.save(purchasedProduct);
    }

    @Transactional
    public void deletePurchasedProduct(Long id) {
        if (!purchasedProductRepository.existsById(id)) {
            throw new IllegalArgumentException("Purchased product not found with id: " + id);
        }
        purchasedProductRepository.deleteById(id);
    }
}
