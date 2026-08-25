// site/js/admin.js
// Drives admin.html: user approval management + knowledge base uploads.
// All privileged work happens server-side in netlify/functions/admin-users.js and
// admin-kb.js, which re-verify the caller is an admin on every single request — this
// file just calls them with the current Supabase access token attached.

let allUsers = [];
let currentFilter = 'all';

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function formatDate(iso){
  if(!iso) return 'Never';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return 'Never';
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}

async function apiCall(path, opts){
  opts = opts || {};
  const token = await getAccessToken();
  const resp = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {'Authorization': 'Bearer ' + token} : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await resp.json().catch(() => ({}));
  if(!resp.ok){
    throw new Error(data.error || `Request failed (${resp.status})`);
  }
  return data;
}

/* ---------- Users ---------- */

async function loadUsers(){
  const listEl = document.getElementById('usersList');
  try{
    const data = await apiCall('/.netlify/functions/admin-users');
    allUsers = data.users || [];
    updateCounts();
    renderUsers();
  }catch(e){
    listEl.innerHTML = `<p class="admin-empty">Couldn't load users: ${escapeHtml(e.message)}</p>`;
  }
}

function updateCounts(){
  document.getElementById('countAll').textContent = allUsers.length;
  document.getElementById('countPending').textContent = allUsers.filter(u => u.status === 'pending').length;
  document.getElementById('countApproved').textContent = allUsers.filter(u => u.status === 'approved').length;
  document.getElementById('countRejected').textContent = allUsers.filter(u => u.status === 'rejected').length;
}

function renderUsers(){
  const listEl = document.getElementById('usersList');
  const filtered = currentFilter === 'all' ? allUsers : allUsers.filter(u => u.status === currentFilter);

  if(!filtered.length){
    listEl.innerHTML = `<p class="admin-empty">No ${currentFilter === 'all' ? '' : currentFilter + ' '}users yet.</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(u => {
    const badges = [`<span class="status-badge ${u.status}">${escapeHtml(u.status)}</span>`];
    if(u.is_admin) badges.push(`<span class="status-badge admin-badge">Admin</span>`);

    const actions = [];
    if(u.status !== 'approved') actions.push(`<button class="btn-sm btn-approve" data-action="approved" data-id="${u.id}" type="button">Approve</button>`);
    if(u.status !== 'rejected') actions.push(`<button class="btn-sm btn-reject" data-action="rejected" data-id="${u.id}" type="button">Reject</button>`);
    if(u.status !== 'pending') actions.push(`<button class="btn-sm btn-reset" data-action="pending" data-id="${u.id}" type="button">Reset</button>`);

    return `
      <div class="user-card" data-user-id="${u.id}">
        <div class="user-card-main">
          <div class="user-card-name">${escapeHtml(u.name)} ${badges.join(' ')}</div>
          <div class="user-card-matric">${escapeHtml(u.matric_number)}</div>
          <div class="user-card-meta">
            <span><b>${u.message_count || 0}</b> messages</span>
            <span>Last active: ${formatDate(u.last_active_at)}</span>
            <span>Joined: ${formatDate(u.created_at)}</span>
          </div>
        </div>
        <div class="user-card-actions">${actions.join('')}</div>
      </div>
    `;
  }).join('');
}

async function handleUserAction(id, status, btn){
  const card = btn.closest('.user-card');
  const allBtns = card.querySelectorAll('button');
  allBtns.forEach(b => b.disabled = true);
  try{
    await apiCall('/.netlify/functions/admin-users', { method: 'POST', body: { id, status } });
    const u = allUsers.find(x => x.id === id);
    if(u) u.status = status;
    updateCounts();
    renderUsers();
  }catch(e){
    alert('Failed to update status: ' + e.message);
    allBtns.forEach(b => b.disabled = false);
  }
}

document.getElementById('usersList') && document.getElementById('usersList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  handleUserAction(btn.getAttribute('data-id'), btn.getAttribute('data-action'), btn);
});

document.getElementById('tabRow').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if(!btn) return;
  currentFilter = btn.getAttribute('data-filter');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderUsers();
});

/* ---------- Knowledge base ---------- */

async function loadDocuments(){
  const listEl = document.getElementById('docsList');
  try{
    const data = await apiCall('/.netlify/functions/admin-kb');
    renderDocuments(data.documents || []);
  }catch(e){
    listEl.innerHTML = `<p class="admin-empty">Couldn't load documents: ${escapeHtml(e.message)}</p>`;
  }
}

function renderDocuments(docs){
  const listEl = document.getElementById('docsList');
  if(!docs.length){
    listEl.innerHTML = `<p class="admin-empty">No documents uploaded yet.</p>`;
    return;
  }
  listEl.innerHTML = docs.map(d => `
    <div class="doc-card" data-doc-id="${d.id}">
      <div class="doc-card-main">
        <div class="doc-card-title">${escapeHtml(d.title)}</div>
        <div class="doc-card-meta">${escapeHtml(d.subject)} &middot; ${d.chunk_count} chunk${d.chunk_count === 1 ? '' : 's'} &middot; added ${formatDate(d.created_at)}</div>
      </div>
      <button class="btn-sm btn-reject" data-delete-id="${d.id}" type="button">Delete</button>
    </div>
  `).join('');
}

document.getElementById('docsList') && document.getElementById('docsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-delete-id]');
  if(!btn) return;
  const id = btn.getAttribute('data-delete-id');
  const card = btn.closest('.doc-card');
  const title = card.querySelector('.doc-card-title').textContent;
  if(!confirm(`Delete "${title}" from the knowledge base? This can't be undone.`)) return;
  btn.disabled = true;
  try{
    await apiCall('/.netlify/functions/admin-kb', { method: 'DELETE', body: { id } });
    card.remove();
  }catch(e){
    alert('Failed to delete: ' + e.message);
    btn.disabled = false;
  }
});

// File upload fills the textarea with its text content (plain text / markdown only).
const docFileInput = document.getElementById('docFile');
docFileInput && docFileInput.addEventListener('change', () => {
  const file = docFileInput.files && docFileInput.files[0];
  const label = document.getElementById('fileDropLabel');
  const textarea = document.getElementById('docText');
  const titleInput = document.getElementById('docTitle');
  if(!file) return;
  label.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    textarea.value = String(reader.result || '');
    document.getElementById('docTextHint').textContent = `Loaded ${textarea.value.length.toLocaleString()} characters from ${file.name}.`;
    if(!titleInput.value.trim()){
      titleInput.value = file.name.replace(/\.(txt|md)$/i, '');
    }
  };
  reader.onerror = () => {
    document.getElementById('docTextHint').textContent = "Couldn't read that file — try pasting the text directly instead.";
  };
  reader.readAsText(file);
});

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('uploadError');
  const btn = document.getElementById('uploadBtn');
  errorEl.classList.remove('show');

  const title = document.getElementById('docTitle').value.trim();
  const subject = document.getElementById('docSubject').value.trim() || 'Uploaded Material';
  const text = document.getElementById('docText').value.trim();
  const file = docFileInput.files && docFileInput.files[0];

  if(!title){ errorEl.textContent = 'Please enter a title.'; errorEl.classList.add('show'); return; }
  if(!text){ errorEl.textContent = 'Please paste some text or choose a file.'; errorEl.classList.add('show'); return; }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>Uploading\u2026';

  try{
    const data = await apiCall('/.netlify/functions/admin-kb', {
      method: 'POST',
      body: { title, subject, text, filename: file ? file.name : null }
    });
    document.getElementById('uploadForm').reset();
    document.getElementById('fileDropLabel').textContent = 'Choose a file, or paste text below';
    document.getElementById('docTextHint').innerHTML = '&nbsp;';
    await loadDocuments();
    btn.textContent = originalLabel;
    btn.disabled = false;
    alert(`Uploaded "${title}" — split into ${data.chunks} chunk${data.chunks === 1 ? '' : 's'} and now searchable by the AI.`);
  }catch(err){
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
    btn.textContent = originalLabel;
    btn.disabled = false;
  }
});

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAdminPage(); // redirects non-admins back to index.html
  if(!profile) return;
  loadUsers();
  loadDocuments();
});
