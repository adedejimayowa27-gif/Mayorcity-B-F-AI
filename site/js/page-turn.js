// site/js/page-turn.js
// Page-turn transition between welcome.html, login.html and signup.html.
// Self-contained: only intercepts clicks on links to those three pages and
// only animates the .auth-main wrapper. Doesn't touch auth.js, theme.js,
// or the JS-driven redirects that fire after a successful login/signup.
(function setupPageTurn(){
  const AUTH_PAGES = ['welcome.html', 'login.html', 'signup.html'];
  const authMain = document.querySelector('.auth-main');
  if (!authMain) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Entrance: let one frame render in the initial (rotated/transparent) CSS
  // state, then trigger the transition to the resting state.
  if (prefersReducedMotion) {
    authMain.classList.add('pt-ready');
  } else {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => authMain.classList.add('pt-ready'));
    });
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest('a[href]');
    if (!link || link.target === '_blank') return;

    const href = link.getAttribute('href') || '';
    const filename = href.split('/').pop().split('?')[0].split('#')[0];
    if (!AUTH_PAGES.includes(filename)) return;

    e.preventDefault();

    if (prefersReducedMotion) {
      window.location.href = href;
      return;
    }

    authMain.classList.remove('pt-ready');
    authMain.classList.add('pt-exit');
    setTimeout(() => { window.location.href = href; }, 380);
  });
})();
