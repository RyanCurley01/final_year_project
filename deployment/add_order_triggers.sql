USE Game_Store_System;

DELIMITER //

DROP TRIGGER IF EXISTS After_Order_Item_Insert //

CREATE TRIGGER After_Order_Item_Insert
AFTER INSERT ON Order_Items
FOR EACH ROW
BEGIN
    DECLARE v_AccountID INT;
    
    -- Insert into Sold_Products
    INSERT INTO Sold_Products (OrderItemID, ProductID) 
    VALUES (NEW.OrderItemID, NEW.ProductID);
    
    -- Insert into Purchased_Products
    INSERT INTO Purchased_Products (OrderItemID, ProductID) 
    VALUES (NEW.OrderItemID, NEW.ProductID);
    
    -- Get the AccountID from the Orders table
    SELECT AccountID INTO v_AccountID FROM Orders WHERE OrderID = NEW.OrderID;
    
    -- Insert into CustomerSummary
    IF v_AccountID IS NOT NULL THEN
        INSERT INTO CustomerSummary (AccountID, ProductID, OrderID) 
        VALUES (v_AccountID, NEW.ProductID, NEW.OrderID);
    END IF;

END//

DELIMITER ;
