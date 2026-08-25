// netlify/functions/admin-users.js
// Admin-only. GET lists every student with their usage stats (for the "most used"
// dashboard view); POST changes one student's approval status.
//
// Every request is verified server-side via requireAdmin() — a non-admin caller (even
// a logged-in, approved student) gets a 403, regardless of what the browser sends.

const { requireAdmin, restFetch } = require("./lib/supabase-admin");

exports.handler = async function (event) {
  const auth = await requireAdmin(event);
  if (auth.error) {
    return { statusCode: auth.error.statusCode, body: JSON.stringify({ error: auth.error.message }) };
  }

  if (event.httpMethod === "GET") {
    const resp = await restFetch(
      "/profiles?select=id,name,matric_number,status,is_admin,message_count,last_active_at,created_at&order=message_count.desc"
    );
    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to load users: " + t }) };
    }
    const users = await resp.json();
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ users }) };
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
    }

    const { id, status } = payload;
    if (!id || !["pending", "approved", "rejected"].includes(status)) {
      return { statusCode: 400, body: JSON.stringify({ error: "id and a valid status ('pending'|'approved'|'rejected') are required." }) };
    }

    const resp = await restFetch(`/profiles?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status }
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to update status: " + t }) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
