package com.example.soldproducts.service;

import com.example.soldproducts.model.SoldProduct;
import com.example.soldproducts.repository.SoldProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class SoldProductService {

    private final SoldProductRepository soldProductRepository;

    public List<SoldProduct> getAllSoldProducts() {
        return soldProductRepository.findAll();
    }

    public Optional<SoldProduct> getSoldProductById(Long id) {
        return soldProductRepository.findById(id);
    }

    public List<SoldProduct> getSoldProductsByOrderItemId(Long orderItemId) {
        return soldProductRepository.findByOrderItemId(orderItemId);
    }

    public List<SoldProduct> getSoldProductsByProductId(Long productId) {
        return soldProductRepository.findByProductId(productId);
    }

    @Transactional
    public SoldProduct createSoldProduct(SoldProduct soldProduct) {
        return soldProductRepository.save(soldProduct);
    }

    @Transactional
    public void deleteSoldProduct(Long id) {
        if (!soldProductRepository.existsById(id)) {
            throw new IllegalArgumentException("Sold product not found with id: " + id);
        }
        soldProductRepository.deleteById(id);
    }
}
