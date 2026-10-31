// Runs before the stylesheet applies (a classic script, because the CSP forbids inline code):
// sets the saved theme before the first paint to avoid a flash, and keeps the content hidden
// until the visitor has confirmed they are 18+ (js/main.js shows the question).
(function () {
  var theme = 'system';
  try { theme = JSON.parse(localStorage.getItem('jfc:v1')).settings.theme || 'system'; } catch (e) {}
  if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'cocoa' : 'peach';
  document.documentElement.dataset.theme = theme;
  var adult = false;
  try { adult = localStorage.getItem('jfc:18') === '1'; } catch (e) {}
  if (!adult) document.documentElement.classList.add('age-locked');
})();
