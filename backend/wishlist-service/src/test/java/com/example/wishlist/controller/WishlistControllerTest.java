package com.example.wishlist.controller;

import com.example.wishlist.config.FirebaseTokenFilter;
import com.example.wishlist.model.Wishlist;
import com.example.wishlist.service.CustomUserDetailsService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
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

    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    @MockitoBean
    private FirebaseTokenFilter firebaseTokenFilter;

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
    @DisplayName("GET /api/wishlist - Should return all wishlists")
    void testGetAllWishlists() throws Exception {
        // ARRANGE
        Wishlist wishlist2 = new Wishlist();
        wishlist2.setId(2L);
        wishlist2.setAccountId(4L);
        wishlist2.setProductId(6L);

        List<Wishlist> wishlists = Arrays.asList(testWishlist, wishlist2);
        when(wishlistService.getAllWishlists()).thenReturn(wishlists);

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].accountId", is(4)))
                .andExpect(jsonPath("$[0].productId", is(5)))
                .andExpect(jsonPath("$[1].productId", is(6)));
    }

    @Test
    @DisplayName("GET /api/wishlist - Should filter by accountId")
    void testGetAllWishlistsByAccountId() throws Exception {
        // ARRANGE
        List<Wishlist> wishlists = Arrays.asList(testWishlist);
        when(wishlistService.getWishlistsByAccountId(4L)).thenReturn(wishlists);

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist")
                .param("accountId", "4")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].accountId", is(4)));
    }

    @Test
    @DisplayName("GET /api/wishlist - Should filter by productId")
    void testGetAllWishlistsByProductId() throws Exception {
        // ARRANGE
        List<Wishlist> wishlists = Arrays.asList(testWishlist);
        when(wishlistService.getWishlistsByProductId(5L)).thenReturn(wishlists);

        // ACT & ASSERT
        mockMvc.perform(get("/api/wishlist")
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

    @Test
    @DisplayName("POST /api/wishlist - Should create wishlist item")
    void testCreateWishlist() throws Exception {
        Wishlist newWishlist = new Wishlist();
        newWishlist.setId(2L);
        newWishlist.setAccountId(10L);
        newWishlist.setProductId(20L);

        when(wishlistService.createWishlist(any(Wishlist.class))).thenReturn(newWishlist);

        mockMvc.perform(post("/api/wishlist")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newWishlist)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(2)))
                .andExpect(jsonPath("$.accountId", is(10)))
                .andExpect(jsonPath("$.productId", is(20)));
    }

    @Test
    @DisplayName("PUT /api/wishlist/{id} - Should update wishlist item")
    void testUpdateWishlist() throws Exception {
        Wishlist updated = new Wishlist();
        updated.setId(1L);
        updated.setAccountId(4L);
        updated.setProductId(99L);

        when(wishlistService.updateWishlist(any(Long.class), any(Wishlist.class))).thenReturn(updated);

        mockMvc.perform(put("/api/wishlist/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updated)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.productId", is(99)));
    }

    @Test
    @DisplayName("PUT /api/wishlist/{id} - Should return 404 when not found")
    void testUpdateWishlistNotFound() throws Exception {
        when(wishlistService.updateWishlist(any(Long.class), any(Wishlist.class)))
                .thenThrow(new IllegalArgumentException("Not found"));

        mockMvc.perform(put("/api/wishlist/99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testWishlist)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("DELETE /api/wishlist/{id} - Should delete wishlist item")
    void testDeleteWishlist() throws Exception {
        doNothing().when(wishlistService).deleteWishlist(1L);

        mockMvc.perform(delete("/api/wishlist/1"))
                .andExpect(status().isNoContent());

        verify(wishlistService).deleteWishlist(1L);
    }

    @Test
    @DisplayName("DELETE /api/wishlist/{id} - Should return 404 when not found")
    void testDeleteWishlistNotFound() throws Exception {
        doThrow(new IllegalArgumentException("Not found"))
                .when(wishlistService).deleteWishlist(99L);

        mockMvc.perform(delete("/api/wishlist/99"))
                .andExpect(status().isNotFound());
    }
}
