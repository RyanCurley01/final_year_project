package com.example.stock.service;

import com.example.stock.model.Stock;
import com.example.stock.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class StockService {

    private final StockRepository stockRepository;

    public List<Stock> getAllStock() {
        return stockRepository.findAll();
    }

    public Optional<Stock> getStockById(Long id) {
        return stockRepository.findById(id);
    }

    public Optional<Stock> getStockByProductId(Long productId) {
        return stockRepository.findByProductId(productId);
    }

    @Transactional
    public Stock createStock(Stock stock) {
        if (stockRepository.existsByProductId(stock.getProductId())) {
            throw new IllegalArgumentException("Stock already exists for product ID: " + stock.getProductId());
        }
        return stockRepository.save(stock);
    }

    @Transactional
    public Stock updateStock(Long id, Stock stockDetails) {
        Stock stock = stockRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Stock not found with id: " + id));

        if (stockDetails.getProductId() != null && !stockDetails.getProductId().equals(stock.getProductId())) {
            if (stockRepository.existsByProductId(stockDetails.getProductId())) {
                throw new IllegalArgumentException("Stock already exists for product ID: " + stockDetails.getProductId());
            }
            stock.setProductId(stockDetails.getProductId());
        }
        if (stockDetails.getStockQuantity() != null) {
            stock.setStockQuantity(stockDetails.getStockQuantity());
        }

        return stockRepository.save(stock);
    }

    @Transactional
    public void deleteStock(Long id) {
        if (!stockRepository.existsById(id)) {
            throw new IllegalArgumentException("Stock not found with id: " + id);
        }
        stockRepository.deleteById(id);
    }
}
