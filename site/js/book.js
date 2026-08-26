// site/js/book.js
// Book-opening reveal for welcome.html's merged About + Founder section.
// Self-contained — doesn't touch auth, theme, or any other page logic.
(function setupStoryBook(){
  const book = document.getElementById('storyBook');
  if (!book) return;
  const closeBtn = document.getElementById('bookCloseBtn');

  function openBook(){
    book.classList.add('open');
    book.setAttribute('aria-expanded', 'true');
  }
  function closeBook(){
    book.classList.remove('open');
    book.setAttribute('aria-expanded', 'false');
  }

  book.addEventListener('click', () => {
    if (!book.classList.contains('open')) openBook();
  });
  book.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !book.classList.contains('open')) {
      e.preventDefault();
      openBook();
    }
  });
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeBook();
  });
})();
