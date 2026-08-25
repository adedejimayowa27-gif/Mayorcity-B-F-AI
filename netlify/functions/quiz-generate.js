// netlify/functions/quiz-generate.js
// Generates a short, auto-gradable quiz (multiple-choice + true/false only — both can
// be marked instantly and unambiguously client-side, no second AI call needed) on
// whatever topic the student typed in. Requires the same login + approval as chat.js.

const { requireApprovedUser } = require("./lib/supabase-admin");

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 15;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const auth = await requireApprovedUser(event);
  if (auth.error) {
    return { statusCode: auth.error.statusCode, body: JSON.stringify({ error: auth.error.message }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GROQ_API_KEY is not set on the server." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const topic = String(payload.topic || "").trim().slice(0, 200);
  let count = parseInt(payload.count, 10);
  if (!Number.isFinite(count)) count = 8;
  count = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, count));

  if (!topic) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please enter a topic to be quizzed on." }) };
  }

  const systemPrompt = `You write quiz questions for Nigerian Banking & Finance students (CIBN-centered curriculum: Digital Banking, Banking Law & Practice, Finance in Global Markets, Risk & Fintech, Mathematics of Finance, Monetary Policy). Write clear, exam-style questions with exactly one unambiguously correct answer each. Mix multiple-choice (4 options) and true/false questions. Respond with ONLY a JSON object, no markdown fences, no commentary, matching this exact shape:
{"questions":[{"type":"mcq","question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."},{"type":"truefalse","question":"...","options":["True","False"],"correctIndex":1,"explanation":"..."}]}
Rules: "correctIndex" is a zero-based index into "options". "options" has exactly 4 items for "mcq" and exactly ["True","False"] for "truefalse". Keep each "explanation" to one short sentence. Return exactly ${count} questions, in a natural mix of both types.`;

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Topic: ${topic}\n\nWrite ${count} questions now, as JSON only.` }
        ],
        temperature: 0.6,
        max_completion_tokens: 3000,
        response_format: { type: "json_object" }
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data?.error?.message || "Groq API error while generating the quiz." })
      };
    }

    const raw = (data?.choices?.[0]?.message?.content || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fall back to stripping stray markdown fences, in case the model added them anyway.
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (e2) {
        return { statusCode: 502, body: JSON.stringify({ error: "The quiz generator returned something unreadable. Please try again." }) };
      }
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const clean = questions
      .filter((q) => q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correctIndex))
      .map((q) => ({
        type: q.type === "truefalse" ? "truefalse" : "mcq",
        question: String(q.question).trim(),
        options: q.options.map((o) => String(o).trim()),
        correctIndex: Math.max(0, Math.min(q.options.length - 1, q.correctIndex)),
        explanation: String(q.explanation || "").trim()
      }));

    if (!clean.length) {
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't generate a usable quiz on that topic. Try rephrasing it or being more specific." }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, questions: clean })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to reach Groq API: " + err.message }) };
  }
};
