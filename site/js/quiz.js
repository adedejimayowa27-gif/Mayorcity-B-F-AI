// site/js/quiz.js
// Drives quiz.html: generates a quiz via quiz-generate.js, marks it instantly and
// entirely client-side (both MCQ and True/False have one unambiguous correct answer),
// then reports the result to quiz-result.js to update the student's streak.

let currentTopic = '';
let currentQuestions = [];
let selectedCount = 8;
let answers = []; // selected option index per question, or null

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function showView(name){
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

async function apiCall(path, body){
  const token = await getAccessToken();
  const resp = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {'Authorization': 'Bearer ' + token} : {})
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if(!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

/* ---------- Setup screen ---------- */

document.querySelectorAll('.count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCount = parseInt(btn.getAttribute('data-count'), 10);
  });
});

document.getElementById('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('setupError');
  errorEl.classList.remove('show');

  const topic = document.getElementById('topicInput').value.trim();
  if(!topic){
    errorEl.textContent = 'Please enter a topic first.';
    errorEl.classList.add('show');
    return;
  }

  document.getElementById('loadingText').textContent = `Writing your quiz on "${topic}"\u2026`;
  showView('loading');

  try{
    const data = await apiCall('/.netlify/functions/quiz-generate', { topic, count: selectedCount });
    currentTopic = data.topic || topic;
    currentQuestions = data.questions || [];
    answers = new Array(currentQuestions.length).fill(null);
    renderQuiz();
    showView('quiz');
  }catch(err){
    showView('setup');
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  }
});

/* ---------- Quiz screen ---------- */

function renderQuiz(){
  document.getElementById('quizTopicTitle').textContent = currentTopic;
  updateProgress();

  const container = document.getElementById('questionsContainer');
  container.innerHTML = currentQuestions.map((q, qi) => `
    <div class="q-card" data-qi="${qi}">
      <div class="q-num">Question ${qi + 1} of ${currentQuestions.length}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      <div class="q-options">
        ${q.options.map((opt, oi) => `
          <button type="button" class="q-option" data-qi="${qi}" data-oi="${oi}">${escapeHtml(opt)}</button>
        `).join('')}
      </div>
      <div class="q-explanation"></div>
    </div>
  `).join('');

  container.querySelectorAll('.q-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = parseInt(btn.getAttribute('data-qi'), 10);
      const oi = parseInt(btn.getAttribute('data-oi'), 10);
      answers[qi] = oi;
      const card = btn.closest('.q-card');
      card.querySelectorAll('.q-option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      updateProgress();
    });
  });
}

function updateProgress(){
  const answered = answers.filter(a => a !== null).length;
  document.getElementById('quizProgress').textContent = `${answered} / ${currentQuestions.length} answered`;
}

document.getElementById('submitQuizBtn').addEventListener('click', async () => {
  const unanswered = answers.filter(a => a === null).length;
  if(unanswered > 0){
    if(!confirm(`You still have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`)) return;
  }

  // Mark instantly, client-side — every question has exactly one correct index.
  let score = 0;
  currentQuestions.forEach((q, qi) => {
    const card = document.querySelector(`.q-card[data-qi="${qi}"]`);
    card.classList.add('marked');
    const isCorrect = answers[qi] === q.correctIndex;
    if(isCorrect) score++;

    card.querySelectorAll('.q-option').forEach((btn, oi) => {
      if(oi === q.correctIndex) btn.classList.add('correct-answer');
      else if(oi === answers[qi]) btn.classList.add('wrong-answer');
    });

    if(q.explanation){
      const expl = card.querySelector('.q-explanation');
      expl.textContent = q.explanation;
    }
  });

  const total = currentQuestions.length;
  showResults(score, total);

  const submitBtn = document.getElementById('submitQuizBtn');
  submitBtn.textContent = 'Recording result\u2026';
  submitBtn.disabled = true;

  try{
    const result = await apiCall('/.netlify/functions/quiz-result', { topic: currentTopic, score, total });
    document.getElementById('statCurrentStreak').textContent = result.currentStreak;
    document.getElementById('statLongestStreak').textContent = result.longestStreak;
    const streakMsg = document.getElementById('resultStreakMsg');
    if(result.currentStreak > 1){
      streakMsg.textContent = `\u{1F525} ${result.currentStreak}-day streak — keep it going!`;
    } else {
      streakMsg.textContent = `Streak started! Come back tomorrow to keep it alive.`;
    }
  }catch(err){
    document.getElementById('resultStreakMsg').textContent = "Score recorded locally, but couldn't update your streak — check your connection.";
  }
});

/* ---------- Results screen ---------- */

function showResults(score, total){
  const pct = total ? Math.round((score / total) * 100) : 0;
  document.getElementById('resultFrac').textContent = `${score}/${total}`;
  document.getElementById('resultPct').textContent = `${pct}%`;

  const headline = document.getElementById('resultHeadline');
  if(pct >= 80) headline.textContent = 'Excellent work!';
  else if(pct >= 50) headline.textContent = 'Good effort!';
  else headline.textContent = 'Keep practicing!';

  const reviewList = document.getElementById('reviewList');
  reviewList.innerHTML = currentQuestions.map((q, qi) => {
    const isCorrect = answers[qi] === q.correctIndex;
    return `
      <div class="q-card marked">
        <div class="q-num">Question ${qi + 1}${isCorrect ? ' — Correct' : ' — Incorrect'}</div>
        <div class="q-text">${escapeHtml(q.question)}</div>
        <div class="q-options">
          ${q.options.map((opt, oi) => {
            let cls = 'q-option';
            if(oi === q.correctIndex) cls += ' correct-answer';
            else if(oi === answers[qi]) cls += ' wrong-answer';
            return `<button type="button" class="${cls}" disabled>${escapeHtml(opt)}</button>`;
          }).join('')}
        </div>
        ${q.explanation ? `<div class="q-explanation" style="display:block;">${escapeHtml(q.explanation)}</div>` : ''}
      </div>
    `;
  }).join('');
  reviewList.hidden = true;
  document.getElementById('reviewToggleBtn').textContent = 'Review answers';

  showView('results');
}

document.getElementById('reviewToggleBtn').addEventListener('click', () => {
  const reviewList = document.getElementById('reviewList');
  reviewList.hidden = !reviewList.hidden;
  document.getElementById('reviewToggleBtn').textContent = reviewList.hidden ? 'Review answers' : 'Hide review';
});

document.getElementById('newQuizBtn').addEventListener('click', () => {
  currentQuestions = [];
  answers = [];
  document.getElementById('topicInput').value = '';
  document.getElementById('setupError').classList.remove('show');
  const submitBtn = document.getElementById('submitQuizBtn');
  submitBtn.textContent = 'Submit quiz';
  submitBtn.disabled = false;
  showView('setup');
});

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession(); // redirects to welcome.html if not logged in
  if(!session) return;

  const profile = await getCurrentProfile();
  if(!profile || profile.status !== 'approved'){
    // Mirrors index.html's gating — send unapproved accounts back to the chat page,
    // which shows the proper pending/rejected explanation screen.
    window.location.replace('index.html');
    return;
  }

  document.getElementById('statCurrentStreak').textContent = profile.current_streak || 0;
  document.getElementById('statLongestStreak').textContent = profile.longest_streak || 0;
});
