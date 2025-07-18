# 🛠 AmarHaat (Backend)

This is the **backend** for the AmarHaat full-stack project. Built with **Express.js** and **MongoDB**, it handles all server-side operations including authentication, product and advertisement management, order processing, admin statistics, and role-based access control.

## 📦 Tech Stack

- Node.js + Express.js
- MongoDB (native driver)
- Firebase Admin SDK (for user token verification)
- CORS, Dotenv

## ⚙️ Key Features

- 🔐 Firebase Auth token verification
-  Role-based access: Admin, Vendor, Buyer
-  Product CRUD with price history
-  Advertisement CRUD & status update
-  Admin Dashboard: Stats for users, products, orders, ads
-  Order placement and retrieval
-  Secure REST APIs

## 🔐 Endpoints Overview

| Method | Endpoint                     | Description                        |
|--------|------------------------------|------------------------------------|
| GET    | `/products`                 | Get all approved products          |
| POST   | `/products`                 | Add new product                    |
| GET    | `/advertisements`          | Fetch advertisements (by status)  |
| GET    | `/admin/stats`             | Admin dashboard stats              |
| GET    | `/orders`                  | Get all orders                     |
| POST   | `/orders`                  | Place new order                    |
| DELETE | `/users/:id`               | Delete user (admin only)          |
