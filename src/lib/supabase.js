import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// PASTIKAN ADA KATA 'export' DI DEPAN const supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);