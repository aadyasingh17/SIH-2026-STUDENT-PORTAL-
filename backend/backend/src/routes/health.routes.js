const express = require('express');
const { getHealthStatus } = require('../controllers/health.controller');

const router = express.Router();

// GET /api/health
router.get('/', getHealthStatus);

module.exports = router;
