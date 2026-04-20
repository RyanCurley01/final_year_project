package com.example.wishlist.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;


@Entity
@Table(name = "Wishlist", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"AccountID", "ProductID"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Wishlist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "WishlistID")
    private Long id;

    @NotNull(message = "Account ID is required")
    @Column(name = "AccountID", nullable = false)
    private Long accountId;

    @NotNull(message = "Product ID is required")
    @Column(name = "ProductID", nullable = false)
    private Long productId;
}
