USE Game_Store_System;

-- Rebuild derived purchase-tracking rows for historical order items.
INSERT INTO Sold_Products (OrderItemID, ProductID)
SELECT oi.OrderItemID, oi.ProductID
FROM Order_Items oi
LEFT JOIN Sold_Products sp
    ON sp.OrderItemID = oi.OrderItemID
    AND sp.ProductID = oi.ProductID
WHERE sp.SoldProductsID IS NULL;

INSERT INTO Purchased_Products (OrderItemID, ProductID)
SELECT oi.OrderItemID, oi.ProductID
FROM Order_Items oi
LEFT JOIN Purchased_Products pp
    ON pp.OrderItemID = oi.OrderItemID
    AND pp.ProductID = oi.ProductID
WHERE pp.PurchasedProductsID IS NULL;

INSERT INTO CustomerSummary (AccountID, ProductID, OrderID)
SELECT o.AccountID, oi.ProductID, oi.OrderID
FROM Order_Items oi
JOIN Orders o
    ON o.OrderID = oi.OrderID
LEFT JOIN CustomerSummary cs
    ON cs.AccountID = o.AccountID
    AND cs.ProductID = oi.ProductID
    AND cs.OrderID = oi.OrderID
WHERE o.AccountID IS NOT NULL
  AND cs.CustomerSummaryID IS NULL;
