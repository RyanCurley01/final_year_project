package com.example.wishlist.repository;

import com.example.wishlist.model.Wishlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WishlistRepository extends JpaRepository<Wishlist, Long> {
    
    List<Wishlist> findByAccountId(Long accountId);
    
    List<Wishlist> findByProductId(Long productId);

    Optional<Wishlist> findByAccountIdAndProductId(Long accountId, Long productId);

    void deleteByAccountIdAndProductId(Long accountId, Long productId);
}
