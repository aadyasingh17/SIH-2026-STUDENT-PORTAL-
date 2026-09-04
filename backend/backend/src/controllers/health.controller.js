/**
 * Controller for health check endpoint
 * @route GET /api/health
 */
const getHealthStatus = (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is healthy and running smoothly',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    environment: process.env.NODE_ENV || 'development'
  });
};

module.exports = {
  getHealthStatus
};
