// netlify/functions/admin-kb.js
// Admin-only. Manages the knowledge base students' questions get matched against,
// on top of the built-in study packs in js/kb-parts/.
//   GET    — list uploaded documents
//   POST   — upload a new document (chunks the text, saves to Supabase)
//   DELETE — remove a document and all its chunks

const { requireAdmin, restFetch } = require("./lib/supabase-admin");

const TARGET_CHUNK_SIZE = 1400;   // characters — similar scale to the existing study-pack chunks
const MAX_DOCUMENT_LENGTH = 600000; // ~600k characters (~120k words) per upload, plenty for a course pack

// Splits text on paragraph breaks, grouping consecutive paragraphs up to ~TARGET_CHUNK_SIZE
// characters per chunk. Any single paragraph longer than that gets hard-split so nothing
// is ever dropped.
function chunkText(text, targetSize = TARGET_CHUNK_SIZE) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const grouped = [];
  let buf = "";
  for (const p of paras) {
    if (buf && (buf.length + p.length + 2) > targetSize) {
      grouped.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) grouped.push(buf.trim());

  const final = [];
  for (const c of grouped) {
    if (c.length <= targetSize * 1.5) {
      final.push(c);
    } else {
      for (let i = 0; i < c.length; i += targetSize) final.push(c.slice(i, i + targetSize));
    }
  }
  return final;
}

exports.handler = async function (event) {
  const auth = await requireAdmin(event);
  if (auth.error) {
    return { statusCode: auth.error.statusCode, body: JSON.stringify({ error: auth.error.message }) };
  }

  if (event.httpMethod === "GET") {
    const resp = await restFetch("/documents?select=id,title,subject,filename,chunk_count,created_at&order=created_at.desc");
    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to load documents: " + t }) };
    }
    const documents = await resp.json();
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents }) };
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
    }

    const title = String(payload.title || "").trim();
    const subject = String(payload.subject || "Uploaded Material").trim() || "Uploaded Material";
    const filename = payload.filename ? String(payload.filename).trim().slice(0, 200) : null;
    const text = String(payload.text || "").trim();

    if (!title) return { statusCode: 400, body: JSON.stringify({ error: "A title is required." }) };
    if (!text) return { statusCode: 400, body: JSON.stringify({ error: "No document text was provided." }) };
    if (text.length > MAX_DOCUMENT_LENGTH) {
      return { statusCode: 400, body: JSON.stringify({ error: `That document is too large (limit ~${MAX_DOCUMENT_LENGTH.toLocaleString()} characters). Try splitting it into smaller parts.` }) };
    }

    const chunks = chunkText(text);
    if (!chunks.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Couldn't extract any usable text from that document." }) };
    }

    const docResp = await restFetch("/documents", {
      method: "POST",
      body: { title, subject, filename, chunk_count: chunks.length, uploaded_by: auth.userId }
    });
    if (!docResp.ok) {
      const t = await docResp.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to save document: " + t }) };
    }
    const [doc] = await docResp.json();

    const chunkRows = chunks.map((c) => ({ document_id: doc.id, source: title, subject, priority: 2, text: c }));
    const chunkResp = await restFetch("/kb_chunks", { method: "POST", body: chunkRows });
    if (!chunkResp.ok) {
      const t = await chunkResp.text();
      // Roll back the document row so we don't leave an orphaned, chunk-less entry behind.
      await restFetch(`/documents?id=eq.${doc.id}`, { method: "DELETE" });
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to save document content: " + t }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, documentId: doc.id, chunks: chunks.length })
    };
  }

  if (event.httpMethod === "DELETE") {
    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      /* id may come from query string instead */
    }
    const id = payload.id || (event.queryStringParameters && event.queryStringParameters.id);
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: "id is required." }) };

    // kb_chunks has ON DELETE CASCADE on document_id, so deleting the document row
    // also removes all of its chunks automatically.
    const resp = await restFetch(`/documents?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to delete document: " + t }) };
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
