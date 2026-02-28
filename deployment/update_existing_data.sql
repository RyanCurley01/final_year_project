USE Game_Store_System;

-- First, populate existing data that might have been missed
INSERT INTO Sold_Products (OrderItemID, ProductID)
SELECT OrderItemID, ProductID FROM Order_Items oi
WHERE NOT EXISTS (SELECT 1 FROM Sold_Products sp WHERE sp.OrderItemID = oi.OrderItemID);

INSERT INTO Purchased_Products (OrderItemID, ProductID)
SELECT OrderItemID, ProductID FROM Order_Items oi
WHERE NOT EXISTS (SELECT 1 FROM Purchased_Products pp WHERE pp.OrderItemID = oi.OrderItemID);

INSERT INTO CustomerSummary (AccountID, ProductID, OrderID)
SELECT o.AccountID, oi.ProductID, oi.OrderID 
FROM Order_Items oi
JOIN Orders o ON oi.OrderID = o.OrderID
WHERE NOT EXISTS (
    SELECT 1 FROM CustomerSummary cs 
    WHERE cs.OrderID = oi.OrderID AND cs.ProductID = oi.ProductID
);
