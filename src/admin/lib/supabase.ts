import { createClient } from '@supabase/supabase-js'

// Same project as the PROXIMA mobile app (mobile-app-inizial/mobile/src/supabase.ts).
// Only the publishable key -- it is designed to be public and can do nothing RLS
// doesn't already allow. Admin reach comes from the `public.admins` membership
// granted in supabase/007_admin_access.sql, checked via `is_admin()` in RLS, not
// from this key. Never put the service role key in this app: it's a static Vite
// bundle served over GitHub Pages, fully downloadable by anyone who visits it.
export const SUPABASE_URL = 'https://ycozndsxmsxasdytozba.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nlHNanAqv9ReDWyVrSWszQ_i5-CuPCO'

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
