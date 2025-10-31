// package com.example.products.controller;

// import com.example.products.model.Product;
// import com.example.products.service.ProductService;
// import com.fasterxml.jackson.databind.ObjectMapper;
// import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.DisplayName;
// import org.junit.jupiter.api.Test;
// import org.springframework.beans.factory.annotation.Autowired;
// import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
// import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
// import org.springframework.http.MediaType;
// import org.springframework.test.context.bean.override.mockito.MockitoBean;
// import org.springframework.test.web.servlet.MockMvc;

// import java.math.BigDecimal;
// import java.util.Arrays;
// import java.util.List;
// import java.util.Optional;

// import static org.hamcrest.Matchers.hasSize;
// import static org.hamcrest.Matchers.is;
// import static org.mockito.ArgumentMatchers.any;
// import static org.mockito.Mockito.doThrow;
// import static org.mockito.Mockito.when;
// import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
// import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
// import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @WebMvcTest(ProductController.class)
// @AutoConfigureMockMvc(addFilters = false)
// @DisplayName("Product Controller Integration Tests")
// class ProductControllerTest {

//     @Autowired
//     private MockMvc mockMvc;

//     @MockitoBean
//     private ProductService productService;

//     @Autowired
//     private ObjectMapper objectMapper;

//     private Product testProduct;

//     @BeforeEach
//     void setUp() {
//         testProduct = new Product();
//         testProduct.setId(1L);
//         testProduct.setGameTitle("Test Game");
//         testProduct.setAlbumTitle("Test Album");
//         testProduct.setPlatform("PC");
//         testProduct.setArtist("Test Artist");
//         testProduct.setGenre("Action");
//         testProduct.setGamePrice(new BigDecimal("49.99"));
//         testProduct.setAlbumPrice(new BigDecimal("9.99"));
//         testProduct.setStockQuantity(100);
//     }

//     @Test
//     @DisplayName("GET /api/products/getAllProducts - Should return all products")
//     void testGetAllProducts() throws Exception {
//         // ARRANGE
//         Product product2 = new Product();
//         product2.setId(2L);
//         product2.setGameTitle("Another Game");
//         product2.setGenre("RPG");

//         List<Product> products = Arrays.asList(testProduct, product2);
//         when(productService.getAllProducts()).thenReturn(products);

//         // ACT & ASSERT
//         mockMvc.perform(get("/api/products/getAllProducts")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isOk())
//                 .andExpect(jsonPath("$", hasSize(2)))
//                 .andExpect(jsonPath("$[0].gameTitle", is("Test Game")))
//                 .andExpect(jsonPath("$[1].gameTitle", is("Another Game")));
//     }

//     @Test
//     @DisplayName("GET /api/products/getAllProducts - Should filter by genre")
//     void testGetAllProductsByGenre() throws Exception {
//         // ARRANGE
//         List<Product> products = Arrays.asList(testProduct);
//         when(productService.getProductsByGenre("Action")).thenReturn(products);

//         // ACT & ASSERT
//         mockMvc.perform(get("/api/products/getAllProducts")
//                 .param("genre", "Action")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isOk())
//                 .andExpect(jsonPath("$", hasSize(1)))
//                 .andExpect(jsonPath("$[0].genre", is("Action")));
//     }

//     @Test
//     @DisplayName("GET /api/products/getAllProducts - Should filter by artist")
//     void testGetAllProductsByArtist() throws Exception {
//         // ARRANGE
//         List<Product> products = Arrays.asList(testProduct);
//         when(productService.getProductsByArtist("Test Artist")).thenReturn(products);

//         // ACT & ASSERT
//         mockMvc.perform(get("/api/products/getAllProducts")
//                 .param("artist", "Test Artist")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isOk())
//                 .andExpect(jsonPath("$", hasSize(1)))
//                 .andExpect(jsonPath("$[0].artist", is("Test Artist")));
//     }

//     @Test
//     @DisplayName("GET /api/products/getAllProducts - Should filter by platform")
//     void testGetAllProductsByPlatform() throws Exception {
//         // ARRANGE
//         List<Product> products = Arrays.asList(testProduct);
//         when(productService.getProductsByPlatform("PC")).thenReturn(products);

//         // ACT & ASSERT
//         mockMvc.perform(get("/api/products/getAllProducts")
//                 .param("platform", "PC")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isOk())
//                 .andExpect(jsonPath("$", hasSize(1)))
//                 .andExpect(jsonPath("$[0].platform", is("PC")));
//     }

//     @Test
//     @DisplayName("GET /api/products/{id} - Should return product by id")
//     void testGetProductById() throws Exception {
//         // ARRANGE
//         when(productService.getProductById(1L)).thenReturn(Optional.of(testProduct));

//         // ACT & ASSERT
//         mockMvc.perform(get("/api/products/1")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isOk())
//                 .andExpect(jsonPath("$.id", is(1)))
//                 .andExpect(jsonPath("$.gameTitle", is("Test Game")))
//                 .andExpect(jsonPath("$.genre", is("Action")));
//     }

//     @Test
//     @DisplayName("GET /api/products/{id} - Should return 404 when product not found")
//     void testGetProductByIdNotFound() throws Exception {
//         // ARRANGE
//         when(productService.getProductById(99L)).thenReturn(Optional.empty());

//         // ACT & ASSERT
//         mockMvc.perform(get("/api/products/99")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isNotFound());
//     }

//     @Test
//     @DisplayName("POST /api/products - Should create new product")
//     void testCreateProduct() throws Exception {
//         // ARRANGE
//         Product newProduct = new Product();
//         newProduct.setGameTitle("New Game");
//         newProduct.setPlatform("PS5");
//         newProduct.setGenre("Adventure");
//         newProduct.setGamePrice(new BigDecimal("59.99"));
//         newProduct.setStockQuantity(50);

//         Product createdProduct = new Product();
//         createdProduct.setId(3L);
//         createdProduct.setGameTitle("New Game");
//         createdProduct.setPlatform("PS5");
//         createdProduct.setGenre("Adventure");
//         createdProduct.setGamePrice(new BigDecimal("59.99"));
//         createdProduct.setStockQuantity(50);

//         when(productService.createProduct(any(Product.class))).thenReturn(createdProduct);

//         // ACT & ASSERT
//         mockMvc.perform(post("/api/products")
//                 .contentType(MediaType.APPLICATION_JSON)
//                 .content(objectMapper.writeValueAsString(newProduct)))
//                 .andExpect(status().isCreated())
//                 .andExpect(jsonPath("$.id", is(3)))
//                 .andExpect(jsonPath("$.gameTitle", is("New Game")));
//     }

//     @Test
//     @DisplayName("PUT /api/products/{id} - Should update existing product")
//     void testUpdateProduct() throws Exception {
//         // ARRANGE
//         Product updateDetails = new Product();
//         updateDetails.setGameTitle("Updated Game");
//         updateDetails.setGamePrice(new BigDecimal("39.99"));

//         Product updatedProduct = new Product();
//         updatedProduct.setId(1L);
//         updatedProduct.setGameTitle("Updated Game");
//         updatedProduct.setGamePrice(new BigDecimal("39.99"));

//         when(productService.updateProduct(any(Long.class), any(Product.class))).thenReturn(updatedProduct);

//         // ACT & ASSERT
//         mockMvc.perform(put("/api/products/1")
//                 .contentType(MediaType.APPLICATION_JSON)
//                 .content(objectMapper.writeValueAsString(updateDetails)))
//                 .andExpect(status().isOk())
//                 .andExpect(jsonPath("$.gameTitle", is("Updated Game")));
//     }

//     @Test
//     @DisplayName("PUT /api/products/{id} - Should return 404 when product not found")
//     void testUpdateProductNotFound() throws Exception {
//         // ARRANGE
//         Product updateDetails = new Product();
//         updateDetails.setGameTitle("Updated Game");

//         when(productService.updateProduct(any(Long.class), any(Product.class)))
//                 .thenThrow(new IllegalArgumentException("Product not found"));

//         // ACT & ASSERT
//         mockMvc.perform(put("/api/products/99")
//                 .contentType(MediaType.APPLICATION_JSON)
//                 .content(objectMapper.writeValueAsString(updateDetails)))
//                 .andExpect(status().isNotFound());
//     }

//     @Test
//     @DisplayName("DELETE /api/products/{id} - Should delete existing product")
//     void testDeleteProduct() throws Exception {
//         // ACT & ASSERT
//         mockMvc.perform(delete("/api/products/1")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isNoContent());
//     }

//     @Test
//     @DisplayName("DELETE /api/products/{id} - Should return 404 when product not found")
//     void testDeleteProductNotFound() throws Exception {
//         // ARRANGE
//         doThrow(new IllegalArgumentException("Product not found"))
//                 .when(productService).deleteProduct(99L);

//         // ACT & ASSERT
//         mockMvc.perform(delete("/api/products/99")
//                 .contentType(MediaType.APPLICATION_JSON))
//                 .andExpect(status().isNotFound());
//     }
// }
