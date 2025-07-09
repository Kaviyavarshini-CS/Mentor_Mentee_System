# URL Shortener with Load Balancing and Caching

A high-performance, RESTful **URL shortening service** built with a full-stack architecture and robust backend design. This project demonstrates scalable web development practices including **load balancing**, **caching**, and **database optimization**, built and tested to handle **1000+ requests/day**.

> Built as part of internship experience (June 2025 – July 2025)

---

## Tech Stack

- **Backend:** Node.js, Express.js  
- **Database:** MySQL  
- **Caching:** Redis  
- **Frontend:** HTML, CSS (decoupled from backend)
- **Load Balancer:** Nginx

---

## Key Features

- **URL Shortening**  
  Converts long URLs into short, unique identifiers using a custom base62 encoding strategy.

- **Performance Optimization**  
  Integrated Redis for caching frequently accessed short URLs, reducing repeated DB hits by **40%**.

- **Load Balancing with Nginx**  
  Deployed 3 instances of the backend behind an Nginx reverse proxy to simulate high availability and fault tolerance.

- **Reduced Latency**  
  Response time improved from **800ms ➝ 300ms** during load testing.

---

## Folder Structure

mentor_mentee_system/
├── backend/ # Node.js + Express API
│ ├── routes/
│ ├── controllers/
│ ├── utils/
│ └── server.js
│
├── frontend/ # Basic HTML/CSS UI
│ └── index.html
│
├── nginx/ # Nginx config for load balancing
│ └── default.conf
│
├── mysql/ # SQL schema and seed
│ └── init.sql
│
├── redis/ # Redis connection
│ └── client.js
└── README.md

---

## How It Works

1. **Client submits long URL** via frontend or API.
2. Backend generates a **short code** and stores it in MySQL.
3. On future requests:
   - Checks Redis for cached mapping.
   - If found → return immediately.
   - If not → query MySQL, then cache the result.

4. **Nginx** distributes incoming traffic to one of three backend servers in round-robin mode.

---

## Running Locally

### 1. Clone the repo

git clone https://github.com/Kaviyavarshini-CS/Mentor_Mentee_System.git
cd Mentor_Mentee_System

2. Set up MySQL & Redis
Import mysql/init.sql into your MySQL instance.

Start your Redis server.

3. Start backend servers

cd backend
npm install
node server.js        # Start this on 3 different ports for Nginx

4. Run Nginx

sudo nginx -c $(pwd)/nginx/default.conf



