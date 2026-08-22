/* ---------- Retrieval over the study-pack knowledge base (KB comes from js/kb.js) ---------- */

const STOPWORDS = new Set(("the a an of and to in on for is are was were be been being this that these those it its as with by from at or not no do does did can could would should will shall may might have has had i you he she we they what which who whom how why when where explain define describe summarize give example examples list compare difference between").split(/\s+/));

function tokenize(s){
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length>2 && !STOPWORDS.has(w));
}

function scoreChunk(qTokens, chunk){
  const text = chunk._lower || (chunk._lower = chunk.text.toLowerCase());
  let score = 0;
  for(const t of qTokens){
    let idx = -1;
    while((idx = text.indexOf(t, idx+1)) !== -1){ score += 1; }
  }
  if(chunk.priority === 1) score *= 1.4;
  else if(chunk.priority === 2) score *= 1.1;
  return score;
}

/* Subject chips can narrow retrieval to matching KB subjects (OR across active chips). */
let activeSubjects = new Set();

function retrieve(query, topN=9){
  const qTokens = tokenize(query);
  if(qTokens.length === 0) return [];
  let pool = KB;
  if(activeSubjects.size > 0){
    pool = KB.filter(c => {
      const subj = (c.subject || '').toLowerCase();
      for(const tok of activeSubjects){ if(subj.includes(tok)) return true; }
      return false;
    });
  }
  const scored = pool.map(c => ({c, s: scoreChunk(qTokens, c)})).filter(x => x.s > 0);
  scored.sort((a,b) => b.s - a.s);
  return scored.slice(0, topN).map(x => x.c);
}

/* ---------- System prompt ---------- */

const SYSTEM_BASE = `You are Mayorcity B&F AI, a personal banking & finance assistant. Your specialism is Banking & Finance, and you also cover Ethics & Corporate Governance, Accounting, Insurance, Economics, Mathematics of Finance, Monetary Policy, Public Administration, and Law, using the student's own course materials.

Rules:
- Ground your explanations in the CONTEXT EXCERPTS provided below, which come from the student's actual study packs and past-question banks (mostly Chartered Institute of Bankers of Nigeria intermediate/diploma material).
- When the context contains directly relevant material, use it, and mention which document it's from (e.g. "per your Digital Banking Study Pack..."). When the context is thin or irrelevant to the question, say so plainly and still give your best general finance/banking explanation — do not pretend the excerpts cover something they don't.
- The study packs currently loaded do not yet include dedicated Mathematics of Finance or Monetary Policy source documents unless the student has added them. For questions on those topics with no matching context, answer from general knowledge (e.g. time value of money, interest calculations, MPR/CRR/OMO, inflation targeting) and note that this answer isn't grounded in an uploaded study pack.
- Prioritize accuracy and clarity over length. Use short paragraphs or bullet points. Define key terms simply, then build up.
- If a question is a past exam MCQ, explain the reasoning for the correct answer rather than only stating a letter.
- Stay encouraging and exam-focused, like a knowledgeable tutor, not a generic chatbot.
- Never restate, paraphrase, or acknowledge the question, and never announce what you're about to do ("Sure, here's...", "I'll explain...", "This is a great question about...", "Let me answer the following in bullet points as requested..."). Go straight into the substantive answer itself, with no preamble.
- Format with light markdown, since this interface renders it: use **bold** (double asterisks only) for key terms and to open each short section, "### " for section headers on their own line, "- " for bullet lists, "1. " for numbered lists, and a blank line between paragraphs. Never use single-asterisk emphasis like *this* — always double asterisks for anything bold, and plain text otherwise. Do NOT use tables, links, code blocks for prose, images, or nested/multiple formatting layers — keep it simple and skimmable, not a wall of text.
- For any mathematical or financial FORMULA (interest, present/future value, ratios, etc.), wrap the whole formula in single backticks so it renders in a proper formula style, and use plain-ASCII notation inside: "^" for exponents (e.g. \`FV = PV(1+r)^n\`), "_" for subscripts (e.g. \`FV_n\`), and "×" and "÷" instead of "*" and "/". Keep formulas on their own line, separate from surrounding prose.
- If an ATTACHED DOCUMENT is provided below, it was uploaded by the student just for this conversation (not part of their permanent study packs). Treat it as authoritative for this session: answer questions about it directly, and if asked to generate practice questions, a summary, or a quiz from it, base that entirely on its actual content rather than inventing material.
- If the student's message includes an attached image (e.g. a scanned textbook page, a diagram, a past-question screenshot, or handwritten workings), examine it carefully and ground your answer in what's actually shown — read any text in it, and reference specific parts of the image where relevant.`;

function buildSystemPrompt(contextChunks, attachedText, attachedName){
  let prompt = SYSTEM_BASE;
  if(contextChunks.length === 0){
    prompt += "\n\nCONTEXT EXCERPTS: (none matched this question — answer from general banking/finance knowledge and say the study packs didn't have a clear match.)";
  } else {
    const blocks = contextChunks.map(c => `[Source: ${c.source} — ${c.subject}]\n${c.text}`).join("\n\n---\n\n");
    prompt += "\n\nCONTEXT EXCERPTS:\n\n" + blocks;
  }
  if(attachedText){
    prompt += `\n\nATTACHED DOCUMENT (temporary, this session only — filename: "${attachedName}"):\n\n${attachedText}`;
  }
  return prompt;
}

/* ---------- Mobile viewport height fix ---------- */
function setVH(){
  document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
setVH();
window.addEventListener('resize', setVH);
window.addEventListener('orientationchange', setVH);

/* ---------- Light markdown + formula renderer ---------- */
function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatFormulaInner(escaped){
  let out = escaped.replace(/\^\(([^)]+)\)/g, '<sup>$1</sup>');
  out = out.replace(/_\(([^)]+)\)/g, '<sub>$1</sub>');
  out = out.replace(/\^(-?[A-Za-z0-9.]+)/g, '<sup>$1</sup>');
  out = out.replace(/_(-?[A-Za-z0-9.]+)/g, '<sub>$1</sub>');
  out = out.replace(/\*/g, '&times;');
  return out;
}
function inlineFormat(s){
  s = s.replace(/`([^`]+)`/g, (m, inner) => '<code class="fx">' + formatFormulaInner(inner) + '</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return s;
}
function formatText(raw){
  const lines = raw.replace(/\r\n/g,'\n').split('\n');
  let html = '';
  let listType = null;
  function closeList(){
    if(listType){ html += listType === 'ul' ? '</ul>' : '</ol>'; listType = null; }
  }
  for(const rawLine of lines){
    const line = rawLine.trim();
    if(line === ''){ closeList(); continue; }
    if(/^#{1,4}\s+/.test(line)){
      closeList();
      html += `<div class="ans-h">${inlineFormat(escapeHtml(line.replace(/^#{1,4}\s+/, '')))}</div>`;
      continue;
    }
    if(/^(-{3,}|\*{3,})$/.test(line)){
      closeList();
      html += '<hr class="ans-rule">';
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)/);
    if(bullet){
      if(listType !== 'ul'){ closeList(); html += '<ul>'; listType = 'ul'; }
      html += `<li>${inlineFormat(escapeHtml(bullet[1]))}</li>`;
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    if(numbered){
      if(listType !== 'ol'){ closeList(); html += '<ol>'; listType = 'ol'; }
      html += `<li>${inlineFormat(escapeHtml(numbered[1]))}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inlineFormat(escapeHtml(line))}</p>`;
  }
  closeList();
  return html;
}

/* ---------- DOM refs ---------- */
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const emptyState = document.getElementById('emptyState');
const headerEl = document.getElementById('appHeader');
const newChatBtn = document.getElementById('newChatBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const attachRow = document.getElementById('attachRow');
const attachName = document.getElementById('attachName');
const attachStatus = document.getElementById('attachStatus');
const attachRemove = document.getElementById('attachRemove');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');

let history = [];       // {role, content} sent to the API
let transcript = [];    // {role, text, sources} persisted to localStorage for display
const STORAGE_KEY = 'mb_chat_v1';

function persist(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(transcript)); }catch(e){ /* storage unavailable — ignore */ }
}

function addMsg(role, text, sources, opts){
  opts = opts || {};
  if(emptyState) emptyState.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');

  if(role === 'user'){
    div.textContent = text;
  } else {
    div.innerHTML = formatText(text);
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy answer text');
    copyBtn.addEventListener('click', async () => {
      try{
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
        copyBtn.classList.add('copied');
      }catch(e){
        copyBtn.textContent = 'Error';
      }
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1400);
    });
    div.appendChild(copyBtn);
  }

  if(sources && sources.length){
    const uniqMap = new Map();
    for(const s of sources){
      if(!uniqMap.has(s.source)) uniqMap.set(s.source, s.excerpt || '');
    }
    const wrap = document.createElement('div');
    wrap.className = 'src-wrap';
    const names = [...uniqMap.keys()];
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'src-toggle';
    toggle.textContent = 'Referenced: ' + names.join(', ') + '  \u25B8';
    const detail = document.createElement('div');
    detail.className = 'src-detail';
    detail.style.display = 'none';
    for(const [name, excerpt] of uniqMap){
      const item = document.createElement('div');
      item.className = 'src-item';
      const b = document.createElement('strong');
      b.textContent = name;
      item.appendChild(b);
      const p = document.createElement('div');
      p.className = 'src-excerpt';
      p.textContent = excerpt + (excerpt.length >= 260 ? '…' : '');
      item.appendChild(p);
      detail.appendChild(item);
    }
    toggle.addEventListener('click', () => {
      const open = detail.style.display !== 'none';
      detail.style.display = open ? 'none' : 'block';
      toggle.textContent = 'Referenced: ' + names.join(', ') + (open ? '  \u25B8' : '  \u25BE');
    });
    wrap.appendChild(toggle);
    wrap.appendChild(detail);
    div.appendChild(wrap);
  }

  const wasNearBottom = isNearBottom();
  messagesEl.appendChild(div);
  if(wasNearBottom){
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else if(role !== 'user'){
    showScrollBtn(true);
  }

  if(opts.record !== false){
    transcript.push({
      role,
      text,
      sources: (sources && sources.length) ? sources.map(s => ({source: s.source, excerpt: s.excerpt || ''})) : null
    });
    persist();
  }
  return div;
}

function isNearBottom(){
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
}
function showScrollBtn(show){
  scrollBottomBtn.hidden = !show;
}

function addTyping(){
  const wasNearBottom = isNearBottom();
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';
  div.setAttribute('aria-label', 'Assistant is typing');
  div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  messagesEl.appendChild(div);
  if(wasNearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}
function removeTyping(){
  const t = document.getElementById('typingIndicator');
  if(t) t.remove();
}

/* ---------- Attach-a-file (temporary, this session only) ---------- */
// Pinned to an older PDF.js release deliberately: 6.x's worker bundle requires Promise.try,
// a JS feature only broadly supported in browsers since ~Jan 2025, which breaks on plenty of
// real devices with a cryptic "Promise.try is not a function" error. 4.3.136 is well-tested,
// still ESM (.mjs) compatible, and doesn't hit that wall.
const PDFJS_VERSION = '4.3.136';
let attachedFile = null; // { name, type: 'text'|'image', text? , dataUrl? }
let pdfjsLibPromise = null;

function loadPdfJs(){
  if(!pdfjsLibPromise){
    pdfjsLibPromise = import(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`).then(mod => {
      mod.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsLibPromise;
}

async function extractPdfText(file){
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 80);
  for(let i = 1; i <= maxPages; i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n\n';
    if(text.length > 60000) break;
  }
  return text.trim();
}

const ATTACH_CHAR_LIMIT = 20000;          // ~5k tokens of document text, safe for a 128k-context model
const MAX_DOC_BYTES = 25 * 1024 * 1024;   // 25MB for PDF/txt/md
const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // 30MB raw upload — we compress it down before sending, see below
const IMAGE_MAX_DIMENSION = 1600;         // longest side, px, after compression
const IMAGE_JPEG_QUALITY = 0.82;

function isImageFile(file){
  return !!(file.type && file.type.startsWith('image/'));
}

/* Downscale + re-encode as JPEG client-side so even large phone photos fit comfortably
   under Groq's request-size limits, instead of just hard-rejecting big files. */
async function compressImage(file){
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read the image file'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Could not decode this image'));
    im.src = dataUrl;
  });
  let { width, height } = img;
  if(width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION){
    const scale = IMAGE_MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if(!ctx) throw new Error('Canvas not supported in this browser');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
}

function setAttachRow(name, statusText, isError){
  attachRow.hidden = false;
  attachName.textContent = name;
  attachStatus.textContent = statusText || '';
  attachRow.classList.toggle('attach-error', !!isError);
}
function clearAttachment(){
  attachedFile = null;
  attachRow.hidden = true;
  attachRow.classList.remove('attach-error');
  fileInput.value = '';
}
function describeError(err){
  if(!err) return 'unknown error';
  return err.message || err.name || String(err);
}

async function handleFileSelected(file){
  if(!file) return;
  const image = isImageFile(file);
  const limit = image ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if(file.size > limit){
    setAttachRow(file.name, `Too large (max ${Math.round(limit / (1024*1024))}MB)`, true);
    attachedFile = null;
    return;
  }

  setAttachRow(file.name, image ? 'Processing image…' : 'Reading…', false);
  try{
    if(image){
      const dataUrl = await compressImage(file);
      attachedFile = { name: file.name, type: 'image', dataUrl };
      setAttachRow(file.name, 'Attached (image)', false);
      return;
    }
    let text;
    const lower = file.name.toLowerCase();
    if(lower.endsWith('.pdf')){
      text = await extractPdfText(file);
    } else {
      text = await file.text();
    }
    text = (text || '').trim();
    if(!text){
      setAttachRow(file.name, 'No readable text found (scanned PDF with no text layer?)', true);
      attachedFile = null;
      return;
    }
    let truncated = false;
    if(text.length > ATTACH_CHAR_LIMIT){
      text = text.slice(0, ATTACH_CHAR_LIMIT);
      truncated = true;
    }
    attachedFile = { name: file.name, type: 'text', text };
    setAttachRow(file.name, truncated ? 'Attached (truncated to fit)' : 'Attached', false);
  }catch(err){
    console.error(err);
    setAttachRow(file.name, 'Could not read this file — ' + describeError(err), true);
    attachedFile = null;
  }
}

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFileSelected(fileInput.files[0]));
attachRemove.addEventListener('click', clearAttachment);

function clearRegenerateButtons(){
  document.querySelectorAll('.regen-btn').forEach(b => b.remove());
}
function addRegenerateButton(div, question){
  clearRegenerateButtons();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'regen-btn';
  btn.textContent = 'Regenerate';
  btn.addEventListener('click', () => {
    div.remove();
    if(transcript.length && transcript[transcript.length - 1].role === 'bot'){
      transcript.pop();
      persist();
    }
    if(history.length && history[history.length - 1].role === 'assistant'){
      history.pop();
    }
    ask(question, {isRegenerate: true});
  });
  div.appendChild(btn);
}

async function ask(question, opts){
  opts = opts || {};
  if(!question || !question.trim()) return;
  const q = question.trim();
  if(!opts.isRegenerate){
    addMsg('user', q);
    history.push({role:'user', content: q});
  }
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  inputEl.disabled = true;
  addTyping();

  const chunks = retrieve(q, 9);
  const attachedText = attachedFile && attachedFile.type === 'text' ? attachedFile.text : null;
  const attachedName = attachedFile && attachedFile.type === 'text' ? attachedFile.name : null;
  const attachedImage = attachedFile && attachedFile.type === 'image' ? attachedFile.dataUrl : null;
  const system = buildSystemPrompt(chunks, attachedText, attachedName);
  const sourceEntries = chunks.map(c => ({
    source: c.source,
    excerpt: (c.text || '').replace(/\s+/g, ' ').trim().slice(0, 260)
  }));

  try{
    const resp = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        system: system,
        messages: history.slice(-10),
        image: attachedImage || undefined
      })
    });
    if(!resp.ok){
      throw new Error("Server responded with status " + resp.status);
    }
    const data = await resp.json();
    removeTyping();
    let text = "Sorry, I couldn't generate a response.";
    if(data && data.content){
      text = data.content.map(b => b.text || "").join("\n").trim() || text;
    }
    const botDiv = addMsg('bot', text, sourceEntries);
    history.push({role:'assistant', content: text});
    addRegenerateButton(botDiv, q);
  }catch(err){
    removeTyping();
    const errDiv = addMsg('bot', "Something went wrong reaching the model. Please check your connection and try again.", null, {record:false});
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => ask(q));
    errDiv.appendChild(retryBtn);
    console.error(err);
  }finally{
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

sendBtn.addEventListener('click', () => ask(inputEl.value));
inputEl.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    ask(inputEl.value);
  }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
});
document.querySelectorAll('.sugg').forEach(el => {
  el.addEventListener('click', () => ask(el.dataset.q));
});

/* ---------- Subject chips: click to focus retrieval on one or more subjects ---------- */
function toggleChip(chip){
  const isActive = chip.classList.toggle('active');
  chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  const tokens = (chip.dataset.subjects || '').split(',').map(t => t.trim()).filter(Boolean);
  for(const t of tokens){
    if(isActive) activeSubjects.add(t); else activeSubjects.delete(t);
  }
}
document.querySelectorAll('.chip').forEach(chip => {
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.setAttribute('aria-pressed', 'false');
  chip.addEventListener('click', () => toggleChip(chip));
  chip.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      toggleChip(chip);
    }
  });
});

/* ---------- Collapse header chips/tagline on scroll to give messages more room ---------- */
let headerCollapsed = false;
messagesEl.addEventListener('scroll', () => {
  const shouldCollapse = messagesEl.scrollTop > 28;
  if(shouldCollapse !== headerCollapsed){
    headerCollapsed = shouldCollapse;
    headerEl.classList.toggle('compact', headerCollapsed);
  }
  if(isNearBottom()) showScrollBtn(false);
});
scrollBottomBtn.addEventListener('click', () => {
  messagesEl.scrollTop = messagesEl.scrollHeight;
  showScrollBtn(false);
});

/* ---------- New chat ---------- */
newChatBtn.addEventListener('click', () => {
  history = [];
  transcript = [];
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  document.querySelectorAll('.chip.active').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-pressed','false'); });
  activeSubjects.clear();
  clearAttachment();
  showScrollBtn(false);
  messagesEl.innerHTML = '';
  messagesEl.appendChild(emptyState);
  emptyState.style.display = '';
  headerEl.classList.remove('compact');
  headerCollapsed = false;
  messagesEl.scrollTop = 0;
  inputEl.focus();
});

/* ---------- Restore previous conversation, if any ---------- */
(function restore(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);
    if(!Array.isArray(saved) || saved.length === 0) return;
    let lastDiv = null;
    for(const entry of saved){
      lastDiv = addMsg(entry.role, entry.text, entry.sources, {record:false});
      history.push({role: entry.role === 'user' ? 'user' : 'assistant', content: entry.text});
    }
    transcript = saved;
    const last = saved[saved.length - 1];
    const prev = saved[saved.length - 2];
    if(last && last.role === 'bot' && prev && prev.role === 'user' && lastDiv){
      addRegenerateButton(lastDiv, prev.text);
    }
  }catch(e){ /* corrupt or unavailable storage — start fresh */ }
})();
