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

function retrieve(query, topN=9){
  const qTokens = tokenize(query);
  if(qTokens.length === 0) return [];
  const scored = KB.map(c => ({c, s: scoreChunk(qTokens, c)})).filter(x => x.s > 0);
  scored.sort((a,b) => b.s - a.s);
  return scored.slice(0, topN).map(x => x.c);
}

/* ---------- System prompt ---------- */

const SYSTEM_BASE = `You are Mayorcity B&F AI, a personal banking & finance assistant. Your specialism is Banking & Finance, and you also cover Ethics & Corporate Governance, Accounting, Insurance, Economics, Mathematics of Finance, Monetary Policy, Public Administration, and Law, using the student's own course materials.

Rules:
- Ground your explanations in the CONTEXT EXCERPTS provided below, which come from the student's actual study packs and past-question banks (mostly Chartered Institute of Bankers of Nigeria intermediate/diploma material).
- When the context contains directly relevant material, use it, and mention which document it's from (e.g. "per your Digital Banking Study Pack..."). When the context is thin or irrelevant to the question, say so plainly and still give your best general finance/banking explanation — do not pretend the excerpts cover something they don't.
- The study packs currently loaded do not yet include dedicated Mathematics of Finance or Monetary Policy source documents. For questions on those topics, answer from general knowledge (e.g. time value of money, interest calculations, MPR/CRR/OMO, inflation targeting) and note that this answer isn't grounded in an uploaded study pack, unlike the core four subjects.
- Prioritize accuracy and clarity over length. Use short paragraphs or bullet points. Define key terms simply, then build up.
- If a question is a past exam MCQ, explain the reasoning for the correct answer rather than only stating a letter.
- Stay encouraging and exam-focused, like a knowledgeable tutor, not a generic chatbot.
- Format with light markdown, since this interface renders it: use **bold** for key terms and to open each short section, "### " for section headers on their own line, "- " for bullet lists, "1. " for numbered lists, and a blank line between paragraphs. Do NOT use tables, links, code blocks, images, or nested/multiple formatting layers — keep it simple and skimmable, not a wall of text.`;

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

/* ---------- Light markdown renderer (bold, headers, lists, dividers) ---------- */
function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function inlineFormat(s){
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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

let history = [];

function addMsg(role, text, sources){
  if(emptyState) emptyState.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  if(role === 'user'){
    div.textContent = text;
  } else {
    div.innerHTML = formatText(text);
  }
  if(sources && sources.length){
    const s = document.createElement('span');
    s.className = 'src';
    const uniq = [...new Set(sources.map(c => c.source))];
    s.textContent = 'Referenced: ' + uniq.join(', ');
    div.appendChild(s);
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  addMsg('user', question.trim());
  history.push({role:'user', content: question.trim()});
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  inputEl.disabled = true;
  addTyping();

  const chunks = retrieve(question, 9);
  const system = buildSystemPrompt(chunks);

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
    addMsg('bot', text, chunks);
    history.push({role:'assistant', content: text});
  }catch(err){
    removeTyping();
    addMsg('bot', "Something went wrong reaching the model. Please check your connection and try again.");
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
  messagesEl.innerHTML = '';
  messagesEl.appendChild(emptyState);
  emptyState.style.display = '';
  headerEl.classList.remove('compact');
  headerCollapsed = false;
  messagesEl.scrollTop = 0;
  inputEl.focus();
});
