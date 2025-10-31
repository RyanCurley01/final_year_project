# API Specifications for DBMS Game Store

## Accounts (Manager, Employee, Customer)

| Endpoint               | Method | Parameters (Body/Query)                | Response (JSON)                        |
|------------------------|--------|----------------------------------------|----------------------------------------|
| /api/accounts          | GET    | AccountType                            | List of accounts (filtered by type)    |
| /api/accounts          | POST   | AccountName, AccountPhoneNumber, AccountEmailAddress, AccountPassword, AccountType | Created account object |
| /api/accounts/{id}     | GET    | id                                     | Account object                         |
| /api/accounts/{id}     | PUT    | id, fields to update                   | Updated account object                 |
| /api/accounts/{id}     | DELETE | id                                     | Success/failure                        |

---

## Orders & Order_Items

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/orders             | GET    |                                        | List of orders                         |
| /api/orders/{id}        | GET    | id                                     | Order object                           |
| /api/orders/{id}        | PUT    | id, fields to update                   | Updated order object                   |
| /api/orders/{id}        | DELETE | id                                     | Success/failure                        |
| /api/order-items        | GET    |                                        | List of order items                    |
| /api/order-items/{id}   | GET    | id                                     | Order item object                      |
| /api/order-items/{id}   | PUT    | id, fields to update                   | Updated order item object              |
| /api/order-items/{id}   | DELETE | id                                     | Success/failure                        |
| /api/orders             | POST   | CustomerID, orderDate, TotalAmount     | Created order object                   |
| /api/order-items        | POST   | OrderID, ProductID, Quantity, UnitPrice| Created order item object              |

---

## Products

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/products           | GET    |                                        | List of products (games & albums)      |
| /api/products           | POST   | GameTitle/AlbumTitle, Platform, GamePrice/AlbumPrice, Artist, Genre, file_url, preview_url, StockQuantity | Created product object |
| /api/products/{id}      | GET    | id                                     | Product object                         |
| /api/products/{id}      | PUT    | id, fields to update                   | Updated product object                 |
| /api/products/{id}      | DELETE | id                                     | Success/failure                        |

---

## Purchase Information (CustomerSummary, Sold_Products, Purchased_Products)

| Endpoint                         | Method | Parameters (Body/Query)                | Response (JSON)                        |
|----------------------------------|--------|----------------------------------------|----------------------------------------|
| /api/customer-summary            | GET    |                                        | List of customer summaries             |
| /api/customer-summary            | POST   | CustomerID, ProductID, OrderID         | Created summary object                 |
| /api/sold-products               | GET    |                                        | List of sold products                  |
| /api/sold-products               | POST   | OrderItemID, ProductID                 | Created sold product object            |
| /api/purchased-products          | GET    |                                        | List of purchased products             |
| /api/purchased-products          | POST   | OrderItemID, ProductID                 | Created purchased product object       |

---

## Stock

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/stock              | GET    |                                        | List of stock items                    |
| /api/stock              | POST   | ProductID, StockQuantity               | Created stock object                   |
| /api/stock/{id}         | GET    | id                                     | Stock object                           |
| /api/stock/{id}         | PUT    | id, fields to update                   | Updated stock object                   |
| /api/stock/{id}         | DELETE | id                                     | Success/failure                        |

---

## Wishlist

| Endpoint                | Method | Parameters (Body/Query)                | Response (JSON)                        |
|-------------------------|--------|----------------------------------------|----------------------------------------|
| /api/wishlist           | GET    |                                        | List of wishlist items                 |
| /api/wishlist           | POST   | CustomerID, ProductID                  | Created wishlist object                |
| /api/wishlist/{id}      | GET    | id                                     | Wishlist object                        |
| /api/wishlist/{id}      | DELETE | id                                     | Success/failure                        |
| /api/wishlist/{id}      | PUT    | id, fields to update                   | Updated wishlist object                |

---

## Payments

| Endpoint           | Method | Parameters (Body/Query)                                | Response (JSON)         |
|--------------------|--------|--------------------------------------------------------|-------------------------|
| /api/payments      | GET    |                                                        | List of payments        |
| /api/payments      | POST   | OrderID, ProductID, CustomerID, PaymentAmount, PaymentStatus | Created payment object |
| /api/payments/{id} | GET    | id                                                     | Payment object          |
| /api/payments/{id} | PUT    | id, fields to update                                   | Updated payment object  |
| /api/payments/{id} | DELETE | id                                                     | Success/failure         |
