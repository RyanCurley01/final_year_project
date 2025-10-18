package com.example.products.repository;

import com.example.products.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    
    List<Product> findByProductType(String productType);
    
    List<Product> findByGenre(String genre);
    
    List<Product> findByArtist(String artist);
    
    List<Product> findByPlatform(String platform);
}
