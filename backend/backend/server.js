// 1. Load environment variables at the very top before any other imports
require('dotenv').config();

// 2. Import application configuration and Express app
const config = require('./src/config/env');
const app = require('./src/app');

const PORT = config.port;

// 3. Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Server running in ${config.nodeEnv} mode`);
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});

// 4. Graceful Shutdown Handlers
const handleShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close if it takes too long
  setTimeout(() => {
    console.error('Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
