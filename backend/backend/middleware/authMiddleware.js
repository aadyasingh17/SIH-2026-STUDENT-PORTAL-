const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Reads a Bearer token from the Authorization header, verifies it with jsonwebtoken,
 * and attaches the decoded payload (college id, role) to req.college.
 * Returns 401 if missing or invalid.
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: No token provided'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Invalid token format'
      });
    }

    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
    const decoded = jwt.verify(token, jwtSecret);

    // Attach decoded payload to req.college
    req.college = decoded;

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
