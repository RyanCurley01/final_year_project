package com.example.stock.service;

import com.example.stock.dto.StockUpdateNotification;
import com.example.stock.model.Stock;
import com.example.stock.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockService {

    private final StockRepository stockRepository;
    private final SimpMessagingTemplate messagingTemplate;

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
        Stock savedStock = stockRepository.save(stock);
        
        // Broadcast stock creation via WebSocket
        broadcastStockUpdate(savedStock, null, "CREATED");
        
        return savedStock;
    }

    @Transactional
    public Stock updateStock(Long id, Stock stockDetails) {
        Stock stock = stockRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Stock not found with id: " + id));

        Integer oldQuantity = stock.getStockQuantity();
        
        if (stockDetails.getProductId() != null && !stockDetails.getProductId().equals(stock.getProductId())) {
            if (stockRepository.existsByProductId(stockDetails.getProductId())) {
                throw new IllegalArgumentException("Stock already exists for product ID: " + stockDetails.getProductId());
            }
            stock.setProductId(stockDetails.getProductId());
        }
        if (stockDetails.getStockQuantity() != null) {
            stock.setStockQuantity(stockDetails.getStockQuantity());
        }

        Stock updatedStock = stockRepository.save(stock);
        
        // Broadcast stock update via WebSocket
        broadcastStockUpdate(updatedStock, oldQuantity, "UPDATED");
        
        return updatedStock;
    }

    @Transactional
    public void deleteStock(Long id) {
        if (!stockRepository.existsById(id)) {
            throw new IllegalArgumentException("Stock not found with id: " + id);
        }
        
        // Get stock before deletion for notification
        Stock stock = stockRepository.findById(id).orElseThrow();
        Integer oldQuantity = stock.getStockQuantity();
        
        stockRepository.deleteById(id);
        
        // Broadcast stock deletion via WebSocket
        broadcastStockUpdate(stock, oldQuantity, "DELETED");
    }

    /**
     * Broadcasts stock update notifications to all connected WebSocket clients
     */
    private void broadcastStockUpdate(Stock stock, Integer oldQuantity, String updateType) {
        try {
            StockUpdateNotification notification = new StockUpdateNotification(
                stock.getId(),
                stock.getProductId(),
                oldQuantity,
                stock.getStockQuantity(),
                updateType,
                java.time.LocalDateTime.now()
            );
            
            // Send to topic that all subscribers will receive
            messagingTemplate.convertAndSend("/topic/stock-updates", notification);
            
            // Also send to product-specific topic for targeted updates
            messagingTemplate.convertAndSend(
                "/topic/stock-updates/" + stock.getProductId(), 
                notification
            );
            
            log.info("Broadcasted {} stock update for productId: {}, quantity: {} -> {}", 
                updateType, stock.getProductId(), oldQuantity, stock.getStockQuantity());
                
        } catch (Exception e) {
            log.error("Failed to broadcast stock update for productId: {}", stock.getProductId(), e);
            // Don't throw exception - stock operation already succeeded
        }
    }
}
