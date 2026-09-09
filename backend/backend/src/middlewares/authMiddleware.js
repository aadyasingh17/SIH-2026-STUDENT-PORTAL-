const jwt = require('jsonwebtoken');
const config = require('../config/env');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: No token provided'
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Invalid token format'
      });
    }

    if (!config.jwtSecret) {
      return res.status(500).json({
        status: 'error',
        message: 'JWT authentication is not configured'
      });
    }

    req.college = jwt.verify(token, config.jwtSecret);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Token has expired'
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: Invalid token'
    });
  }
};

module.exports = authMiddleware;
