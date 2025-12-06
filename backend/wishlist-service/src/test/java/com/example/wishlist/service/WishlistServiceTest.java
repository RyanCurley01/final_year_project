package com.example.wishlist.service;

import com.example.wishlist.model.Wishlist;
import com.example.wishlist.repository.WishlistRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Wishlist Service Unit Tests")
class WishlistServiceTest {

    @Mock
    private WishlistRepository wishlistRepository;

    @InjectMocks
    private WishlistService wishlistService;

    private Wishlist testWishlist;

    @BeforeEach
    void setUp() {
        testWishlist = new Wishlist();
        testWishlist.setId(1L);
        testWishlist.setAccountId(4L);
        testWishlist.setProductId(5L);
    }

    @Test
    @DisplayName("getAllWishlists - Should return all wishlists")
    void testGetAllWishlists() {
        // ARRANGE
        Wishlist wishlist2 = new Wishlist();
        wishlist2.setId(2L);
        wishlist2.setAccountId(4L);
        wishlist2.setProductId(6L);

        List<Wishlist> wishlists = Arrays.asList(testWishlist, wishlist2);
        when(wishlistRepository.findAll()).thenReturn(wishlists);

        // ACT
        List<Wishlist> result = wishlistService.getAllWishlists();

        // ASSERT
        assertThat(result).hasSize(2);
        assertThat(result.get(0).getAccountId()).isEqualTo(4L);
        assertThat(result.get(1).getProductId()).isEqualTo(6L);
        verify(wishlistRepository).findAll();
    }

    @Test
    @DisplayName("getWishlistById - Should return wishlist when found")
    void testGetWishlistById() {
        // ARRANGE
        when(wishlistRepository.findById(1L)).thenReturn(Optional.of(testWishlist));

        // ACT
        Optional<Wishlist> result = wishlistService.getWishlistById(1L);

        // ASSERT
        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(1L);
        assertThat(result.get().getAccountId()).isEqualTo(4L);
        verify(wishlistRepository).findById(1L);
    }

    @Test
    @DisplayName("getWishlistById - Should return empty when not found")
    void testGetWishlistByIdNotFound() {
        // ARRANGE
        when(wishlistRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT
        Optional<Wishlist> result = wishlistService.getWishlistById(99L);

        // ASSERT
        assertThat(result).isEmpty();
        verify(wishlistRepository).findById(99L);
    }

    @Test
    @DisplayName("getWishlistsByAccountId - Should return wishlists for account")
    void testGetWishlistsByAccountId() {
        // ARRANGE
        List<Wishlist> wishlists = Arrays.asList(testWishlist);
        when(wishlistRepository.findByAccountId(4L)).thenReturn(wishlists);

        // ACT
        List<Wishlist> result = wishlistService.getWishlistsByAccountId(4L);

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAccountId()).isEqualTo(4L);
        verify(wishlistRepository).findByAccountId(4L);
    }

    @Test
    @DisplayName("getWishlistsByProductId - Should return wishlists for product")
    void testGetWishlistsByProductId() {
        // ARRANGE
        List<Wishlist> wishlists = Arrays.asList(testWishlist);
        when(wishlistRepository.findByProductId(5L)).thenReturn(wishlists);

        // ACT
        List<Wishlist> result = wishlistService.getWishlistsByProductId(5L);

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getProductId()).isEqualTo(5L);
        verify(wishlistRepository).findByProductId(5L);
    }

    @Test
    @DisplayName("createWishlist - Should create new wishlist")
    void testCreateWishlist() {
        // ARRANGE
        Wishlist newWishlist = new Wishlist();
        newWishlist.setAccountId(5L);
        newWishlist.setProductId(7L);

        Wishlist savedWishlist = new Wishlist();
        savedWishlist.setId(3L);
        savedWishlist.setAccountId(5L);
        savedWishlist.setProductId(7L);

        when(wishlistRepository.save(any(Wishlist.class))).thenReturn(savedWishlist);

        // ACT
        Wishlist result = wishlistService.createWishlist(newWishlist);

        // ASSERT
        assertThat(result.getId()).isEqualTo(3L);
        assertThat(result.getAccountId()).isEqualTo(5L);
        assertThat(result.getProductId()).isEqualTo(7L);
        verify(wishlistRepository).save(newWishlist);
    }

    @Test
    @DisplayName("updateWishlist - Should update existing wishlist")
    void testUpdateWishlist() {
        // ARRANGE
        Wishlist updateDetails = new Wishlist();
        updateDetails.setAccountId(6L);
        updateDetails.setProductId(8L);

        when(wishlistRepository.findById(1L)).thenReturn(Optional.of(testWishlist));
        when(wishlistRepository.save(any(Wishlist.class))).thenReturn(testWishlist);

        // ACT
        Wishlist result = wishlistService.updateWishlist(1L, updateDetails);

        // ASSERT
        assertThat(result.getAccountId()).isEqualTo(6L);
        assertThat(result.getProductId()).isEqualTo(8L);
        verify(wishlistRepository).findById(1L);
        verify(wishlistRepository).save(testWishlist);
    }

    @Test
    @DisplayName("updateWishlist - Should update only accountId when productId is null")
    void testUpdateWishlistOnlyAccountId() {
        // ARRANGE
        Wishlist updateDetails = new Wishlist();
        updateDetails.setAccountId(7L);
        updateDetails.setProductId(null);

        when(wishlistRepository.findById(1L)).thenReturn(Optional.of(testWishlist));
        when(wishlistRepository.save(any(Wishlist.class))).thenReturn(testWishlist);

        // ACT
        Wishlist result = wishlistService.updateWishlist(1L, updateDetails);

        // ASSERT
        assertThat(result.getAccountId()).isEqualTo(7L);
        assertThat(result.getProductId()).isEqualTo(5L); // Original value
        verify(wishlistRepository).save(testWishlist);
    }

    @Test
    @DisplayName("updateWishlist - Should throw exception when wishlist not found")
    void testUpdateWishlistNotFound() {
        // ARRANGE
        Wishlist updateDetails = new Wishlist();
        updateDetails.setAccountId(6L);

        when(wishlistRepository.findById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        assertThatThrownBy(() -> wishlistService.updateWishlist(99L, updateDetails))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Wishlist not found with id: 99");
        verify(wishlistRepository).findById(99L);
        verify(wishlistRepository, never()).save(any());
    }

    @Test
    @DisplayName("deleteWishlist - Should delete existing wishlist")
    void testDeleteWishlist() {
        // ARRANGE
        when(wishlistRepository.existsById(1L)).thenReturn(true);
        doNothing().when(wishlistRepository).deleteById(1L);

        // ACT
        wishlistService.deleteWishlist(1L);

        // ASSERT
        verify(wishlistRepository).existsById(1L);
        verify(wishlistRepository).deleteById(1L);
    }

    @Test
    @DisplayName("deleteWishlist - Should throw exception when wishlist not found")
    void testDeleteWishlistNotFound() {
        // ARRANGE
        when(wishlistRepository.existsById(99L)).thenReturn(false);

        // ACT & ASSERT
        assertThatThrownBy(() -> wishlistService.deleteWishlist(99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Wishlist not found with id: 99");
        verify(wishlistRepository).existsById(99L);
        verify(wishlistRepository, never()).deleteById(any());
    }
}
