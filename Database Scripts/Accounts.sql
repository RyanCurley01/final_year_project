Create Database Game_Store_System;

CREATE TABLE Account (
    AccountID INT auto_increment primary key,
    AccountName VARCHAR(10),
    AccountPhoneNumber VARCHAR(10),
    AccountEmailAddress VARCHAR(20),
    AccountPassword VARCHAR(10),
    AccountType ENUM('Manager', 'Employee', 'Customer')
);





