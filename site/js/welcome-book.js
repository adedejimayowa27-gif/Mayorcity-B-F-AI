// site/js/welcome-book.js
// Auto-opening book-cover animation on welcome.html. The cover (with the
// brand mark) swings open like double doors on its own, shortly after the
// page loads, revealing the hero content and the Log in / Sign up buttons
// underneath. Self-contained — only touches #welcomeBook and doesn't
// interfere with the separate "Our Story" book (book.js) or the
// page-turn transition between auth pages (page-turn.js).
(function setupWelcomeBook(){
  const book = document.getElementById('welcomeBook');
  if (!book) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // With reduced motion, skip straight to the open state — no swinging
  // covers, content just appears.
  if (prefersReducedMotion) {
    book.classList.add('wb-open', 'wb-done');
    return;
  }

  const OPEN_DELAY = 550;     // let the page settle before the cover opens on its own
  const OPEN_DURATION = 1150; // matches the CSS transition on .wb-cover

  const openTimer = setTimeout(() => {
    book.classList.add('wb-open');
    setTimeout(() => book.classList.add('wb-done'), OPEN_DURATION);
  }, OPEN_DELAY);

  // Safety net: if anything goes wrong (fonts/layout stall, tab backgrounded
  // during the timeout, etc.), clicking/tapping the book forces it open so
  // the login/signup buttons are never permanently blocked.
  book.addEventListener('click', () => {
    if (!book.classList.contains('wb-open')) {
      clearTimeout(openTimer);
      book.classList.add('wb-open');
      setTimeout(() => book.classList.add('wb-done'), OPEN_DURATION);
    }
  });
})();
