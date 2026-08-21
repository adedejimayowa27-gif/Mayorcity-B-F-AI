// netlify/functions/chat.js
// Proxies chat requests to the Groq API (OpenAI-compatible) so the API key never reaches the browser.
// Set GROQ_API_KEY in your Netlify site's Environment Variables (Site settings → Environment variables).
// Get a key at https://console.groq.com/keys

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
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

  const { system, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "messages[] is required." }) };
  }

  // Groq's API is OpenAI-compatible: system prompt is just the first message in the array,
  // and roles are already "user"/"assistant" (matches what the frontend sends).
  const chatMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }))
  ];

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: chatMessages,
        max_completion_tokens: 1500
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data?.error?.message || "Groq API error." })
      };
    }

    const text = (data?.choices?.[0]?.message?.content || "").trim();

    // Normalize to the same { content: [{ text }] } shape app.js already expects.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: [{ text: text || "Sorry, I couldn't generate a response." }] })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to reach Groq API: " + err.message })
    };
  }
};
