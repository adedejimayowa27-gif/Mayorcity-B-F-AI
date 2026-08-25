// netlify/functions/lib/supabase-admin.js
// Shared helper for server-side Supabase access. Used by chat.js (to check a student's
// approval status and log usage) and the admin-* functions (to verify the caller is an
// admin before doing anything privileged).
//
// Requires SUPABASE_SECRET_KEY to be set in Netlify's Environment Variables (Site
// settings → Environment variables). Supabase's current key system uses a
// "secret key" (starts with sb_secret_...) as the trusted server-side key — get it
// from Supabase → Settings → API Keys → "Publishable and secret API keys" tab → Secret
// keys section. (This replaces the older "service_role" JWT key; if your project only
// shows the new key format, as this one does, you won't see a service_role key at all —
// use the secret key instead.) NEVER put this key in any file under site/ — it must
// only ever live here, server-side.

const SUPABASE_URL = "https://ggghuurwtapxgblveitv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__p9hVXkwwO8uFdDNgzJVmg_JscgUQRj";

function serviceKey() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set on the server.");
  return key;
}

// Low-level helper: call Supabase's PostgREST API with the service role key, which
// bypasses Row Level Security entirely. Only ever called from trusted server code below.
async function restFetch(path, { method = "GET", body, extraHeaders = {} } = {}) {
  const key = serviceKey();
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function bearerToken(event) {
  const header = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

// Verifies the caller's Supabase session token is valid and returns the auth user object.
async function getAuthUser(token) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) return null;
  return resp.json();
}

// For chat.js: confirms the caller is logged in AND their account has been approved.
async function requireApprovedUser(event) {
  const token = bearerToken(event);
  if (!token) return { error: { statusCode: 401, message: "Please log in to chat." } };

  const user = await getAuthUser(token);
  if (!user || !user.id) return { error: { statusCode: 401, message: "Your session has expired — please log in again." } };

  const profResp = await restFetch(`/profiles?id=eq.${user.id}&select=status`);
  if (!profResp.ok) return { error: { statusCode: 500, message: "Couldn't verify your account right now." } };
  const rows = await profResp.json();
  const profile = rows[0];

  if (!profile) return { error: { statusCode: 403, message: "Account not found." } };
  if (profile.status === "pending") return { error: { statusCode: 403, message: "Your account is awaiting admin approval." } };
  if (profile.status === "rejected") return { error: { statusCode: 403, message: "Your account access was declined." } };

  return { userId: user.id };
}

// For admin-*.js: confirms the caller is logged in AND flagged as an admin.
async function requireAdmin(event) {
  const token = bearerToken(event);
  if (!token) return { error: { statusCode: 401, message: "Please log in." } };

  const user = await getAuthUser(token);
  if (!user || !user.id) return { error: { statusCode: 401, message: "Your session has expired — please log in again." } };

  const profResp = await restFetch(`/profiles?id=eq.${user.id}&select=id,name,is_admin`);
  if (!profResp.ok) return { error: { statusCode: 500, message: "Couldn't verify admin status." } };
  const rows = await profResp.json();
  const profile = rows[0];

  if (!profile || !profile.is_admin) return { error: { statusCode: 403, message: "Admin access required." } };

  return { userId: user.id, profile };
}

async function incrementMessageCount(userId) {
  try {
    await restFetch(`/rpc/increment_message_count`, { method: "POST", body: { uid: userId } });
  } catch (e) {
    console.error("[mb-admin] increment_message_count failed:", e);
  }
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  restFetch,
  requireApprovedUser,
  requireAdmin,
  incrementMessageCount
};
