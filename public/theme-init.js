
  // Apply the saved theme before first paint so the page never flashes the wrong mode.
  (function () {
    var saved = null;
    try { saved = localStorage.getItem('you.theme'); } catch (e) {}
    var root = document.documentElement;
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
    var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.mode = saved || (sysDark ? 'dark' : 'light');
  })();
