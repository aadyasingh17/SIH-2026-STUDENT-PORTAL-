const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('⚠️ [Supabase] Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in environment variables.');
}

// Debug line requested
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

// Create and export configured Supabase client
const supabase = createClient(supabaseUrl || '', supabaseServiceRoleKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = supabase;
