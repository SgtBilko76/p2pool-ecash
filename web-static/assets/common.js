// Shared by all pages: theme toggle and copy buttons.
'use strict';

(() => {
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('p2pool-theme', next);
      } catch {}
      dispatchEvent(new Event('themechange'));
    });
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.copy');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);
      b.textContent = '✓';
      b.classList.add('done');
      setTimeout(() => {
        b.textContent = '⧉';
        b.classList.remove('done');
      }, 1500);
    } catch {}
  });

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
