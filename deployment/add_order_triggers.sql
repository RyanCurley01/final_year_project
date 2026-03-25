USE Game_Store_System;
DELIMITER //

-- Ensure derived purchase tables stay in sync with Order_Items inserts.
DROP TRIGGER IF EXISTS After_Order_Item_Insert //

CREATE TRIGGER After_Order_Item_Insert
AFTER INSERT ON Order_Items
FOR EACH ROW
BEGIN
    DECLARE v_AccountID BIGINT;

    INSERT INTO Sold_Products (OrderItemID, ProductID)
    VALUES (NEW.OrderItemID, NEW.ProductID);

    INSERT INTO Purchased_Products (OrderItemID, ProductID)
    VALUES (NEW.OrderItemID, NEW.ProductID);

    SELECT AccountID INTO v_AccountID
    FROM Orders
    WHERE OrderID = NEW.OrderID
    LIMIT 1;

    IF v_AccountID IS NOT NULL THEN
        INSERT INTO CustomerSummary (AccountID, ProductID, OrderID)
        VALUES (v_AccountID, NEW.ProductID, NEW.OrderID);
    END IF;

END //

DELIMITER ;
