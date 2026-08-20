// netlify/functions/chat.js
// Proxies chat requests to the Google Gemini API so the API key never reaches the browser.
// Set GEMINI_API_KEY in your Netlify site's Environment Variables (Site settings → Environment variables).
// Get a key at https://aistudio.google.com/apikey

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GEMINI_API_KEY is not set on the server." })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "messages[] is required." }) };
  }

  // Gemini's chat format differs from Anthropic's: roles are "user"/"model" (not
  // "assistant"), and every turn's text goes inside a parts[] array.
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { maxOutputTokens: 1500 }
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data?.error?.message || "Gemini API error." })
      };
    }

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("").trim();

    if (!text) {
      // Gemini blocked or returned nothing — surface why if it told us.
      const reason = candidate?.finishReason;
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: [{ text: reason ? `The model couldn't answer that (reason: ${reason}). Try rephrasing the question.` : "Sorry, I couldn't generate a response." }]
        })
      };
    }

    // Normalize to the same { content: [{ text }] } shape app.js already expects,
    // so nothing on the frontend has to change.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: [{ text }] })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to reach Gemini API: " + err.message })
    };
  }
};
