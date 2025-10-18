package com.example.wishlist.controller;

import com.example.wishlist.model.Wishlist;
import com.example.wishlist.service.WishlistService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/wishlist")
@RequiredArgsConstructor
public class WishlistController {

    private final WishlistService wishlistService;

    @GetMapping
    public ResponseEntity<List<Wishlist>> getAllWishlists(
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long productId) {
        
        if (customerId != null) {
            return ResponseEntity.ok(wishlistService.getWishlistsByCustomerId(customerId));
        }
        if (productId != null) {
            return ResponseEntity.ok(wishlistService.getWishlistsByProductId(productId));
        }
        
        return ResponseEntity.ok(wishlistService.getAllWishlists());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Wishlist> getWishlistById(@PathVariable Long id) {
        return wishlistService.getWishlistById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Wishlist> createWishlist(@Valid @RequestBody Wishlist wishlist) {
        Wishlist createdWishlist = wishlistService.createWishlist(wishlist);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdWishlist);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Wishlist> updateWishlist(
            @PathVariable Long id,
            @RequestBody Wishlist wishlistDetails) {
        try {
            Wishlist updatedWishlist = wishlistService.updateWishlist(id, wishlistDetails);
            return ResponseEntity.ok(updatedWishlist);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteWishlist(@PathVariable Long id) {
        try {
            wishlistService.deleteWishlist(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
