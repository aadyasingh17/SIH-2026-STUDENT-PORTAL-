/**
 * 404 Not Found Middleware
 * Handles requests for routes that are not defined.
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
};

module.exports = notFoundHandler;
