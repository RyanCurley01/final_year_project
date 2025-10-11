Create Database Game_Store_System;

CREATE TABLE Account (
    AccountID INT auto_increment primary key,
    AccountName VARCHAR(50),
    AccountPhoneNumber VARCHAR(20),
    AccountEmailAddress VARCHAR(50),
    AccountType ENUM('Manager', 'Employee', 'Customer')
);





