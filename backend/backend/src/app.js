const path = require('path');
const express = require('express');
const cors = require('cors');

// Import modular routes
const healthRoutes = require('./routes/health.routes');
const collegeAuthRoutes = require('../routes/collegeAuth');
const collegeStudentsRoutes = require('../routes/collegeStudents');
const collegeDrivesRoutes = require('../routes/collegeDrives');
const collegeDashboardRoutes = require('../routes/collegeDashboard');
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

// 3. Static Files (Serves frontend prototype)
app.use(express.static(path.join(__dirname, '../public')));

// 4. Mount API Routes
app.use('/api/health', healthRoutes);

// Mount College Modules directly under /api/college
app.use('/api/college', collegeAuthRoutes);
app.use('/api/college', collegeStudentsRoutes);
app.use('/api/college', collegeDrivesRoutes);
app.use('/api/college', collegeDashboardRoutes);

// Also maintain /api/college/students, /api/college/drives, /api/college/dashboard for nested calls
app.use('/api/college/students', collegeStudentsRoutes);
app.use('/api/college/drives', collegeDrivesRoutes);
app.use('/api/college/dashboard', collegeDashboardRoutes);

// 5. 404 Not Found Fallback Middleware
app.use(notFoundHandler);

// 6. Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
