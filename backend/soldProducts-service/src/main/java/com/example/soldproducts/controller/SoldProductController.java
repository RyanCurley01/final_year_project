package com.example.soldproducts.controller;

import com.example.soldproducts.model.SoldProduct;
import com.example.soldproducts.service.SoldProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sold-products")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class SoldProductController {

    private final SoldProductService soldProductService;

    @GetMapping
    public ResponseEntity<List<SoldProduct>> getAllSoldProducts(
            @RequestParam(required = false) Long orderItemId,
            @RequestParam(required = false) Long productId) {
        
        if (orderItemId != null) {
            return ResponseEntity.ok(soldProductService.getSoldProductsByOrderItemId(orderItemId));
        }
        if (productId != null) {
            return ResponseEntity.ok(soldProductService.getSoldProductsByProductId(productId));
        }
        
        return ResponseEntity.ok(soldProductService.getAllSoldProducts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<SoldProduct> getSoldProductById(@PathVariable Long id) {
        return soldProductService.getSoldProductById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<SoldProduct> createSoldProduct(@Valid @RequestBody SoldProduct soldProduct) {
        SoldProduct createdProduct = soldProductService.createSoldProduct(soldProduct);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdProduct);
    }
}
