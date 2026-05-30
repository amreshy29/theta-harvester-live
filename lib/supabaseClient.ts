// lib/supabaseClient.ts
// Central Supabase client using the Service Role key for server‑side privileged operations.

import { createClient } from '@supabase/supabase-js';

// Environment variables are already defined in .env (see lines 21‑34).
// The values may be wrapped in double quotes – strip them for safety.
const supabaseUrl = process.env.SUPABASE_URL?.replace(/"/g, '') ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, '') ?? '';

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper for debugging – prints a concise connection status.
export const testSupabaseConnection = async () => {
  const { data, error } = await supabase.from('positions').select('id').limit(1);
  if (error) console.error('[Supabase] Connection test failed:', error);
  else console.log('[Supabase] Connection test succeeded, sample record:', data);
};
