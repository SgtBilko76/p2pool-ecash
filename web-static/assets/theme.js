// Applied in <head> to avoid a flash of the wrong theme.
try {
  const t = localStorage.getItem('p2pool-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch {}
