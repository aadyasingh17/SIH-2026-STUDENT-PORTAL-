# Express.js Backend Starter

A clean, modular, and scalable Node.js backend template using Express.js and dotenv.

---

## 📁 Project Structure

```
my-backend/
├── src/
│   ├── config/
│   │   └── env.js                 # Centralized environment variable loader
│   ├── controllers/
│   │   └── health.controller.js   # Health check business logic
│   ├── middlewares/
│   │   ├── error.middleware.js    # Global error handler
│   │   └── notFound.middleware.js # 404 handler for undefined routes
│   ├── routes/
│   │   ├── api.routes.js          # Aggregator for all API sub-routes
│   │   └── health.routes.js       # Health endpoint definition (/api/health)
│   └── app.js                     # Express app instance and middleware setup
├── .env                           # Local environment configuration
├── .env.example                   # Template for environment variables
├── .gitignore                     # Git ignored files & directories
├── package.json                   # Dependencies and npm scripts
├── README.md                      # Project documentation
└── server.js                      # Application entry point & server listener
```

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v16 or newer recommended).

### 2. Environment Setup
The `.env` file is already generated. You can customize variables as needed:

```env
PORT=5000
NODE_ENV=development
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Running the Server

#### Development Mode (with hot-reload via nodemon):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

---

## 📡 API Endpoints

| Method | Endpoint | Description | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | API Welcome message | Status & message |
| `GET` | `/api/health` | Health check endpoint | Server uptime, timestamp, status |

### Example Response: `GET /api/health`
```json
{
  "status": "OK",
  "message": "Server is healthy and running smoothly",
  "timestamp": "2026-08-30T10:15:30.123Z",
  "uptime": "42s",
  "environment": "development"
}
```
