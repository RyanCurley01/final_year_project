# API Specifications for DBMS Game Store

## Accounts (Manager, Employee, Customer)

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/managers           | GET    |                                        | List of managers                       |
| /api/managers           | POST   | ManagerName, ManagerPhoneNumber, ManagerEmailAddress | Created manager object   |
| /api/managers/{id}      | GET    | id                                     | Manager object                         |
| /api/managers/{id}      | PUT    | id, fields to update                   | Updated manager object                 |
| /api/managers/{id}      | DELETE | id                                     | Success/failure                        |
| /api/employees          | GET    |                                        | List of employees                      |
| /api/employees          | POST   | EmployeeName, EmployeePhoneNumber, EmployeeEmailAddress | Created employee object|
| /api/employees/{id}     | GET    | id                                     | Employee object                        |
| /api/employees/{id}     | PUT    | id, fields to update                   | Updated employee object                |
| /api/employees/{id}     | DELETE | id                                     | Success/failure                        |
| /api/customers          | GET    |                                        | List of customers                      |
| /api/customers          | POST   | CustomerName, CustomerPhoneNumber, CustomerEmailAddress | Created customer object|
| /api/customers/{id}     | GET    | id                                     | Customer object                        |
| /api/customers/{id}     | PUT    | id, fields to update                   | Updated customer object                |
| /api/customers/{id}     | DELETE | id                                     | Success/failure                        |

---

## Orders & Order_Items

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/orders             | GET    |                                        | List of orders                         |
| /api/orders             | POST   | CustomerID, orderDate, TotalAmount     | Created order object                   |
| /api/orders/{id}        | GET    | id                                     | Order object                           |
| /api/orders/{id}        | PUT    | id, fields to update                   | Updated order object                   |
| /api/orders/{id}        | DELETE | id                                     | Success/failure                        |
| /api/order-items        | GET    |                                        | List of order items                    |
| /api/order-items        | POST   | OrderID, GameID, orderDate, TotalAmount| Created order item object              |
| /api/order-items/{id}   | GET    | id                                     | Order item object                      |
| /api/order-items/{id}   | PUT    | id, fields to update                   | Updated order item object              |
| /api/order-items/{id}   | DELETE | id                                     | Success/failure                        |

---

## Games

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/games              | GET    |                                        | List of games                          |
| /api/games              | POST   | GameTitle, Platform, Price, StockQuantity | Created game object                 |
| /api/games/{id}         | GET    | id                                     | Game object                            |
| /api/games/{id}         | PUT    | id, fields to update                   | Updated game object                    |
| /api/games/{id}         | DELETE | id                                     | Success/failure                        |

---

## Purchase Information (CustomerSummary, Sold_Games, Purchased_Games)

| Endpoint                         | Method | Parameters (Body/Query)                | Response (JSON)                        |
|----------------------------------|--------|----------------------------------------|----------------------------------------|
| /api/customer-summary            | GET    |                                        | List of customer summaries             |
| /api/customer-summary            | POST   | GameTitle, Platform, CustomerID, OrderID, GameID | Created summary object       |
| /api/sold-games                  | GET    |                                        | List of sold games                     |
| /api/sold-games                  | POST   | GameTitle, Platform, OrderItemID       | Created sold game object               |
| /api/purchased-games             | GET    |                                        | List of purchased games                |
| /api/purchased-games             | POST   | GameTitle, Platform, OrderItemID       | Created purchased game object          |

---

## Stock

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/stock              | GET    |                                        | List of stock items                    |
| /api/stock              | POST   | GameID, Platform, StockQuantity        | Created stock object                   |
| /api/stock/{id}         | GET    | id                                     | Stock object                           |
| /api/stock/{id}         | PUT    | id, fields to update                   | Updated stock object                   |
| /api/stock/{id}         | DELETE | id                                     | Success/failure                        |

---

## Wishlist

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/wishlist           | GET    |                                        | List of wishlist items                 |
| /api/wishlist           | POST   | GameTitle, Platform                    | Created wishlist object                |
| /api/wishlist/{id}      | GET    | id                                     | Wishlist object                        |
| /api/wishlist/{id}      | DELETE | id                                     | Success/failure                        |
