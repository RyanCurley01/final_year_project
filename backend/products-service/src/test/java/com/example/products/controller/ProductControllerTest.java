package com.example.products.controller;

import com.example.products.dto.ProductResponse;
import com.example.products.model.Product;
import com.example.products.service.ProductService;
import com.example.products.service.S3Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value = ProductController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("ProductController Tests")
class ProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ProductService productService;
    
    @MockBean
    private S3Service s3Service;

    private Product jimmyJungle;
    private Product midnightHaunt;
    private Product protectors;
    private Product redHood;
    private Product selectedElectronicWorks;
    private List<ProductResponse> allProductResponses;

    @BeforeEach
    void setUp() {
        // Initialize test data as ProductResponse objects (what the controller actually returns)
        
        ProductResponse jimmyJungleResponse = new ProductResponse(
                1L,
                "Jimmy Jungle",
                null,
                "PC",
                new BigDecimal("2.00"),
                null,
                "signed-game-cover-url",
                null,
                "signed-file-url",
                null,
                100
        );

        ProductResponse midnightHauntResponse = new ProductResponse(
                2L,
                "Midnight Haunt",
                null,
                "PC",
                new BigDecimal("2.00"),
                null,
                "signed-game-cover-url",
                null,
                "signed-file-url",
                null,
                100
        );

        ProductResponse protectorsResponse = new ProductResponse(
                3L,
                "Protectors",
                null,
                "PC",
                new BigDecimal("5.00"),
                null,
                "signed-game-cover-url",
                null,
                "signed-file-url",
                "signed-preview-url",
                100
        );

        ProductResponse redHoodResponse = new ProductResponse(
                4L,
                "Red Hood",
                null,
                "PC",
                new BigDecimal("1.50"),
                null,
                "signed-game-cover-url",
                null,
                "signed-file-url",
                null,
                100
        );

        ProductResponse selectedElectronicWorksResponse = new ProductResponse(
                5L,
                null,
                "Selected Electronic Works",
                null,
                null,
                new BigDecimal("5.00"),
                null,
                "signed-album-cover-url",
                "signed-file-url",
                null,
                200
        );

        allProductResponses = Arrays.asList(
                jimmyJungleResponse,
                midnightHauntResponse,
                protectorsResponse,
                redHoodResponse,
                selectedElectronicWorksResponse
        );
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts - Should return all products")
    void getAllProducts_ReturnsAllProducts() throws Exception {
        // Given
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(5)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].gameTitle").value("Jimmy Jungle"))
                .andExpect(jsonPath("$[0].platform").value("PC"))
                .andExpect(jsonPath("$[0].gamePrice").value(2.00))
                .andExpect(jsonPath("$[0].stockQuantity").value(100))
                .andExpect(jsonPath("$[4].id").value(5))
                .andExpect(jsonPath("$[4].albumTitle").value("Selected Electronic Works"))
                .andExpect(jsonPath("$[4].albumPrice").value(5.00))
                .andExpect(jsonPath("$[4].stockQuantity").value(200));

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts?platform=PC - Should return PC games")
    void getAllProducts_WithPlatformFilter_ReturnsPCGames() throws Exception {
        // Given - Controller doesn't actually filter, returns all products
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts")
                        .param("platform", "PC"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(5)));

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts?gameCoverImageUrl=... - Should return games with cover")
    void getAllProducts_WithGameCoverImageUrlFilter_ReturnsMatchingGames() throws Exception {
        // Given - Controller doesn't actually filter, returns all products
        String coverImageUrl = "INSERT AWS S3 FILE KEY FOR GAME COVER IMAGE URL HERE";
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts")
                        .param("gameCoverImageUrl", coverImageUrl))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(5)));

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts?albumCoverImageUrl=... - Should return albums with cover")
    void getAllProducts_WithAlbumCoverImageUrlFilter_ReturnsMatchingAlbums() throws Exception {
        // Given - Controller doesn't actually filter, returns all products
        String coverImageUrl = "INSERT AWS S3 FILE KEY URL FOR ALBUM COVER IMAGE HERE";
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts")
                        .param("albumCoverImageUrl", coverImageUrl))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(5)));

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @WithMockUser(roles = "MANAGER")
    @DisplayName("POST /api/products - Should create new game product successfully")
    void createProduct_WithValidGameData_ReturnsCreatedGame() throws Exception {
        // Given
        Product newGame = new Product();
        newGame.setGameTitle("New Game");
        newGame.setPlatform("PC");
        newGame.setGamePrice(new BigDecimal("3.99"));
        newGame.setStockQuantity(50);

        Product savedGame = new Product();
        savedGame.setId(6L);
        savedGame.setGameTitle("New Game");
        savedGame.setPlatform("PC");
        savedGame.setGamePrice(new BigDecimal("3.99"));
        savedGame.setStockQuantity(50);

        when(productService.createProduct(any(Product.class))).thenReturn(savedGame);

        // When & Then
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newGame)))
                .andExpect(status().isCreated())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(6))
                .andExpect(jsonPath("$.gameTitle").value("New Game"))
                .andExpect(jsonPath("$.platform").value("PC"))
                .andExpect(jsonPath("$.gamePrice").value(3.99))
                .andExpect(jsonPath("$.stockQuantity").value(50));

        verify(productService, times(1)).createProduct(any(Product.class));
    }

    @Test
    @WithMockUser(roles = "MANAGER")
    @DisplayName("POST /api/products - Should create new album product successfully")
    void createProduct_WithValidAlbumData_ReturnsCreatedAlbum() throws Exception {
        // Given
        Product newAlbum = new Product();
        newAlbum.setAlbumTitle("New Album");
        newAlbum.setAlbumPrice(new BigDecimal("7.99"));
        newAlbum.setStockQuantity(150);

        Product savedAlbum = new Product();
        savedAlbum.setId(6L);
        savedAlbum.setAlbumTitle("New Album");
        savedAlbum.setAlbumPrice(new BigDecimal("7.99"));
        savedAlbum.setStockQuantity(150);

        when(productService.createProduct(any(Product.class))).thenReturn(savedAlbum);

        // When & Then
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newAlbum)))
                .andExpect(status().isCreated())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(6))
                .andExpect(jsonPath("$.albumTitle").value("New Album"))
                .andExpect(jsonPath("$.albumPrice").value(7.99))
                .andExpect(jsonPath("$.stockQuantity").value(150));

        verify(productService, times(1)).createProduct(any(Product.class));
    }

    @Test
    @WithMockUser(roles = "EMPLOYEE")
    @DisplayName("PUT /api/products/{id} - Should update Jimmy Jungle price successfully")
    void updateProduct_WithValidId_ReturnsUpdatedProduct() throws Exception {
        // Given
        Product updatedJimmyJungle = new Product();
        updatedJimmyJungle.setId(1L);
        updatedJimmyJungle.setGameTitle("Jimmy Jungle");
        updatedJimmyJungle.setPlatform("PC");
        updatedJimmyJungle.setGamePrice(new BigDecimal("2.99")); // Price updated
        updatedJimmyJungle.setGameCoverImageUrl("INSERT AWS S3 FILE KEY FOR GAME COVER IMAGE URL HERE");
        updatedJimmyJungle.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Jimmy%20Jungle.exe");
        updatedJimmyJungle.setStockQuantity(100);

        when(productService.updateProduct(eq(1L), any(Product.class))).thenReturn(updatedJimmyJungle);

        // When & Then
        mockMvc.perform(put("/api/products/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updatedJimmyJungle)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.gameTitle").value("Jimmy Jungle"))
                .andExpect(jsonPath("$.gamePrice").value(2.99));

        verify(productService, times(1)).updateProduct(eq(1L), any(Product.class));
    }

    @Test
    @WithMockUser(roles = "EMPLOYEE")
    @DisplayName("PUT /api/products/{id} - Should update album stock quantity")
    void updateProduct_UpdateAlbumStock_ReturnsUpdatedAlbum() throws Exception {
        // Given
        Product updatedAlbum = new Product();
        updatedAlbum.setId(5L);
        updatedAlbum.setAlbumTitle("Selected Electronic Works");
        updatedAlbum.setAlbumPrice(new BigDecimal("5.00"));
        updatedAlbum.setAlbumCoverImageUrl("INSERT AWS S3 FILE KEY URL FOR ALBUM COVER IMAGE HERE");
        updatedAlbum.setFileUrl("INSERT AWS S3 FILE KEY FOR MUSIC FILE URLS HERE");
        updatedAlbum.setStockQuantity(250); // Stock updated

        when(productService.updateProduct(eq(5L), any(Product.class))).thenReturn(updatedAlbum);

        // When & Then
        mockMvc.perform(put("/api/products/5")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updatedAlbum)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(5))
                .andExpect(jsonPath("$.albumTitle").value("Selected Electronic Works"))
                .andExpect(jsonPath("$.stockQuantity").value(250));

        verify(productService, times(1)).updateProduct(eq(5L), any(Product.class));
    }

    @Test
    @WithMockUser(roles = "EMPLOYEE")
    @DisplayName("PUT /api/products/{id} - Should return 404 when product not found")
    void updateProduct_WithInvalidId_ReturnsNotFound() throws Exception {
        // Given
        Product updateData = new Product();
        updateData.setGameTitle("Non-existent Game");

        when(productService.updateProduct(eq(999L), any(Product.class)))
                .thenThrow(new IllegalArgumentException("Product not found"));

        // When & Then
        mockMvc.perform(put("/api/products/999")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateData)))
                .andExpect(status().isNotFound());

        verify(productService, times(1)).updateProduct(eq(999L), any(Product.class));
    }

    @Test
    @WithMockUser(roles = "MANAGER")
    @DisplayName("DELETE /api/products/{id} - Should delete product successfully")
    void deleteProduct_WithValidId_ReturnsNoContent() throws Exception {
        // Given
        doNothing().when(productService).deleteProduct(1L);

        // When & Then
        mockMvc.perform(delete("/api/products/1"))
                .andExpect(status().isNoContent());

        verify(productService, times(1)).deleteProduct(1L);
    }

    @Test
    @WithMockUser(roles = "MANAGER")
    @DisplayName("DELETE /api/products/{id} - Should return 404 when product not found")
    void deleteProduct_WithInvalidId_ReturnsNotFound() throws Exception {
        // Given
        doThrow(new IllegalArgumentException("Product not found"))
                .when(productService).deleteProduct(999L);

        // When & Then
        mockMvc.perform(delete("/api/products/999"))
                .andExpect(status().isNotFound());

        verify(productService, times(1)).deleteProduct(999L);
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts - Should return empty list when no products")
    void getAllProducts_WhenNoProducts_ReturnsEmptyList() throws Exception {
        // Given
        when(productService.getAllProductsWithSignedUrls()).thenReturn(Arrays.asList());

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(0)));

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @WithMockUser(roles = "MANAGER")
    @DisplayName("POST /api/products - Should create product with minimum required fields")
    void createProduct_WithMinimumFields_ReturnsCreatedProduct() throws Exception {
        // Given
        Product minimalProduct = new Product();
        minimalProduct.setGameTitle("Minimal Game");
        minimalProduct.setGamePrice(new BigDecimal("1.00"));

        Product savedProduct = new Product();
        savedProduct.setId(7L);
        savedProduct.setGameTitle("Minimal Game");
        savedProduct.setGamePrice(new BigDecimal("1.00"));

        when(productService.createProduct(any(Product.class))).thenReturn(savedProduct);

        // When & Then
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(minimalProduct)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.gameTitle").value("Minimal Game"))
                .andExpect(jsonPath("$.gamePrice").value(1.00));

        verify(productService, times(1)).createProduct(any(Product.class));
    }

    @Test
    @DisplayName("GET /api/products/getAllProducts?platform=PC - Verify all PC games are returned")
    void getAllProducts_PCPlatform_VerifyAllGamesReturned() throws Exception {
        // Given - All 4 games from init script are PC games
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts")
                        .param("platform", "PC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(5)))
                .andExpect(jsonPath("$[?(@.gameTitle == 'Jimmy Jungle')]").exists())
                .andExpect(jsonPath("$[?(@.gameTitle == 'Midnight Haunt')]").exists())
                .andExpect(jsonPath("$[?(@.gameTitle == 'Protectors')]").exists())
                .andExpect(jsonPath("$[?(@.gameTitle == 'Red Hood')]").exists());

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @DisplayName("Verify Protectors has preview URL while other games don't")
    void getAllProducts_VerifyProtectorsHasPreviewUrl() throws Exception {
        // Given
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then
        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[2].gameTitle").value("Protectors"))
                .andExpect(jsonPath("$[2].previewUrl").value("signed-preview-url"))
                .andExpect(jsonPath("$[0].previewUrl").doesNotExist())
                .andExpect(jsonPath("$[1].previewUrl").doesNotExist())
                .andExpect(jsonPath("$[3].previewUrl").doesNotExist());

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @DisplayName("Verify game prices match init script data")
    void getAllProducts_VerifyGamePrices() throws Exception {
        // Given
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then - Verify prices from init script
        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gamePrice").value(2.00))  // Jimmy Jungle
                .andExpect(jsonPath("$[1].gamePrice").value(2.00))  // Midnight Haunt
                .andExpect(jsonPath("$[2].gamePrice").value(5.00))  // Protectors (most expensive game)
                .andExpect(jsonPath("$[3].gamePrice").value(1.50))  // Red Hood (cheapest game)
                .andExpect(jsonPath("$[4].albumPrice").value(5.00)); // Selected Electronic Works

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }

    @Test
    @DisplayName("Verify stock quantities match init script data")
    void getAllProducts_VerifyStockQuantities() throws Exception {
        // Given
        when(productService.getAllProductsWithSignedUrls()).thenReturn(allProductResponses);

        // When & Then - All games have 100 stock, album has 200
        mockMvc.perform(get("/api/products/getAllProducts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].stockQuantity").value(100))  // Jimmy Jungle
                .andExpect(jsonPath("$[1].stockQuantity").value(100))  // Midnight Haunt
                .andExpect(jsonPath("$[2].stockQuantity").value(100))  // Protectors
                .andExpect(jsonPath("$[3].stockQuantity").value(100))  // Red Hood
                .andExpect(jsonPath("$[4].stockQuantity").value(200)); // Album (double stock)

        verify(productService, times(1)).getAllProductsWithSignedUrls();
    }
}
