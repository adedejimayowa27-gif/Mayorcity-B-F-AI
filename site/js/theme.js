// site/js/theme.js
// Dark/light theme toggle, shared by welcome.html, login.html and signup.html.
// (index.html keeps its own copy inline in app.js — this is the same logic.)
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

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('loaded');
});
