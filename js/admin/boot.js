// Runs before anything else on admin.html (a classic script, because the CSP forbids inline code).
(function () {
  // Refuse to work inside a frame: protects against clickjacking.
  if (window.top !== window.self) {
    document.documentElement.innerHTML = '';
    throw new Error('admin.html cannot be framed');
  }
  var theme = 'system';
  try { theme = JSON.parse(localStorage.getItem('jfc:v1')).settings.theme || 'system'; } catch (e) {}
  if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'cocoa' : 'peach';
  document.documentElement.dataset.theme = theme;
})();
