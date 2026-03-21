-- Tell the script execution to use our designated database
USE Game_Store_System;

-- Temporarily change the end-of-statement delimiter to '//' so MySQL doesn't break when seeing semicolons inside the trigger body
DELIMITER //

-- Clean up any existing copy of this trigger safely before rebuilding it
DROP TRIGGER IF EXISTS After_Order_Item_Insert //

-- Create a new automated MySQL trigger
CREATE TRIGGER After_Order_Item_Insert
-- Instruct the backend to execute this function immediately after an insert into 'Order_Items' completes
AFTER INSERT ON Order_Items
-- Process this logic block for every incoming row individually
FOR EACH ROW
BEGIN
    -- Temporary variable declared specifically to hold our looked-up customer Account ID
    DECLARE v_AccountID INT;
    
    -- Business Rule 1: Copy a reference to tracking tables proving the product sold (uses 'NEW.' keyword assessing incoming data)
    INSERT INTO Sold_Products (OrderItemID, ProductID) 
    VALUES (NEW.OrderItemID, NEW.ProductID);
    
    -- Business Rule 2: Note the user purchase block inside tracking structures separately
    INSERT INTO Purchased_Products (OrderItemID, ProductID) 
    VALUES (NEW.OrderItemID, NEW.ProductID);
    
    -- Lookup linking parent properties: fetch the associated AccountID by reading the main Orders table row matching the item
    SELECT AccountID INTO v_AccountID FROM Orders WHERE OrderID = NEW.OrderID;
    
    -- Safety Check: Ensure the lookup worked before moving to Step 3
    IF v_AccountID IS NOT NULL THEN
        -- Business Rule 3: Register a finalized link referencing Account + Product + Order to user analytics profile schema
        INSERT INTO CustomerSummary (AccountID, ProductID, OrderID) 
        VALUES (v_AccountID, NEW.ProductID, NEW.OrderID);
    END IF;

-- Complete trigger codeblock body
END//

-- Restore the standard execution end-of-statement delimiter
DELIMITER ;
