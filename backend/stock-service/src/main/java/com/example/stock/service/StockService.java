package com.example.stock.service;

import com.example.stock.dto.StockUpdateNotification;
import com.example.stock.model.Stock;
import com.example.stock.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
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

        // Stamp availableSince on creation if the stock starts available
        if (Boolean.TRUE.equals(stock.getIsAvailable()) && stock.getAvailableSince() == null) {
            stock.setAvailableSince(LocalDateTime.now());
        }

        Stock savedStock = stockRepository.save(stock);
        broadcastStockUpdate(savedStock, null, "CREATED");
        return savedStock;
    }

    @Transactional
    public Stock updateStock(Long id, Stock stockDetails) {
        Stock stock = stockRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Stock not found with id: " + id));

        Boolean oldAvailability = stock.getIsAvailable();

        if (stockDetails.getProductId() != null && !stockDetails.getProductId().equals(stock.getProductId())) {
            if (stockRepository.existsByProductId(stockDetails.getProductId())) {
                throw new IllegalArgumentException("Stock already exists for product ID: " + stockDetails.getProductId());
            }
            stock.setProductId(stockDetails.getProductId());
        }

        if (stockDetails.getIsAvailable() != null) {
            boolean wasAvailable = Boolean.TRUE.equals(oldAvailability);
            boolean nowAvailable = Boolean.TRUE.equals(stockDetails.getIsAvailable());

            stock.setIsAvailable(nowAvailable);

            // Stamp the relevant date when availability actually changes
            if (!wasAvailable && nowAvailable) {
                // Became available
                stock.setAvailableSince(LocalDateTime.now());
            } else if (wasAvailable && !nowAvailable) {
                // Became unavailable — this is what makes "Removed" sections work
                stock.setUnavailableSince(LocalDateTime.now());
            }
        }

        Stock updatedStock = stockRepository.save(stock);
        broadcastStockUpdate(updatedStock, oldAvailability, "UPDATED");
        return updatedStock;
    }

    @Transactional
    public void deleteStock(Long id) {
        if (!stockRepository.existsById(id)) {
            throw new IllegalArgumentException("Stock not found with id: " + id);
        }

        Stock stock = stockRepository.findById(id).orElseThrow();
        Boolean oldAvailability = stock.getIsAvailable();

        stockRepository.deleteById(id);
        broadcastStockUpdate(stock, oldAvailability, "DELETED");
    }

    private void broadcastStockUpdate(Stock stock, Boolean oldAvailability, String updateType) {
        try {
            StockUpdateNotification notification = new StockUpdateNotification(
                stock.getId(),
                stock.getProductId(),
                oldAvailability,
                stock.getIsAvailable(),
                updateType,
                LocalDateTime.now()
            );

            messagingTemplate.convertAndSend("/topic/stock-updates", notification);
            messagingTemplate.convertAndSend(
                "/topic/stock-updates/" + stock.getProductId(),
                notification
            );

            log.info("Broadcasted {} stock update for productId: {}, available: {} -> {}",
                updateType, stock.getProductId(), oldAvailability, stock.getIsAvailable());

        } catch (Exception e) {
            log.error("Failed to broadcast stock update for productId: {}", stock.getProductId(), e);
        }
    }
}
