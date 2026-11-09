'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
let browserClient: SupabaseClient<Database> | undefined;
/** Share one Auth client across React remounts and keep its refresh lifecycle singular. */
export function getBrowserClient() {
  if (typeof window === 'undefined') throw new Error('Browser client used on the server.');
  return (browserClient ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ));
}
