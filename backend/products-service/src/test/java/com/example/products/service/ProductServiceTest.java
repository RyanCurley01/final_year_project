package com.example.products.service;

import com.example.products.model.Product;
import com.example.products.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Product Service Unit Tests - Based on Database Schema")
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private ProductService productService;

    // Products from init-database.sh
    private Product jimmyJungle;
    private Product midnightHaunt;
    private Product protectors;
    private Product redHood;
    private Product selectedElectronicWorks;

    @BeforeEach
    void setUp() {
        // Product 1: Jimmy Jungle (Game)
        jimmyJungle = new Product();
        jimmyJungle.setId(1L);
        jimmyJungle.setGameTitle("Jimmy Jungle");
        jimmyJungle.setPlatform("PC");
        jimmyJungle.setGamePrice(new BigDecimal("2.00"));
        jimmyJungle.setGameCoverImageUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Jimmy Jungle Cover Image.png");
        jimmyJungle.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Jimmy%20Jungle.exe");
        jimmyJungle.setStockQuantity(100);

        // Product 2: Midnight Haunt (Game)
        midnightHaunt = new Product();
        midnightHaunt.setId(2L);
        midnightHaunt.setGameTitle("Midnight Haunt");
        midnightHaunt.setPlatform("PC");
        midnightHaunt.setGamePrice(new BigDecimal("2.00"));
        midnightHaunt.setGameCoverImageUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Midnight Haunt Cover Image.png");
        midnightHaunt.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Midnight%20Haunt.exe");
        midnightHaunt.setStockQuantity(100);

        // Product 3: Protectors (Game with preview)
        protectors = new Product();
        protectors.setId(3L);
        protectors.setGameTitle("Protectors");
        protectors.setPlatform("PC");
        protectors.setGamePrice(new BigDecimal("5.00"));
        protectors.setGameCoverImageUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Protectors Cover Image.png");
        protectors.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Protectors.exe");
        protectors.setPreviewUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors video game trailer.mp4");
        protectors.setStockQuantity(100);

        // Product 4: Red Hood (Game)
        redHood = new Product();
        redHood.setId(4L);
        redHood.setGameTitle("Red Hood");
        redHood.setPlatform("PC");
        redHood.setGamePrice(new BigDecimal("1.50"));
        redHood.setGameCoverImageUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Red Hood Cover Image.png");
        redHood.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Platform%20Game.exe");
        redHood.setStockQuantity(100);

        // Product 5: Selected Electronic Works (Music Album)
        selectedElectronicWorks = new Product();
        selectedElectronicWorks.setId(5L);
        selectedElectronicWorks.setAlbumTitle("Selected Electronic Works");
        selectedElectronicWorks.setAlbumPrice(new BigDecimal("5.00"));
        selectedElectronicWorks.setAlbumCoverImageUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp");
        selectedElectronicWorks.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Song_WAV_Files_For_Final_Year_Project.zip");
        selectedElectronicWorks.setStockQuantity(200);
    }

    // ============================================
    // getAllProducts Tests
    // ============================================

    @Test
    @DisplayName("getAllProducts - Should return all 5 products from database")
    void testGetAllProducts_AllFiveProducts() {
        // ARRANGE
        List<Product> allProducts = Arrays.asList(
            jimmyJungle, midnightHaunt, protectors, redHood, selectedElectronicWorks
        );
        when(productRepository.findAll()).thenReturn(allProducts);

        // ACT
        List<Product> result = productService.getAllProducts();

        // ASSERT
        assertThat(result).hasSize(5);
        assertThat(result).containsExactly(jimmyJungle, midnightHaunt, protectors, redHood, selectedElectronicWorks);
        
        // Verify games
        assertThat(result.stream().filter(p -> p.getGameTitle() != null).count()).isEqualTo(4);
        // Verify albums
        assertThat(result.stream().filter(p -> p.getAlbumTitle() != null).count()).isEqualTo(1);
        
        verify(productRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("getAllProducts - Should return empty list when no products exist")
    void testGetAllProducts_EmptyDatabase() {
        // ARRANGE
        when(productRepository.findAll()).thenReturn(Collections.emptyList());

        // ACT
        List<Product> result = productService.getAllProducts();

        // ASSERT
        assertThat(result).isEmpty();
        verify(productRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("getAllProducts - Should return only games")
    void testGetAllProducts_OnlyGames() {
        // ARRANGE
        List<Product> games = Arrays.asList(jimmyJungle, midnightHaunt, protectors, redHood);
        when(productRepository.findAll()).thenReturn(games);

        // ACT
        List<Product> result = productService.getAllProducts();

        // ASSERT
        assertThat(result).hasSize(4);
        assertThat(result).allMatch(p -> p.getGameTitle() != null);
        assertThat(result).allMatch(p -> p.getPlatform().equals("PC"));
    }

    // ============================================
    // getProductsByGameCoverImageUrl Tests
    // ============================================

    @Test
    @DisplayName("getProductsByGameCoverImageUrl - Should find Jimmy Jungle by cover URL")
    void testGetProductsByGameCoverImageUrl_JimmyJungle() {
        // ARRANGE
        String imageUrl = "https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Jimmy Jungle Cover Image.png";
        when(productRepository.findByGameCoverImageUrl(imageUrl)).thenReturn(Collections.singletonList(jimmyJungle));

        // ACT
        List<Product> result = productService.getProductsByGameCoverImageUrl(imageUrl);

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getGameTitle()).isEqualTo("Jimmy Jungle");
        assertThat(result.get(0).getGamePrice()).isEqualByComparingTo(new BigDecimal("2.00"));
        verify(productRepository, times(1)).findByGameCoverImageUrl(imageUrl);
    }

    @Test
    @DisplayName("getProductsByGameCoverImageUrl - Should find Protectors by cover URL")
    void testGetProductsByGameCoverImageUrl_Protectors() {
        // ARRANGE
        String imageUrl = "https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game Cover Images/Protectors Cover Image.png";
        when(productRepository.findByGameCoverImageUrl(imageUrl)).thenReturn(Collections.singletonList(protectors));

        // ACT
        List<Product> result = productService.getProductsByGameCoverImageUrl(imageUrl);

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getGameTitle()).isEqualTo("Protectors");
        assertThat(result.get(0).getPreviewUrl()).isNotNull();
        assertThat(result.get(0).getPreviewUrl()).contains("Protectors video game trailer.mp4");
    }

    @Test
    @DisplayName("getProductsByGameCoverImageUrl - Should return empty for non-existent URL")
    void testGetProductsByGameCoverImageUrl_NotFound() {
        // ARRANGE
        String imageUrl = "https://non-existent-url.com/image.png";
        when(productRepository.findByGameCoverImageUrl(imageUrl)).thenReturn(Collections.emptyList());

        // ACT
        List<Product> result = productService.getProductsByGameCoverImageUrl(imageUrl);

        // ASSERT
        assertThat(result).isEmpty();
        verify(productRepository, times(1)).findByGameCoverImageUrl(imageUrl);
    }

    // ============================================
    // getProductsByAlbumCoverImageUrl Tests
    // ============================================

    @Test
    @DisplayName("getProductsByAlbumCoverImageUrl - Should find Selected Electronic Works")
    void testGetProductsByAlbumCoverImageUrl_SelectedElectronicWorks() {
        // ARRANGE
        String imageUrl = "https://game-and-music-files.s3.eu-west-1.amazonaws.com/Music Cover Image and cloud movement script/z4AnyQN.webp";
        when(productRepository.findByAlbumCoverImageUrl(imageUrl)).thenReturn(Collections.singletonList(selectedElectronicWorks));

        // ACT
        List<Product> result = productService.getProductsByAlbumCoverImageUrl(imageUrl);

        // ASSERT
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAlbumTitle()).isEqualTo("Selected Electronic Works");
        assertThat(result.get(0).getAlbumPrice()).isEqualByComparingTo(new BigDecimal("5.00"));
        assertThat(result.get(0).getStockQuantity()).isEqualTo(200);
        assertThat(result.get(0).getGameTitle()).isNull();
        verify(productRepository, times(1)).findByAlbumCoverImageUrl(imageUrl);
    }

    @Test
    @DisplayName("getProductsByAlbumCoverImageUrl - Should return empty for non-existent URL")
    void testGetProductsByAlbumCoverImageUrl_NotFound() {
        // ARRANGE
        String imageUrl = "https://non-existent-album.com/cover.png";
        when(productRepository.findByAlbumCoverImageUrl(imageUrl)).thenReturn(Collections.emptyList());

        // ACT
        List<Product> result = productService.getProductsByAlbumCoverImageUrl(imageUrl);

        // ASSERT
        assertThat(result).isEmpty();
        verify(productRepository, times(1)).findByAlbumCoverImageUrl(imageUrl);
    }

    // ============================================
    // getProductsByPlatform Tests
    // ============================================

    @Test
    @DisplayName("getProductsByPlatform - Should find all PC games")
    void testGetProductsByPlatform_PC() {
        // ARRANGE
        List<Product> pcGames = Arrays.asList(jimmyJungle, midnightHaunt, protectors, redHood);
        when(productRepository.findByPlatform("PC")).thenReturn(pcGames);

        // ACT
        List<Product> result = productService.getProductsByPlatform("PC");

        // ASSERT
        assertThat(result).hasSize(4);
        assertThat(result).allMatch(p -> p.getPlatform().equals("PC"));
        assertThat(result).extracting(Product::getGameTitle)
            .containsExactlyInAnyOrder("Jimmy Jungle", "Midnight Haunt", "Protectors", "Red Hood");
        verify(productRepository, times(1)).findByPlatform("PC");
    }

    @Test
    @DisplayName("getProductsByPlatform - Should return empty for non-existent platform")
    void testGetProductsByPlatform_NotFound() {
        // ARRANGE
        when(productRepository.findByPlatform("Xbox")).thenReturn(Collections.emptyList());

        // ACT
        List<Product> result = productService.getProductsByPlatform("Xbox");

        // ASSERT
        assertThat(result).isEmpty();
        verify(productRepository, times(1)).findByPlatform("Xbox");
    }

    // ============================================
    // createProduct Tests
    // ============================================

    @Test
    @DisplayName("createProduct - Should create new game product")
    void testCreateProduct_NewGame() {
        // ARRANGE
        Product newGame = new Product();
        newGame.setGameTitle("New Adventure Game");
        newGame.setPlatform("PC");
        newGame.setGamePrice(new BigDecimal("15.99"));
        newGame.setStockQuantity(50);

        Product savedGame = new Product();
        savedGame.setId(6L);
        savedGame.setGameTitle("New Adventure Game");
        savedGame.setPlatform("PC");
        savedGame.setGamePrice(new BigDecimal("15.99"));
        savedGame.setStockQuantity(50);

        when(productRepository.save(any(Product.class))).thenReturn(savedGame);

        // ACT
        Product result = productService.createProduct(newGame);

        // ASSERT
        assertThat(result.getId()).isEqualTo(6L);
        assertThat(result.getGameTitle()).isEqualTo("New Adventure Game");
        assertThat(result.getGamePrice()).isEqualByComparingTo(new BigDecimal("15.99"));
        verify(productRepository, times(1)).save(newGame);
    }

    @Test
    @DisplayName("createProduct - Should create new album product")
    void testCreateProduct_NewAlbum() {
        // ARRANGE
        Product newAlbum = new Product();
        newAlbum.setAlbumTitle("Classical Masterpieces");
        newAlbum.setAlbumPrice(new BigDecimal("12.99"));
        newAlbum.setAlbumCoverImageUrl("https://example.com/classical-cover.png");
        newAlbum.setStockQuantity(150);

        Product savedAlbum = new Product();
        savedAlbum.setId(7L);
        savedAlbum.setAlbumTitle("Classical Masterpieces");
        savedAlbum.setAlbumPrice(new BigDecimal("12.99"));
        savedAlbum.setAlbumCoverImageUrl("https://example.com/classical-cover.png");
        savedAlbum.setStockQuantity(150);

        when(productRepository.save(any(Product.class))).thenReturn(savedAlbum);

        // ACT
        Product result = productService.createProduct(newAlbum);

        // ASSERT
        assertThat(result.getId()).isEqualTo(7L);
        assertThat(result.getAlbumTitle()).isEqualTo("Classical Masterpieces");
        assertThat(result.getAlbumPrice()).isEqualByComparingTo(new BigDecimal("12.99"));
        assertThat(result.getGameTitle()).isNull();
        verify(productRepository, times(1)).save(newAlbum);
    }

    @Test
    @DisplayName("createProduct - Should create product with all fields populated")
    void testCreateProduct_AllFields() {
        // ARRANGE
        Product fullProduct = new Product();
        fullProduct.setGameTitle("Complete Game");
        fullProduct.setPlatform("PC");
        fullProduct.setGamePrice(new BigDecimal("29.99"));
        fullProduct.setGameCoverImageUrl("https://example.com/cover.png");
        fullProduct.setFileUrl("https://example.com/download.zip");
        fullProduct.setPreviewUrl("https://example.com/trailer.mp4");
        fullProduct.setStockQuantity(75);

        Product savedProduct = new Product();
        savedProduct.setId(8L);
        savedProduct.setGameTitle("Complete Game");
        savedProduct.setPlatform("PC");
        savedProduct.setGamePrice(new BigDecimal("29.99"));
        savedProduct.setGameCoverImageUrl("https://example.com/cover.png");
        savedProduct.setFileUrl("https://example.com/download.zip");
        savedProduct.setPreviewUrl("https://example.com/trailer.mp4");
        savedProduct.setStockQuantity(75);

        when(productRepository.save(any(Product.class))).thenReturn(savedProduct);

        // ACT
        Product result = productService.createProduct(fullProduct);

        // ASSERT
        assertThat(result.getId()).isEqualTo(8L);
        assertThat(result.getPreviewUrl()).isNotNull();
        assertThat(result.getFileUrl()).isNotNull();
        assertThat(result.getGameCoverImageUrl()).isNotNull();
    }

    // ============================================
    // updateProduct Tests
    // ============================================

    @Test
    @DisplayName("updateProduct - Should update Jimmy Jungle price")
    void testUpdateProduct_JimmyJunglePrice() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGamePrice(new BigDecimal("3.99"));

        Product existingProduct = new Product();
        existingProduct.setId(1L);
        existingProduct.setGameTitle("Jimmy Jungle");
        existingProduct.setPlatform("PC");
        existingProduct.setGamePrice(new BigDecimal("2.00"));
        existingProduct.setStockQuantity(100);

        when(productRepository.findById(1L)).thenReturn(java.util.Optional.of(existingProduct));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // ACT
        Product result = productService.updateProduct(1L, updateDetails);

        // ASSERT
        assertThat(result.getGamePrice()).isEqualByComparingTo(new BigDecimal("3.99"));
        assertThat(result.getGameTitle()).isEqualTo("Jimmy Jungle"); // Unchanged
        assertThat(result.getPlatform()).isEqualTo("PC"); // Unchanged
        verify(productRepository, times(1)).findById(1L);
        verify(productRepository, times(1)).save(any(Product.class));
    }

    @Test
    @DisplayName("updateProduct - Should update Protectors with new preview URL")
    void testUpdateProduct_ProtectorsPreview() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setPreviewUrl("https://new-cdn.com/protectors-trailer-hd.mp4");

        Product existingProduct = new Product();
        existingProduct.setId(3L);
        existingProduct.setGameTitle("Protectors");
        existingProduct.setPlatform("PC");
        existingProduct.setGamePrice(new BigDecimal("5.00"));
        existingProduct.setPreviewUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Protectors video game trailer.mp4");
        existingProduct.setStockQuantity(100);

        when(productRepository.findById(3L)).thenReturn(java.util.Optional.of(existingProduct));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // ACT
        Product result = productService.updateProduct(3L, updateDetails);

        // ASSERT
        assertThat(result.getPreviewUrl()).isEqualTo("https://new-cdn.com/protectors-trailer-hd.mp4");
        assertThat(result.getGameTitle()).isEqualTo("Protectors");
        verify(productRepository, times(1)).save(any(Product.class));
    }

    @Test
    @DisplayName("updateProduct - Should update Selected Electronic Works stock")
    void testUpdateProduct_AlbumStock() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setStockQuantity(500);

        Product existingProduct = new Product();
        existingProduct.setId(5L);
        existingProduct.setAlbumTitle("Selected Electronic Works");
        existingProduct.setAlbumPrice(new BigDecimal("5.00"));
        existingProduct.setStockQuantity(200);

        when(productRepository.findById(5L)).thenReturn(java.util.Optional.of(existingProduct));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // ACT
        Product result = productService.updateProduct(5L, updateDetails);

        // ASSERT
        assertThat(result.getStockQuantity()).isEqualTo(500);
        assertThat(result.getAlbumTitle()).isEqualTo("Selected Electronic Works");
        assertThat(result.getAlbumPrice()).isEqualByComparingTo(new BigDecimal("5.00"));
    }

    @Test
    @DisplayName("updateProduct - Should update multiple fields at once")
    void testUpdateProduct_MultipleFields() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGamePrice(new BigDecimal("1.99"));
        updateDetails.setStockQuantity(150);
        updateDetails.setFileUrl("https://new-url.com/red-hood-v2.zip");

        Product existingProduct = new Product();
        existingProduct.setId(4L);
        existingProduct.setGameTitle("Red Hood");
        existingProduct.setPlatform("PC");
        existingProduct.setGamePrice(new BigDecimal("1.50"));
        existingProduct.setStockQuantity(100);
        existingProduct.setFileUrl("https://game-and-music-files.s3.eu-west-1.amazonaws.com/Game%20Executables/Platform%20Game.exe");

        when(productRepository.findById(4L)).thenReturn(java.util.Optional.of(existingProduct));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // ACT
        Product result = productService.updateProduct(4L, updateDetails);

        // ASSERT
        assertThat(result.getGamePrice()).isEqualByComparingTo(new BigDecimal("1.99"));
        assertThat(result.getStockQuantity()).isEqualTo(150);
        assertThat(result.getFileUrl()).isEqualTo("https://new-url.com/red-hood-v2.zip");
        assertThat(result.getGameTitle()).isEqualTo("Red Hood"); // Unchanged
    }

    @Test
    @DisplayName("updateProduct - Should only update non-null fields")
    void testUpdateProduct_OnlyNonNullFields() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGamePrice(new BigDecimal("2.50"));
        // Other fields are null and should not be updated

        Product existingProduct = new Product();
        existingProduct.setId(2L);
        existingProduct.setGameTitle("Midnight Haunt");
        existingProduct.setPlatform("PC");
        existingProduct.setGamePrice(new BigDecimal("2.00"));
        existingProduct.setStockQuantity(100);

        when(productRepository.findById(2L)).thenReturn(java.util.Optional.of(existingProduct));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // ACT
        Product result = productService.updateProduct(2L, updateDetails);

        // ASSERT
        assertThat(result.getGamePrice()).isEqualByComparingTo(new BigDecimal("2.50"));
        assertThat(result.getGameTitle()).isEqualTo("Midnight Haunt"); // Unchanged
        assertThat(result.getPlatform()).isEqualTo("PC"); // Unchanged
        assertThat(result.getStockQuantity()).isEqualTo(100); // Unchanged
    }

    @Test
    @DisplayName("updateProduct - Should throw exception when product not found")
    void testUpdateProduct_ProductNotFound() {
        // ARRANGE
        Product updateDetails = new Product();
        updateDetails.setGamePrice(new BigDecimal("9.99"));

        when(productRepository.findById(999L)).thenReturn(java.util.Optional.empty());

        // ACT & ASSERT
        assertThatThrownBy(() -> productService.updateProduct(999L, updateDetails))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 999");
        
        verify(productRepository, times(1)).findById(999L);
        verify(productRepository, never()).save(any(Product.class));
    }

    // ============================================
    // deleteProduct Tests
    // ============================================

    @Test
    @DisplayName("deleteProduct - Should delete Jimmy Jungle successfully")
    void testDeleteProduct_JimmyJungle() {
        // ARRANGE
        when(productRepository.existsById(1L)).thenReturn(true);
        doNothing().when(productRepository).deleteById(1L);

        // ACT
        productService.deleteProduct(1L);

        // ASSERT
        verify(productRepository, times(1)).existsById(1L);
        verify(productRepository, times(1)).deleteById(1L);
    }

    @Test
    @DisplayName("deleteProduct - Should delete Midnight Haunt successfully")
    void testDeleteProduct_MidnightHaunt() {
        // ARRANGE
        when(productRepository.existsById(2L)).thenReturn(true);
        doNothing().when(productRepository).deleteById(2L);

        // ACT
        productService.deleteProduct(2L);

        // ASSERT
        verify(productRepository, times(1)).existsById(2L);
        verify(productRepository, times(1)).deleteById(2L);
    }

    @Test
    @DisplayName("deleteProduct - Should delete album successfully")
    void testDeleteProduct_Album() {
        // ARRANGE
        when(productRepository.existsById(5L)).thenReturn(true);
        doNothing().when(productRepository).deleteById(5L);

        // ACT
        productService.deleteProduct(5L);

        // ASSERT
        verify(productRepository, times(1)).existsById(5L);
        verify(productRepository, times(1)).deleteById(5L);
    }

    @Test
    @DisplayName("deleteProduct - Should throw exception when product not found")
    void testDeleteProduct_NotFound() {
        // ARRANGE
        when(productRepository.existsById(999L)).thenReturn(false);

        // ACT & ASSERT
        assertThatThrownBy(() -> productService.deleteProduct(999L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 999");
        
        verify(productRepository, times(1)).existsById(999L);
        verify(productRepository, never()).deleteById(any());
    }

    @Test
    @DisplayName("deleteProduct - Should throw exception for already deleted product")
    void testDeleteProduct_AlreadyDeleted() {
        // ARRANGE
        when(productRepository.existsById(3L)).thenReturn(false);

        // ACT & ASSERT
        assertThatThrownBy(() -> productService.deleteProduct(3L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Product not found with id: 3");
        
        verify(productRepository, never()).deleteById(any());
    }

    // ============================================
    // Integration-like Tests (Multiple Operations)
    // ============================================

    @Test
    @DisplayName("Should create and then find product by game cover URL")
    void testCreateAndFindByGameCoverUrl() {
        // ARRANGE - Create
        Product newProduct = new Product();
        newProduct.setGameTitle("Test Game");
        newProduct.setGameCoverImageUrl("https://test.com/cover.png");
        newProduct.setGamePrice(new BigDecimal("10.00"));

        Product savedProduct = new Product();
        savedProduct.setId(10L);
        savedProduct.setGameTitle("Test Game");
        savedProduct.setGameCoverImageUrl("https://test.com/cover.png");
        savedProduct.setGamePrice(new BigDecimal("10.00"));

        when(productRepository.save(any(Product.class))).thenReturn(savedProduct);
        
        // ACT - Create
        Product created = productService.createProduct(newProduct);
        
        // ARRANGE - Find
        when(productRepository.findByGameCoverImageUrl("https://test.com/cover.png"))
                .thenReturn(Collections.singletonList(savedProduct));
        
        // ACT - Find
        List<Product> found = productService.getProductsByGameCoverImageUrl("https://test.com/cover.png");

        // ASSERT
        assertThat(created.getId()).isEqualTo(10L);
        assertThat(found).hasSize(1);
        assertThat(found.get(0).getGameTitle()).isEqualTo("Test Game");
    }

    @Test
    @DisplayName("Should verify all PC games have correct platform")
    void testAllPCGamesHaveCorrectPlatform() {
        // ARRANGE
        List<Product> pcGames = Arrays.asList(jimmyJungle, midnightHaunt, protectors, redHood);
        when(productRepository.findByPlatform("PC")).thenReturn(pcGames);

        // ACT
        List<Product> result = productService.getProductsByPlatform("PC");

        // ASSERT
        assertThat(result).hasSize(4);
        assertThat(result).allMatch(product -> 
            product.getPlatform() != null && product.getPlatform().equals("PC")
        );
        assertThat(result).allMatch(product -> product.getGameTitle() != null);
        assertThat(result).allMatch(product -> product.getGamePrice() != null);
    }

    @Test
    @DisplayName("Should verify stock quantities match database data")
    void testStockQuantitiesMatchDatabaseData() {
        // ARRANGE
        List<Product> allProducts = Arrays.asList(
            jimmyJungle, midnightHaunt, protectors, redHood, selectedElectronicWorks
        );
        when(productRepository.findAll()).thenReturn(allProducts);

        // ACT
        List<Product> result = productService.getAllProducts();

        // ASSERT
        assertThat(result.get(0).getStockQuantity()).isEqualTo(100); // Jimmy Jungle
        assertThat(result.get(1).getStockQuantity()).isEqualTo(100); // Midnight Haunt
        assertThat(result.get(2).getStockQuantity()).isEqualTo(100); // Protectors
        assertThat(result.get(3).getStockQuantity()).isEqualTo(100); // Red Hood
        assertThat(result.get(4).getStockQuantity()).isEqualTo(200); // Selected Electronic Works
    }

    @Test
    @DisplayName("Should verify game prices match database data")
    void testGamePricesMatchDatabaseData() {
        // ARRANGE
        List<Product> games = Arrays.asList(jimmyJungle, midnightHaunt, protectors, redHood);
        when(productRepository.findByPlatform("PC")).thenReturn(games);

        // ACT
        List<Product> result = productService.getProductsByPlatform("PC");

        // ASSERT
        assertThat(result.get(0).getGamePrice()).isEqualByComparingTo(new BigDecimal("2.00")); // Jimmy Jungle
        assertThat(result.get(1).getGamePrice()).isEqualByComparingTo(new BigDecimal("2.00")); // Midnight Haunt
        assertThat(result.get(2).getGamePrice()).isEqualByComparingTo(new BigDecimal("5.00")); // Protectors
        assertThat(result.get(3).getGamePrice()).isEqualByComparingTo(new BigDecimal("1.50")); // Red Hood
    }
}
