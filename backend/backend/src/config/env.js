const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // Fallback to current working directory if already loaded

const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || ''
  },
  jwtSecret: process.env.JWT_SECRET || ''
};

if (config.isProduction && (!config.supabase.url || !config.supabase.serviceRoleKey || !config.jwtSecret)) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and JWT_SECRET are required in production');
}

module.exports = config;
