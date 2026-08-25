// netlify/functions/quiz-result.js
// Called once a student finishes marking a quiz client-side. Records the attempt and
// atomically updates their streak via the record_quiz_result() Postgres function —
// done server-side (not a direct client insert) so streaks can't be faked by calling
// a REST endpoint repeatedly with a forged score.

const { requireApprovedUser, restFetch } = require("./lib/supabase-admin");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const auth = await requireApprovedUser(event);
  if (auth.error) {
    return { statusCode: auth.error.statusCode, body: JSON.stringify({ error: auth.error.message }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const topic = String(payload.topic || "").trim().slice(0, 200) || "General";
  const score = parseInt(payload.score, 10);
  const total = parseInt(payload.total, 10);

  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0 || score < 0 || score > total) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid score/total." }) };
  }

  const resp = await restFetch("/rpc/record_quiz_result", {
    method: "POST",
    body: { uid: auth.userId, p_topic: topic, p_score: score, p_total: total }
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to record quiz result: " + t }) };
  }

  const rows = await resp.json();
  const result = Array.isArray(rows) ? rows[0] : rows;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      currentStreak: (result && result.current_streak) || 0,
      longestStreak: (result && result.longest_streak) || 0
    })
  };
};
