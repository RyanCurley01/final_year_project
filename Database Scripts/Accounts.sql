Create Database Game_Store_System;

DROP table Manager_Account;

CREATE TABLE Manager_Account (
	ManagerID INT auto_increment primary key,
	ManagerName VARCHAR(10),
	ManagerPhoneNumber VARCHAR(10),
	ManagerEmailAddress VARCHAR(10)
);

SELECT * FROM Manager_Account;


DROP table Employee_Account;

CREATE TABLE Employee_Account (
	EmployeeID INT auto_increment primary key,
	EmployeeName VARCHAR(10),
	EmployeePhoneNumber VARCHAR(10),
	EmployeeEmailAddress VARCHAR(10)
);


DROP table Customer_Account;

CREATE TABLE Customer_Account (
	CustomerID INT auto_increment primary key,
	CustomerName VARCHAR(10),
	CustomerPhoneNumber VARCHAR(10),
	CustomerEmailAddress VARCHAR(10)
);


