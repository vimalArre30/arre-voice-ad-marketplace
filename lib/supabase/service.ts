import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Only use in API routes / server-side code.
// We do not pass the Database generic here because manually maintained types can
// conflict with supabase-js v2 internal type constraints; callers cast results.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
