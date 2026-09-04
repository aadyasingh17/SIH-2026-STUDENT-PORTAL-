const express = require('express');
const healthRoutes = require('./health.routes');
const collegeAuthRoutes = require('../../routes/collegeAuth');
const collegeStudentsRoutes = require('../../routes/collegeStudents');
const collegeDrivesRoutes = require('../../routes/collegeDrives');
const collegeDashboardRoutes = require('../../routes/collegeDashboard');

const router = express.Router();

// Mount individual route modules
router.use('/health', healthRoutes);
router.use('/college', collegeAuthRoutes);
router.use('/college', collegeDashboardRoutes);
router.use('/college/students', collegeStudentsRoutes);
router.use('/college/drives', collegeDrivesRoutes);

module.exports = router;
