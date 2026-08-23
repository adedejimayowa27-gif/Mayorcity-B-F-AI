// netlify/functions/feedback.js
// Records thumbs up/down feedback on assistant answers.
//
// There's no database wired up here — this simply writes each vote to the function's
// logs (Netlify dashboard → your site → Logs → Functions → feedback), which is enough
// to spot-check answer quality without adding infrastructure. If you outgrow that,
// swap the console.log below for a call to a sheet (Google Apps Script), a table
// (Airtable/Supabase), or anywhere else you'd rather collect it.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const rating = payload.rating === "up" || payload.rating === "down" ? payload.rating : "unknown";
  const question = String(payload.question || "").slice(0, 500);
  const answer = String(payload.answer || "").slice(0, 1000);

  console.log("[mb-feedback]", JSON.stringify({
    rating,
    question,
    answer,
    time: new Date().toISOString()
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true })
  };
};
