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

    const jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'default_jwt_secret';
    const decoded = jwt.verify(token, jwtSecret);

    // Attach decoded payload to req.college, req.user, and req.student for unified access
    req.college = decoded;
    req.user = decoded;
    req.student = decoded;

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
