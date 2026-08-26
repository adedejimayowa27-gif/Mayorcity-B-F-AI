// netlify/functions/chat.js
// Proxies chat requests to the Groq API (OpenAI-compatible) so the API key never reaches the browser.
// Set GROQ_API_KEY in your Netlify site's Environment Variables (Site settings → Environment variables).
// Get a key at https://console.groq.com/keys
//
// Also requires the caller to be a logged-in, admin-approved student (see
// lib/supabase-admin.js) — this is the real enforcement point for the approve/reject
// gate, since anything checked only in the browser could be bypassed.

const { requireApprovedUser, incrementMessageCount } = require("./lib/supabase-admin");

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
// Groq's vision-capable lineup changes often; qwen/qwen3.6-27b is current as of Aug 2026 but is a
// PREVIEW model (Groq can discontinue preview models at short notice). If image attachments start
// failing, check https://console.groq.com/docs/vision for the current model and update this.
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";

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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GROQ_API_KEY is not set on the server." })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const { system, messages, image } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "messages[] is required." }) };
  }

  // Build the OpenAI-compatible message list. Every turn is plain text except the final
  // (current) user turn, which becomes a multimodal [text, image_url] array if an image
  // was attached — Groq (like OpenAI) only expects image content on the turns that have one.
  const chatMessages = [];
  if (system) chatMessages.push({ role: "system", content: system });

  messages.forEach((m, i) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    const isLast = i === messages.length - 1;
    if (image && isLast && role === "user") {
      chatMessages.push({
        role: "user",
        content: [
          { type: "text", text: String(m.content || "") },
          { type: "image_url", image_url: { url: image } }
        ]
      });
    } else {
      chatMessages.push({ role, content: String(m.content || "") });
    }
  });

  const model = image ? GROQ_VISION_MODEL : GROQ_MODEL;

  // Netlify kills synchronous functions after a hard execution limit (10s on most plans).
  // If Groq is slow to respond, that hard kill happens mid-request with no response body at
  // all, so the browser just sees a dropped connection and can't tell what went wrong — that's
  // what was showing up client-side as the generic "Something went wrong reaching the model"
  // message so often. Aborting the upstream call ourselves well before that limit lets us
  // return a clean, specific error instead, and gives the client something to retry against.
  const GROQ_TIMEOUT_MS = 8500;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages,
        max_completion_tokens: 1500
      }),
      signal: controller.signal
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data?.error?.message || `Groq API error (model: ${model}).` })
      };
    }

    const text = (data?.choices?.[0]?.message?.content || "").trim();

    await incrementMessageCount(auth.userId);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: [{ text: text || "Sorry, I couldn't generate a response." }] })
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        statusCode: 504,
        body: JSON.stringify({ error: "The model took too long to respond. Please try again." })
      };
    }
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to reach Groq API: " + err.message })
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
