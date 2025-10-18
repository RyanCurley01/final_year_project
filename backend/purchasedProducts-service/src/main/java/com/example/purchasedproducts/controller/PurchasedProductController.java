package com.example.purchasedproducts.controller;

import com.example.purchasedproducts.model.PurchasedProduct;
import com.example.purchasedproducts.service.PurchasedProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/purchased-products")
@RequiredArgsConstructor
public class PurchasedProductController {

    private final PurchasedProductService purchasedProductService;

    @GetMapping
    public ResponseEntity<List<PurchasedProduct>> getAllPurchasedProducts(
            @RequestParam(required = false) Long orderItemId,
            @RequestParam(required = false) Long productId) {
        
        if (orderItemId != null) {
            return ResponseEntity.ok(purchasedProductService.getPurchasedProductsByOrderItemId(orderItemId));
        }
        if (productId != null) {
            return ResponseEntity.ok(purchasedProductService.getPurchasedProductsByProductId(productId));
        }
        
        return ResponseEntity.ok(purchasedProductService.getAllPurchasedProducts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PurchasedProduct> getPurchasedProductById(@PathVariable Long id) {
        return purchasedProductService.getPurchasedProductById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<PurchasedProduct> createPurchasedProduct(@Valid @RequestBody PurchasedProduct purchasedProduct) {
        PurchasedProduct created = purchasedProductService.createPurchasedProduct(purchasedProduct);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePurchasedProduct(@PathVariable Long id) {
        try {
            purchasedProductService.deletePurchasedProduct(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
