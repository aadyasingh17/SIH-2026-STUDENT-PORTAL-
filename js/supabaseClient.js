// =========================================================
// CENTRALIZED SUPABASE CLIENT
// =========================================================

// Replace the placeholder values below with your team's existing Supabase credentials.
// IMPORTANT: Use ONLY your Supabase Project URL and Public Anon / Publishable key.
// NEVER use the service_role key or any secret credentials in frontend code.
// Supabase Project Credentials
// Project Reference: tbjbxunpacgzvjewezjd
// Publishable Key: sb_publishable_hyaAwt28yLgGrtHPCznGWw_JtM5kJ1m
const SUPABASE_URL = 'https://tbjbxunpacgzvjewezjd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiamJ4dW5wYWNnenZqZXdlempkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNzA5OTEsImV4cCI6MjEwMzg0Njk5MX0.NMFSrfOCJ1nOwXfnsqKe40pVrs-u3XU8UKQYS6-U6DI';

// Initialize the single centralized client using the official Supabase browser distribution
if (typeof window.supabase === 'undefined') {
  console.error('Supabase library not found. Make sure the Supabase CDN script is loaded before supabaseClient.js.');
}

const supabaseClient = typeof window.supabase !== 'undefined'
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Attach client instance to window object for access across app scripts
window.supabaseClient = supabaseClient;
