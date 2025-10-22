Create Database Game_Store_System;

CREATE TABLE Account (
    AccountID INT auto_increment primary key,
    AccountName VARCHAR(100),
    AccountPhoneNumber VARCHAR(15),
    AccountEmailAddress VARCHAR(100),
    AccountPassword VARCHAR(60), 
    AccountType ENUM('Manager', 'Employee', 'Customer')
);

DROP TABLE Account;

SHOW TABLES;





