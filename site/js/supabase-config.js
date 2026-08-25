// site/js/supabase-config.js
// Your Supabase project's URL and publishable (anon) key. Both are safe to expose in
// frontend code — the anon key can't read/write data on its own, it can only do what
// your Row Level Security policies (see supabase-setup.sql) explicitly allow: a signed-in
// user reading/writing their own profiles row. Never put your service_role / secret key
// here or in any file under site/ — that one must stay server-side only.

const SUPABASE_URL = "https://ggghuurwtapxgblveitv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__p9hVXkwwO8uFdDNgzJVmg_JscgUQRj";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  },
  global: {
    // Without this, the browser can silently reuse a cached GET response (e.g. an old
    // "pending" profile status) instead of asking Supabase again — so admin approvals
    // etc. can appear not to have taken effect even though the database is correct.
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
  }
});
