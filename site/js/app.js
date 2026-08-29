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

/* ---------- Admin-uploaded knowledge base (merged into the same KB array/retrieve()
   pool as the built-in study packs from js/kb-parts/) ---------- */
window.KB = window.KB || [];
const KB_EXTRA_READY = (async function loadExtraKB(){
  try{
    if(typeof supabaseClient === 'undefined') return;
    const { data, error } = await supabaseClient
      .from('kb_chunks')
      .select('source, subject, priority, text');
    if(error){
      // Most likely cause: no Row Level Security SELECT policy on kb_chunks for
      // logged-in users (this read uses the public anon key, unlike the admin
      // panel's uploads, which go through a server function with the secret key
      // and so bypass RLS entirely). See supabase-kb-chunks-rls.sql.
      console.error('Failed to load admin-uploaded knowledge base chunks (check kb_chunks RLS policy):', error);
      return;
    }
    if(!data || !data.length) return;
    window.KB = window.KB.concat(data);
  }catch(e){
    console.error('Failed to load admin-uploaded knowledge base chunks:', e);
  }
})();

/* ---------- System prompt ---------- */

const SYSTEM_BASE = `You are Mayorcity B&F AI, a personal banking & finance assistant. Your specialism is Banking & Finance, and you also cover Ethics & Corporate Governance, Accounting, Insurance, Economics, Mathematics of Finance, Monetary Policy, Public Administration, and Law, using the student's own course materials.

Rules:
- Ground your explanations in the CONTEXT EXCERPTS provided below, which come from the student's own uploaded study packs and past-question banks. Most of this material is Chartered Institute of Bankers of Nigeria (CIBN) intermediate/diploma content, but not all of it is — some sources (e.g. FIN 203 Mathematics of Finance notes, and any other material the student adds) are general course material, not CIBN-specific. Do not frame every answer as being about CIBN or CIBN exams by default. Only mention CIBN, "your CIBN pack," exam-body terminology, or CIBN-specific framing when the matched context excerpt is actually from CIBN-sourced material, or the student's question itself is clearly about a CIBN exam/paper. For general banking, finance, or mathematics-of-finance questions where the matched context isn't CIBN material (or there's no match), just answer the question on its own terms — reference the actual source name/subject if one matched, or answer from general knowledge if none did, without inventing a CIBN angle that isn't there.
- When the context contains directly relevant material, use it, and mention which document it's from using its actual subject (e.g. "per your Digital Banking Study Pack..." or "per your FIN 203 notes..."). When the context is thin or irrelevant to the question, say so plainly and still give your best general finance/banking explanation — do not pretend the excerpts cover something they don't.
- Prioritize accuracy and clarity over length. Use short paragraphs or bullet points. Define key terms simply, then build up.
- If a question is a past exam MCQ, explain the reasoning for the correct answer rather than only stating a letter.
- Stay encouraging and exam-focused, like a knowledgeable tutor, not a generic chatbot.
- Never restate, paraphrase, or acknowledge the question, and never announce what you're about to do ("Sure, here's...", "I'll explain...", "This is a great question about...", "Let me answer the following in bullet points as requested..."). Go straight into the substantive answer itself, with no preamble.
- Format with light markdown, since this interface renders it: use **bold** (double asterisks only) for key terms and to open each short section, "### " for section headers on their own line, "- " for bullet lists, "1. " for numbered lists, and a blank line between paragraphs. Never use single-asterisk emphasis like *this* — always double asterisks for anything bold, and plain text otherwise. Do NOT use links, code blocks for prose, images, or nested/multiple formatting layers — keep it simple and skimmable, not a wall of text.
- Tables ARE supported and render properly: use standard markdown table syntax (a header row, a "|---|---|" separator row directly under it, then data rows, e.g. "| Feature | Bank A | Bank B |" then "|---|---|---|" then the data rows) whenever you're comparing options, rates, or structured line items side by side — that's clearer than prose or a bullet list for that kind of content. Don't force a table where a short list or a couple of sentences would do.
- For any mathematical or financial FORMULA (interest, present/future value, ratios, etc.), wrap the whole formula in single backticks so it renders in a proper formula style, and use plain-ASCII notation inside: "^" for exponents (e.g. \`FV = PV(1+r)^n\`), "_" for subscripts (e.g. \`FV_n\`), and "×" and "÷" instead of "*" and "/". Keep formulas on their own line, separate from surrounding prose.
- If an ATTACHED DOCUMENT is provided below, it was uploaded by the student just for this conversation (not part of their permanent study packs). Treat it as authoritative for this session: answer questions about it directly, and if asked to generate practice questions, a summary, or a quiz from it, base that entirely on its actual content rather than inventing material.
- If the student's message includes an attached image (e.g. a scanned textbook page, a diagram, a past-question screenshot, or handwritten workings), examine it carefully and ground your answer in what's actually shown — read any text in it, and reference specific parts of the image where relevant.`;

const ABOUT_BLOCK = `

ABOUT THIS ASSISTANT (background only — do not volunteer this unprompted; bring it up only if the student explicitly asks who built this, who Adedeji Mayowa is, what Determined Minds or Mayorcity Emart are, or something equivalent):
Mayorcity B&F AI was built by Adedeji Mayowa — a Finance student at Lagos State University (LASU), a member of the Chartered Institute of Bankers of Nigeria (CIBN), Founder and Head Tutor at Determined Minds, a mentor with "The Better Version of Mayorcity," and Owner & CEO of Mayorcity Emart. If asked, answer factually and briefly from this, and don't invent further biographical detail beyond it.`;

function buildSystemPrompt(contextChunks, attachedText, attachedName){
  let prompt = SYSTEM_BASE + ABOUT_BLOCK;
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

/* ---------- PWA install support (Android/desktop Chrome "Install app" / iOS "Add to Home Screen") ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('Service worker registration failed:', err));
  });
}

(function setupInstallPrompt(){
  const installBtn = document.getElementById('installBtn');
  if(!installBtn) return;
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  if(isStandalone()){
    installBtn.hidden = true;
  } else if(isIos()){
    /* iOS Safari never fires beforeinstallprompt — show a button that explains
       the manual "Add to Home Screen" steps instead of a native prompt. */
    installBtn.hidden = false;
    installBtn.addEventListener('click', () => {
      alert('To install: tap the Share icon in Safari, then "Add to Home Screen".');
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if(!deferredPrompt) return;
    installBtn.hidden = true;
    deferredPrompt.prompt();
    try{ await deferredPrompt.userChoice; }catch(e){ /* ignore */ }
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    deferredPrompt = null;
  });
})();

/* ---------- Dark / light theme toggle ---------- */
(function setupThemeToggle(){
  const toggleBtn = document.getElementById('themeToggleBtn');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const THEME_KEY = 'mb_theme';
  const DARK_META = '#121114';
  const LIGHT_META = '#FBF7EC';

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    if(themeMeta) themeMeta.setAttribute('content', theme === 'light' ? LIGHT_META : DARK_META);
    if(toggleBtn) toggleBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  }

  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current);

  if(!toggleBtn) return;
  toggleBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){ /* storage unavailable — ignore */ }
  });
})();

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
function unescapeHtml(s){
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
/* Converts the ASCII formula notation the model is instructed to use (^, _, ×, ÷) into
   LaTeX so KaTeX can typeset it properly, instead of the plain <sup>/<sub> fallback. */
function asciiFormulaToLatex(raw){
  let s = raw;
  s = s.replace(/\^\(([^)]+)\)/g, '^{$1}');
  s = s.replace(/_\(([^)]+)\)/g, '_{$1}');
  s = s.replace(/\^(-?[A-Za-z0-9.]+)/g, '^{$1}');
  s = s.replace(/_(-?[A-Za-z0-9.]+)/g, '_{$1}');
  s = s.replace(/×/g, ' \\times ');
  s = s.replace(/÷/g, ' \\div ');
  s = s.replace(/\*/g, ' \\times ');
  return s;
}
function inlineFormat(s){
  s = s.replace(/`([^`]+)`/g, (m, inner) => {
    if(window.katex){
      try{
        const latex = asciiFormulaToLatex(unescapeHtml(inner));
        return '<span class="fx-katex">' + window.katex.renderToString(latex, {throwOnError:false, output:'html'}) + '</span>';
      }catch(e){ /* fall through to the plain ASCII formatter below */ }
    }
    return '<code class="fx">' + formatFormulaInner(inner) + '</code>';
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return s;
}
/* A markdown table row looks like "| a | b | c |" (or "a | b | c" without outer pipes).
   The separator row directly under the header ("|---|:---:|---:|") is what confirms it's
   really a table rather than a line that just happens to contain a pipe character. */
function isTableRow(line){
  return /\|/.test(line) && line.trim() !== '' && !/^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(line.trim());
}
function isTableSeparator(line){
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim());
}
function splitTableRow(line){
  let s = line.trim();
  if(s.startsWith('|')) s = s.slice(1);
  if(s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}
function renderTable(rows){
  const header = rows[0];
  const body = rows.slice(1);
  let html = '<div class="tbl-wrap"><table class="ans-table"><thead><tr>';
  for(const cell of header) html += `<th>${inlineFormat(escapeHtml(cell))}</th>`;
  html += '</tr></thead><tbody>';
  for(const r of body){
    html += '<tr>';
    for(let i=0;i<header.length;i++) html += `<td>${inlineFormat(escapeHtml(r[i] || ''))}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}
function formatText(raw){
  const lines = raw.replace(/\r\n/g,'\n').split('\n');
  let html = '';
  let listType = null;
  function closeList(){
    if(listType){ html += listType === 'ul' ? '</ul>' : '</ol>'; listType = null; }
  }
  for(let i=0;i<lines.length;i++){
    const line = lines[i].trim();
    if(line === ''){ closeList(); continue; }
    /* Table: a row containing "|", immediately followed by a "|---|---|" separator row. */
    if(isTableRow(line) && i+1 < lines.length && isTableSeparator(lines[i+1])){
      closeList();
      const tableRows = [splitTableRow(line)];
      let j = i+2;
      while(j < lines.length && isTableRow(lines[j].trim())){
        tableRows.push(splitTableRow(lines[j].trim()));
        j++;
      }
      html += renderTable(tableRows);
      i = j-1;
      continue;
    }
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

/* ---------- Draft autosave ----------
   Restores an in-progress, unsent question after an accidental refresh, closed
   tab, or crash — a half-typed exam question is genuinely annoying to lose. */
const DRAFT_KEY = 'mb_draft_message';
try{
  const savedDraft = localStorage.getItem(DRAFT_KEY);
  if(savedDraft){
    inputEl.value = savedDraft;
    requestAnimationFrame(() => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
    });
  }
}catch(e){ /* localStorage unavailable — draft autosave just won't persist */ }
const fileInput = document.getElementById('fileInput');
const attachRow = document.getElementById('attachRow');
const attachName = document.getElementById('attachName');
const attachStatus = document.getElementById('attachStatus');
const attachRemove = document.getElementById('attachRemove');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');
const historyToggleBtn = document.getElementById('historyToggleBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const historySidebar = document.getElementById('historySidebar');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
const sidebarNewChatBtn = document.getElementById('sidebarNewChatBtn');
const conversationList = document.getElementById('conversationList');
const exportChatBtn = document.getElementById('exportChatBtn');
const exportChatPdfBtn = document.getElementById('exportChatPdfBtn');
const aboutBtn = document.getElementById('aboutBtn');
const aboutModalOverlay = document.getElementById('aboutModalOverlay');
const aboutModalCloseBtn = document.getElementById('aboutModalCloseBtn');

document.body.classList.add('loaded');

let history = [];       // {role, content} sent to the API for the ACTIVE conversation
let transcript = [];    // {role, text, sources} for the ACTIVE conversation, persisted to localStorage

/* ---------- Multiple saved conversations ---------- */
const CONV_STORAGE_KEY = 'mb_conversations_v1';
const LEGACY_STORAGE_KEY = 'mb_chat_v1'; // pre-history-panel single-thread storage, migrated below
const ACTIVE_CONV_KEY = 'mb_active_conv_id';

let conversations = [];   // [{id, title, updatedAt, transcript:[{role,text,sources}]}]
let activeConvId = null;

function deriveTitle(list){
  const firstUser = list.find(m => m.role === 'user');
  if(!firstUser || !firstUser.text) return 'New chat';
  const words = firstUser.text.trim().replace(/\s+/g, ' ');
  return words.length > 42 ? words.slice(0, 42) + '…' : words;
}
function getActiveConv(){
  return conversations.find(c => c.id === activeConvId) || null;
}
function loadConversations(){
  try{
    const raw = localStorage.getItem(CONV_STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
    }
  }catch(e){ /* corrupt storage — fall through */ }
  // One-time migration from the old single-thread format, if present.
  try{
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if(legacyRaw){
      const legacy = JSON.parse(legacyRaw);
      if(Array.isArray(legacy) && legacy.length){
        return [{ id: 'c' + Date.now(), title: deriveTitle(legacy), updatedAt: Date.now(), transcript: legacy }];
      }
    }
  }catch(e){ /* ignore */ }
  return [];
}
function saveConversations(){
  try{ localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(conversations)); }catch(e){ /* storage unavailable — ignore */ }
}
function persist(){
  const conv = getActiveConv();
  if(!conv) return;
  conv.transcript = transcript;
  conv.updatedAt = Date.now();
  if(!conv.title || conv.title === 'New chat') conv.title = deriveTitle(transcript);
  saveConversations();
  renderConversationList();
}

function renderConversationList(){
  if(!conversationList) return;
  conversationList.innerHTML = '';
  if(!conversations.length){
    const hint = document.createElement('div');
    hint.className = 'conv-empty-hint';
    hint.textContent = 'No conversations yet — start one!';
    conversationList.appendChild(hint);
    return;
  }
  const sorted = conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  for(const conv of sorted){
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === activeConvId ? ' active' : '');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    const title = document.createElement('span');
    title.className = 'conv-item-title';
    title.textContent = conv.title || 'New chat';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'conv-item-delete';
    del.setAttribute('aria-label', 'Delete this conversation');
    del.innerHTML = '&times;';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(conv.id); });
    item.appendChild(title);
    item.appendChild(del);
    item.addEventListener('click', () => switchConversation(conv.id));
    item.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); switchConversation(conv.id); }
    });
    conversationList.appendChild(item);
  }
}

function resetChatUI(){
  history = [];
  transcript = [];
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
}

function renderMessagesFromTranscript(list){
  messagesEl.innerHTML = '';
  history = [];
  if(!list.length){
    messagesEl.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';
  let lastDiv = null;
  for(const entry of list){
    lastDiv = addMsg(entry.role, entry.text, entry.sources, {record:false});
    history.push({role: entry.role === 'user' ? 'user' : 'assistant', content: entry.text});
  }
  const last = list[list.length - 1];
  const prev = list[list.length - 2];
  if(last && last.role === 'bot' && prev && prev.role === 'user' && lastDiv){
    addRegenerateButton(lastDiv, prev.text);
  }
}

function startNewConversation(opts){
  opts = opts || {};
  const conv = { id: 'c' + Date.now() + Math.random().toString(36).slice(2,6), title: 'New chat', updatedAt: Date.now(), transcript: [] };
  conversations.unshift(conv);
  activeConvId = conv.id;
  try{ localStorage.setItem(ACTIVE_CONV_KEY, activeConvId); }catch(e){ /* ignore */ }
  saveConversations();
  resetChatUI();
  renderConversationList();
  if(!opts.silent) closeSidebar();
}

function switchConversation(id){
  const conv = conversations.find(c => c.id === id);
  if(!conv || id === activeConvId){ closeSidebar(); return; }
  activeConvId = id;
  try{ localStorage.setItem(ACTIVE_CONV_KEY, activeConvId); }catch(e){ /* ignore */ }
  document.querySelectorAll('.chip.active').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-pressed','false'); });
  activeSubjects.clear();
  clearAttachment();
  showScrollBtn(false);
  headerEl.classList.remove('compact');
  headerCollapsed = false;
  transcript = (conv.transcript || []).slice();
  renderMessagesFromTranscript(transcript);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  renderConversationList();
  closeSidebar();
}

function deleteConversation(id){
  const wasActive = id === activeConvId;
  conversations = conversations.filter(c => c.id !== id);
  saveConversations();
  if(wasActive){
    if(conversations.length){
      const next = conversations.slice().sort((a,b) => b.updatedAt - a.updatedAt)[0];
      activeConvId = null; // force switchConversation to actually run
      switchConversation(next.id);
      return; // switchConversation already re-renders the list
    }
    activeConvId = null;
    try{ localStorage.removeItem(ACTIVE_CONV_KEY); }catch(e){ /* ignore */ }
    resetChatUI();
  }
  renderConversationList();
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

    const imgBtn = document.createElement('button');
    imgBtn.type = 'button';
    imgBtn.className = 'copy-btn img-btn';
    imgBtn.textContent = 'Save as image';
    imgBtn.setAttribute('aria-label', 'Save this answer as an image');
    imgBtn.addEventListener('click', () => saveMessageAsImage(div, imgBtn));
    div.appendChild(imgBtn);

    if(opts.feedback !== false){
      const feedbackRow = document.createElement('div');
      feedbackRow.className = 'feedback-row';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'feedback-btn up';
      upBtn.setAttribute('aria-label', 'Good response');
      upBtn.innerHTML = '&#128077;';
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'feedback-btn down';
      downBtn.setAttribute('aria-label', 'Poor response');
      downBtn.innerHTML = '&#128078;';
      const thanks = document.createElement('span');
      thanks.className = 'feedback-thanks';
      thanks.hidden = true;
      thanks.textContent = 'Thanks for the feedback';
      function sendFeedback(rating){
        if(upBtn.disabled) return;
        upBtn.disabled = true;
        downBtn.disabled = true;
        (rating === 'up' ? upBtn : downBtn).classList.add('selected');
        thanks.hidden = false;
        const lastQuestion = [...history].reverse().find(m => m.role === 'user');
        fetch('/.netlify/functions/feedback', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            rating,
            question: (lastQuestion && lastQuestion.content) ? lastQuestion.content.slice(0, 500) : '',
            answer: text.slice(0, 1000)
          })
        }).catch(() => { /* best-effort — feedback isn't critical to the chat working */ });
      }
      upBtn.addEventListener('click', () => sendFeedback('up'));
      downBtn.addEventListener('click', () => sendFeedback('down'));
      feedbackRow.appendChild(upBtn);
      feedbackRow.appendChild(downBtn);
      feedbackRow.appendChild(thanks);
      div.appendChild(feedbackRow);
    }
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
    if(role === 'user'){
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      // Reveal the start of the new answer instead of snapping straight to its end,
      // so the person can read from the top and scroll down at their own pace.
      div.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
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
  if(!activeConvId){
    // First message from a fresh visitor (or after deleting every conversation) —
    // create the conversation on demand instead of showing an empty one upfront.
    startNewConversation({silent: true});
  }
  if(!opts.isRegenerate){
    addMsg('user', q);
    history.push({role:'user', content: q});
  }
  inputEl.value = '';
  inputEl.style.height = 'auto';
  try{ localStorage.removeItem(DRAFT_KEY); }catch(e){ /* ignore */ }
  sendBtn.disabled = true;
  inputEl.disabled = true;
  addTyping();

  // Give the admin-uploaded KB a moment to finish loading (usually already done by
  // the time anyone types) before retrieving, so even a first message can match
  // freshly-uploaded material — but never block chat indefinitely if it's slow/down.
  try{ await Promise.race([KB_EXTRA_READY, new Promise(res => setTimeout(res, 3000))]); }catch(e){ /* ignore */ }

  const chunks = retrieve(q, 9);
  const attachedText = attachedFile && attachedFile.type === 'text' ? attachedFile.text : null;
  const attachedName = attachedFile && attachedFile.type === 'text' ? attachedFile.name : null;
  const attachedImage = attachedFile && attachedFile.type === 'image' ? attachedFile.dataUrl : null;
  const system = buildSystemPrompt(chunks, attachedText, attachedName);
  const sourceEntries = chunks.map(c => ({
    source: c.source,
    excerpt: (c.text || '').replace(/\s+/g, ' ').trim().slice(0, 260)
  }));

  // Sends the chat request with a client-side timeout so a stalled connection surfaces as a
  // clear, retryable error instead of hanging indefinitely. Transient failures (timeouts,
  // dropped connections, 502/503/504 from the function) are retried once automatically before
  // anything is shown to the user — this is what most "Something went wrong reaching the model"
  // cases used to be: a single blip that a retry would have fixed anyway.
  async function sendChatRequest(){
    const accessToken = await getAccessToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try{
      const resp = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? {"Authorization": "Bearer " + accessToken} : {})
        },
        body: JSON.stringify({
          system: system,
          messages: history.slice(-10),
          image: attachedImage || undefined
        }),
        signal: controller.signal
      });
      if(!resp.ok){
        const e = new Error("Server responded with status " + resp.status);
        e.status = resp.status;
        throw e;
      }
      return await resp.json();
    }finally{
      clearTimeout(timeoutId);
    }
  }

  function isTransient(err){
    if(err && err.name === 'AbortError') return true;
    if(err && !err.status) return true; // network drop, no response at all
    if(err && (err.status === 502 || err.status === 503 || err.status === 504)) return true;
    return false;
  }

  try{
    let data;
    try{
      data = await sendChatRequest();
    }catch(err){
      if(isTransient(err)){
        await new Promise(res => setTimeout(res, 800));
        data = await sendChatRequest();
      }else{
        throw err;
      }
    }
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
    let errMsg = "Something went wrong reaching the model. Please check your connection and try again.";
    if(err && err.status === 429){
      errMsg = "The assistant is handling a lot of requests right now — please wait a few seconds and try again.";
    } else if(err && err.status === 403){
      errMsg = "Your account isn't approved for chat yet. Please wait for admin approval, or contact the admin if you believe this is a mistake.";
    } else if(err && err.status === 401){
      errMsg = "Your session has expired — please log in again.";
    } else if(err && err.status >= 500){
      errMsg = "The study assistant's server had a hiccup on that request. Please try again in a moment.";
    } else if(err && err.status === 400){
      errMsg = "That request couldn't be processed. Try rephrasing your question.";
    } else if(!navigator.onLine){
      errMsg = "You appear to be offline. Reconnect and try again.";
    }
    const errDiv = addMsg('bot', errMsg, null, {record:false, feedback:false});
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
  try{
    if(inputEl.value.trim()) localStorage.setItem(DRAFT_KEY, inputEl.value);
    else localStorage.removeItem(DRAFT_KEY);
  }catch(e){ /* ignore */ }
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
newChatBtn.addEventListener('click', () => startNewConversation());

/* ---------- History sidebar ---------- */
function openSidebar(){
  if(!historySidebar) return;
  historySidebar.classList.add('open');
  historySidebar.setAttribute('aria-hidden', 'false');
  sidebarOverlay.hidden = false;
  requestAnimationFrame(() => sidebarOverlay.classList.add('open'));
  historyToggleBtn.setAttribute('aria-expanded', 'true');
}
function closeSidebar(){
  if(!historySidebar) return;
  historySidebar.classList.remove('open');
  historySidebar.setAttribute('aria-hidden', 'true');
  sidebarOverlay.classList.remove('open');
  setTimeout(() => { sidebarOverlay.hidden = true; }, 220);
  historyToggleBtn.setAttribute('aria-expanded', 'false');
}
if(historyToggleBtn){
  historyToggleBtn.addEventListener('click', () => {
    historySidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  sidebarCloseBtn.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);
  sidebarNewChatBtn.addEventListener('click', () => startNewConversation());
}

/* ---------- About modal ---------- */
function openAbout(){ if(aboutModalOverlay) aboutModalOverlay.hidden = false; }
function closeAbout(){ if(aboutModalOverlay) aboutModalOverlay.hidden = true; }
if(aboutBtn){
  aboutBtn.addEventListener('click', () => { closeSidebar(); openAbout(); });
  aboutModalCloseBtn.addEventListener('click', closeAbout);
  aboutModalOverlay.addEventListener('click', (e) => { if(e.target === aboutModalOverlay) closeAbout(); });
}

/* ---------- Save a single answer as a PNG image ---------- */
/* Uses html2canvas (loaded via CDN in index.html) to render the message bubble itself,
   so bold text, tables, and KaTeX-typeset formulas all come through exactly as shown on screen. */
async function saveMessageAsImage(msgEl, triggerBtn){
  if(typeof html2canvas === 'undefined'){
    if(triggerBtn){ triggerBtn.textContent = 'Unavailable offline'; setTimeout(() => { triggerBtn.textContent = 'Save as image'; }, 1800); }
    return;
  }
  const original = triggerBtn ? triggerBtn.textContent : null;
  if(triggerBtn) triggerBtn.textContent = 'Rendering…';
  // Temporarily hide the action buttons themselves so they don't appear in the captured image.
  const actionButtons = msgEl.querySelectorAll('.copy-btn, .feedback-row');
  actionButtons.forEach(el => { el.dataset._prevDisplay = el.style.display; el.style.display = 'none'; });
  try{
    const canvas = await html2canvas(msgEl, {
      backgroundColor: getComputedStyle(msgEl).backgroundColor || '#ffffff',
      scale: 2,
      useCORS: true
    });
    canvas.toBlob((blob) => {
      if(!blob){ if(triggerBtn) triggerBtn.textContent = 'Error'; return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mayorcity-answer-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if(triggerBtn){ triggerBtn.textContent = 'Saved'; setTimeout(() => { triggerBtn.textContent = original; }, 1400); }
    }, 'image/png');
  }catch(e){
    if(triggerBtn){ triggerBtn.textContent = 'Error'; setTimeout(() => { triggerBtn.textContent = original; }, 1400); }
  }finally{
    actionButtons.forEach(el => { el.style.display = el.dataset._prevDisplay || ''; delete el.dataset._prevDisplay; });
  }
}

/* ---------- Export current chat as a PDF ---------- */
/* Renders the actual on-screen message list via html2canvas (so tables/formulas/bold come
   through), then slices that tall canvas across as many A4 pages as needed using jsPDF. */
async function exportChatAsPdf(){
  const conv = getActiveConv();
  if(!conv || !conv.transcript.length) return;
  if(typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined'){
    alert('PDF export needs an internet connection to load its renderer — please try again while online.');
    return;
  }
  if(!messagesEl) return;
  const { jsPDF } = window.jspdf;
  const canvas = await html2canvas(messagesEl, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    windowWidth: messagesEl.scrollWidth
  });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const imgWidthPx = canvas.width;
  const imgHeightPx = canvas.height;
  const pxToPt = usableWidth / imgWidthPx;
  const pageHeightPx = usableHeight / pxToPt;

  let renderedPx = 0;
  let pageNum = 0;
  while(renderedPx < imgHeightPx){
    const sliceHeightPx = Math.min(pageHeightPx, imgHeightPx - renderedPx);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = imgWidthPx;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(canvas, 0, renderedPx, imgWidthPx, sliceHeightPx, 0, 0, imgWidthPx, sliceHeightPx);
    const sliceData = sliceCanvas.toDataURL('image/png');
    if(pageNum > 0) pdf.addPage();
    pdf.addImage(sliceData, 'PNG', margin, margin, usableWidth, sliceHeightPx * pxToPt);
    renderedPx += sliceHeightPx;
    pageNum++;
  }
  pdf.save((conv.title || 'mayorcity-chat').replace(/[^\w\- ]+/g, '').trim().slice(0, 50) + '.pdf');
}

/* ---------- Export current chat as a text file ---------- */
if(exportChatBtn){
  exportChatBtn.addEventListener('click', () => {
    const conv = getActiveConv();
    if(!conv || !conv.transcript.length){ closeSidebar(); return; }
    const lines = conv.transcript.map(m => (m.role === 'user' ? 'You: ' : 'Mayorcity B&F AI: ') + m.text);
    const blob = new Blob([lines.join('\n\n')], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (conv.title || 'mayorcity-chat').replace(/[^\w\- ]+/g, '').trim().slice(0, 50) + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    closeSidebar();
  });
}
if(exportChatPdfBtn){
  exportChatPdfBtn.addEventListener('click', async () => {
    const original = exportChatPdfBtn.textContent;
    exportChatPdfBtn.textContent = 'Preparing PDF…';
    exportChatPdfBtn.disabled = true;
    try{
      await exportChatAsPdf();
    }catch(e){
      alert('Could not generate the PDF. Please try again.');
    }finally{
      exportChatPdfBtn.textContent = original;
      exportChatPdfBtn.disabled = false;
      closeSidebar();
    }
  });
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if(mod && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    startNewConversation();
  } else if(e.key === 'Escape'){
    if(aboutModalOverlay && !aboutModalOverlay.hidden) closeAbout();
    else if(historySidebar && historySidebar.classList.contains('open')) closeSidebar();
  }
});

/* ---------- Load saved conversations, if any ---------- */
(function bootstrapConversations(){
  // Previous conversations are loaded so they still appear (and can be reopened) in
  // the history sidebar — but we deliberately do NOT auto-resume the last one here.
  // Every fresh visit starts on a clean, empty chat. The first message sent will
  // create (and save) a new conversation on demand, same as clicking "New chat" —
  // see the `if(!activeConvId)` branch in ask().
  conversations = loadConversations();
  activeConvId = null;
  try{ localStorage.removeItem(ACTIVE_CONV_KEY); }catch(e){ /* ignore */ }
  saveConversations();
  renderConversationList();
})();
