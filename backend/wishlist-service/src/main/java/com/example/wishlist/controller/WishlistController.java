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
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class WishlistController {

    private final WishlistService wishlistService;

    @GetMapping("/getAllWishlists")
    public ResponseEntity<List<Wishlist>> getAllWishlists(
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) Long productId) {

        if (accountId != null) {
            return ResponseEntity.ok(wishlistService.getWishlistsByAccountId(accountId));
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
        Wishlist created = wishlistService.createWishlist(wishlist);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Wishlist> updateWishlist(@PathVariable Long id, @Valid @RequestBody Wishlist wishlistDetails) {
        try {
            Wishlist updated = wishlistService.updateWishlist(id, wishlistDetails);
            return ResponseEntity.ok(updated);
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
