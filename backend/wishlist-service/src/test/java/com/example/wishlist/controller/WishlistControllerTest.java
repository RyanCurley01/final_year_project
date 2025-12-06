package com.example.wishlist.controller;

import com.example.wishlist.model.Wishlist;
import com.example.wishlist.service.WishlistService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WishlistController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Wishlist Controller Integration Tests")
class WishlistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WishlistService wishlistService;

    @Autowired
    private ObjectMapper objectMapper;

    private Wishlist testWishlist;

    @BeforeEach
    void setUp() {
        testWishlist = new Wishlist();
        testWishlist.setId(1L);
        testWishlist.setAccountId(4L);
        testWishlist.setProductId(5L);
    }

    @Test
    @DisplayName("GET /api/wishlist/getAllWishlists - Should return all wishlists")
    void testGetAllWishlists() throws Exception {
        // ARRANGE
        Wishlist wishlist2 = new Wishlist();
        wishlist2.setId(2L);
        wishlist2.setAccountId(4L);
        wishlist2.setProductId(6L);

        List<Wishlist> wishlists = Arrays.asList(testWishlist, wishlist2);
        when(wishlistService.getAllWishlists()).thenReturn(wishlists);

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist/getAllWishlists")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].accountId", is(4)))
                .andExpect(jsonPath("$[0].productId", is(5)))
                .andExpect(jsonPath("$[1].productId", is(6)));
    }

    @Test
    @DisplayName("GET /api/wishlist/getAllWishlists - Should filter by accountId")
    void testGetAllWishlistsByAccountId() throws Exception {
        // ARRANGE
        List<Wishlist> wishlists = Arrays.asList(testWishlist);
        when(wishlistService.getWishlistsByAccountId(4L)).thenReturn(wishlists);

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist/getAllWishlists")
                .param("accountId", "4")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/wishlist/getAllWishlists - Should filter by productId")
    void testGetAllWishlistsByProductId() throws Exception {
        // ARRANGE
        List<Wishlist> wishlists = Arrays.asList(testWishlist);
        when(wishlistService.getWishlistsByProductId(5L)).thenReturn(wishlists);

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist/getAllWishlists")
                .param("productId", "5")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/wishlist/{id} - Should return wishlist by id")
    void testGetWishlistById() throws Exception {
        // ARRANGE
        when(wishlistService.getWishlistById(1L)).thenReturn(Optional.of(testWishlist));

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist/1")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(1)))
                .andExpect(jsonPath("$.accountId", is(4)))
                .andExpect(jsonPath("$.productId", is(5)));
    }

    @Test
    @DisplayName("GET /api/wishlist/{id} - Should return 404 when wishlist not found")
    void testGetWishlistByIdNotFound() throws Exception {
        // ARRANGE
        when(wishlistService.getWishlistById(99L)).thenReturn(Optional.empty());

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist/99")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }
}
