const express = require('express');
const cors = require('cors');

const apiRoutes = require('./routes/api.routes');
const studentRoutes = require('../routes/student');
const notFoundHandler = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

// 1. CORS Configuration (Allows frontend origins)
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// 2. Request Parsing Middlewares (Applied before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount the single API route tree.
app.use('/api', apiRoutes);

// Mount Student Portal routes directly under /api/student for direct access
app.use('/api/student', studentRoutes);

// 5. 404 Not Found Fallback Middleware
app.use(notFoundHandler);

// 6. Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
