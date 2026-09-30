// api/_lib/adapter.js
// Lets the original Netlify-style handlers ({ httpMethod, headers, body, queryStringParameters }
// -> { statusCode, headers, body }) run unchanged as Vercel functions.
module.exports = (handler) => async (req, res) => {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  else if (body === undefined || body === null) body = "";
  else if (typeof body !== "string") body = JSON.stringify(body);

  let out;
  try {
    out = await handler({
      httpMethod: req.method,
      headers: req.headers,
      body,
      queryStringParameters: req.query || {},
    });
  } catch (err) {
    console.error("[api] unhandled error:", err);
    res.status(500).setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ error: "Server error: " + err.message }));
  }

  const headers = out.headers || {};
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  const text = out.body == null ? "" : String(out.body);
  if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type") && /^\s*[\[{]/.test(text)) {
    res.setHeader("Content-Type", "application/json");
  }
  res.status(out.statusCode || 200).send(text);
};
