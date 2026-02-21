/**
 * Busy Island — app.js
 * Simple single-page navigation between home, mini game, and browse pages.
 */

/**
 * Navigate to a target page, hiding all others.
 * @param {string} targetId  - id of the page div to show
 * @param {HTMLElement} btn  - the button that was clicked (for active state)
 */
function navigateTo(targetId, btn) {
  // Remove active class from all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  // Button fill feedback: add active class briefly on home buttons
  if (btn && btn.classList.contains('btn-main')) {
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 300);
  }

  // Scroll to top on navigation
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Cat
document.addEventListener('DOMContentLoaded', () => {
  const cat = document.querySelector('.cat-img');
  let dodging = false;

  cat.addEventListener('click', () => {
    if (dodging) return;
    dodging = true;

    const direction = Math.random() < 0.5 ? -3 : 3;
    cat.style.transform = `translateX(${direction}%)`;

    setTimeout(() => {
      cat.style.transform = 'translateX(0)';
      setTimeout(() => { dodging = false; }, 150);
    }, 3000);
  });
});