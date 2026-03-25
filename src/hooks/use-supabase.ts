'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Returns the singleton Supabase browser client.
 * Use this in Client Components instead of importing createClient directly.
 *
 * Example:
 *   const supabase = useSupabase();
 *   const { data } = await supabase.from('cases').select('*');
 */
export function useSupabase() {
  return createClient();
}
