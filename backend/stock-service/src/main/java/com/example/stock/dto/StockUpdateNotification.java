package com.example.stock.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StockUpdateNotification {
    private Long stockId;
    private Long productId;
    private Integer oldQuantity;
    private Integer newQuantity;
    private String updateType; // CREATED, UPDATED, DELETED
    private LocalDateTime timestamp;

    public StockUpdateNotification(Long stockId, Long productId, Integer newQuantity, String updateType) {
        this.stockId = stockId;
        this.productId = productId;
        this.newQuantity = newQuantity;
        this.updateType = updateType;
        this.timestamp = LocalDateTime.now();
    }
}

