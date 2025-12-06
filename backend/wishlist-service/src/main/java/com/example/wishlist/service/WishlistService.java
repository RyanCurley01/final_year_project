package com.example.wishlist.service;

import com.example.wishlist.model.Wishlist;
import com.example.wishlist.repository.WishlistRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class WishlistService {

    private final WishlistRepository wishlistRepository;

    public List<Wishlist> getAllWishlists() {
        return wishlistRepository.findAll();
    }

    public Optional<Wishlist> getWishlistById(Long id) {
        return wishlistRepository.findById(id);
    }

    public List<Wishlist> getWishlistsByAccountId(Long accountId) {
        return wishlistRepository.findByAccountId(accountId);
    }

    public List<Wishlist> getWishlistsByProductId(Long productId) {
        return wishlistRepository.findByProductId(productId);
    }

    @Transactional
    public Wishlist createWishlist(Wishlist wishlist) {
        return wishlistRepository.save(wishlist);
    }

    @Transactional
    public Wishlist updateWishlist(Long id, Wishlist wishlistDetails) {
        Wishlist wishlist = wishlistRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Wishlist not found with id: " + id));

        if (wishlistDetails.getAccountId() != null) {
            wishlist.setAccountId(wishlistDetails.getAccountId());
        }
        if (wishlistDetails.getProductId() != null) {
            wishlist.setProductId(wishlistDetails.getProductId());
        }

        return wishlistRepository.save(wishlist);
    }

    @Transactional
    public void deleteWishlist(Long id) {
        if (!wishlistRepository.existsById(id)) {
            throw new IllegalArgumentException("Wishlist not found with id: " + id);
        }
        wishlistRepository.deleteById(id);
    }
}
