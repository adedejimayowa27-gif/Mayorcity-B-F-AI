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
- Format with light markdown, since this interface renders it: use **bold** for key terms and to open each short section, "### " for section headers on their own line, "- " for bullet lists, "1. " for numbered lists, and a blank line between paragraphs. Do NOT use tables, links, code blocks for prose, images, or nested/multiple formatting layers — keep it simple and skimmable, not a wall of text.
- For any mathematical or financial FORMULA (interest, present/future value, ratios, etc.), wrap the whole formula in single backticks so it renders in a proper formula style, and use plain-ASCII notation inside: "^" for exponents (e.g. \`FV = PV(1+r)^n\`), "_" for subscripts (e.g. \`FV_n\`), and "×" and "÷" instead of "*" and "/". Keep formulas on their own line, separate from surrounding prose.`;

function buildSystemPrompt(contextChunks){
  if(contextChunks.length === 0){
    return SYSTEM_BASE + "\n\nCONTEXT EXCERPTS: (none matched this question — answer from general banking/finance knowledge and say the study packs didn't have a clear match.)";
  }
  const blocks = contextChunks.map(c => `[Source: ${c.source} — ${c.subject}]\n${c.text}`).join("\n\n---\n\n");
  return SYSTEM_BASE + "\n\nCONTEXT EXCERPTS:\n\n" + blocks;
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

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;

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

function addTyping(){
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';
  div.setAttribute('aria-label', 'Assistant is typing');
  div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function removeTyping(){
  const t = document.getElementById('typingIndicator');
  if(t) t.remove();
}

async function ask(question){
  if(!question || !question.trim()) return;
  const q = question.trim();
  addMsg('user', q);
  history.push({role:'user', content: q});
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  inputEl.disabled = true;
  addTyping();

  const chunks = retrieve(q, 9);
  const system = buildSystemPrompt(chunks);
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
        messages: history.slice(-10)
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
    addMsg('bot', text, sourceEntries);
    history.push({role:'assistant', content: text});
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
});

/* ---------- New chat ---------- */
newChatBtn.addEventListener('click', () => {
  history = [];
  transcript = [];
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  document.querySelectorAll('.chip.active').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-pressed','false'); });
  activeSubjects.clear();
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
    for(const entry of saved){
      addMsg(entry.role, entry.text, entry.sources, {record:false});
      history.push({role: entry.role === 'user' ? 'user' : 'assistant', content: entry.text});
    }
    transcript = saved;
  }catch(e){ /* corrupt or unavailable storage — start fresh */ }
})();
