// App entry: theme, shell (top bar + mobile tab bar), routes, quick search and global shortcuts.
import { site, series, catalogLoaded, norm } from './data.js';
import { store } from './store.js';
import { t, setLang, chapterLabel } from './i18n.js';
import { html, icon, openSheet, closeAllSheets, closeTopSheet, hasOpenSheet } from './ui.js';
import { startRouter, navigate, rerender, savedScroll, goBack } from './router.js';
import { tg, initTelegram, tgColorScheme, tgSetColors, tgBackButton, openExternal } from './telegram.js';
import { seriesHref, cover, emptyState, showShortcuts } from './components.js';
import { THEMES, themeGrid, bindThemeGrid } from './themes.js';
import home from './views/home.js';
import catalog from './views/catalog.js';
import seriesView from './views/series.js';
import reader from './views/reader.js';
import library from './views/library.js';
import settings from './views/settings.js';
import builder from './views/builder.js';

const NAV = [
  { id: 'home', href: '#/', icon: 'home', label: 'nav.home' },
  { id: 'catalog', href: '#/catalog', icon: 'grid', label: 'nav.catalog' },
  { id: 'library', href: '#/library', icon: 'bookmark', label: 'nav.library' },
  { id: 'settings', href: '#/settings', icon: 'sliders', label: 'nav.settings' },
];

const ROUTES = [
  { re: /^\/$/, view: home, nav: 'home' },
  { re: /^\/catalog$/, view: catalog, nav: 'catalog' },
  { re: /^\/series\/([^/]+)$/, view: seriesView, nav: 'catalog' },
  { re: /^\/read\/([^/]+)\/([^/]+)$/, view: reader, reader: true },
  { re: /^\/library$/, view: library, nav: 'library' },
  { re: /^\/settings$/, view: settings, nav: 'settings' },
  { re: /^\/builder$/, view: builder, nav: 'settings' },
];

const topbar = document.getElementById('topbar');
const bottomnav = document.getElementById('bottomnav');
const main = document.getElementById('main');
let cleanup = null;
let currentNav = null;
let firstRoute = true;

/* ---------- Theme ---------- */
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = store.state.settings.theme;
  const theme = THEMES.some((x) => x.id === pref) ? pref : 'system';
  // "System" follows light/dark with the site's own palettes.
  const system = (tgColorScheme() || (darkMq.matches ? 'dark' : 'light')) === 'dark' ? 'cocoa' : 'peach';
  document.documentElement.dataset.theme = theme === 'system' ? system : theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#111');
  tgSetColors(bg);
}
darkMq.addEventListener('change', applyTheme);

/* ---------- Shell ---------- */
function renderShell() {
  const logo = site.logo || 'assets/icon.svg';
  topbar.innerHTML = String(html`<div class="topbar-inner">
    <a class="brand" href="#/"><img src="${logo}" alt="" width="28" height="28"><span>${site.title}</span><b class="age-badge">${t('age.badge')}</b></a>
    <nav class="topnav" aria-label="Main">
      ${NAV.map((n) => html`<a href="${n.href}" data-nav="${n.id}">${icon(n.icon)}<span>${t(n.label)}</span></a>`)}
    </nav>
    <div class="topbar-actions">
      <button class="btn-icon" type="button" data-action="search" aria-label="${t('search')} (/)" title="${t('search')} (/)">${icon('search')}</button>
      <button class="btn-icon" type="button" data-action="theme" aria-label="${t('set.theme')}" title="${t('set.theme')}">${icon('contrast')}</button>
    </div>
  </div>`);
  bottomnav.innerHTML = String(html`${NAV.map((n) => html`<a href="${n.href}" data-nav="${n.id}">${icon(n.icon)}<span>${t(n.label)}</span></a>`)}`);
  document.querySelector('.skip-link').textContent = t('skip');
  markNav(currentNav);
}

function markNav(id) {
  currentNav = id;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

document.addEventListener('click', (e) => {
  // Inside Telegram, external links must go through the Mini App API (t.me links stay in Telegram).
  const ext = e.target.closest('a[target="_blank"][href^="http"]');
  if (ext && openExternal(ext.href)) {
    e.preventDefault();
    return;
  }
  // "#main" would be read as a route by the hash router: just move focus to the content.
  if (e.target.closest('.skip-link')) {
    e.preventDefault();
    document.getElementById('main').focus();
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  if (a.dataset.action === 'search') openSearch();
  if (a.dataset.action === 'theme') openThemePicker();
});

function openThemePicker() {
  const sheet = openSheet({ title: t('set.theme'), body: themeGrid() });
  bindThemeGrid(sheet.body);
}

/* ---------- Quick search ---------- */
function openSearch(initial = '') {
  if (document.querySelector('.sheet-wrap.is-search')) return;
  const sheet = openSheet({
    title: t('search'),
    className: 'is-search',
    body: html`<div class="qs">
      <div class="search-field">${icon('search')}<input type="search" class="input" placeholder="${t('qs.placeholder')}" aria-label="${t('search')}" autocomplete="off" enterkeyhint="search"></div>
      <div class="qs-results" role="listbox"></div>
    </div>`,
  });
  const input = sheet.body.querySelector('input');
  const out = sheet.body.querySelector('.qs-results');
  let sel = 0;
  let results = [];
  const run = () => {
    const q = norm(input.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    results = (words.length ? series.filter((s) => words.every((w) => s.searchText.includes(w))) : [...series].sort((a, b) => b.updated - a.updated))
      .slice(0, 8);
    sel = Math.min(sel, Math.max(0, results.length - 1));
    out.innerHTML = String(html`${results.map((s, i) => html`<a class="qs-item" role="option" aria-selected="${i === sel}" href="${seriesHref(s)}">
        ${cover(s.cover, '', 'qs-cover')}
        <span class="qs-text"><b>${s.title}</b><small>${s.chapters.length ? chapterLabel(s.chapters.at(-1)) : t('noChapters')}${s.altTitles[0] ? ` · ${s.altTitles[0]}` : ''}</small></span>
      </a>`)}
      ${!results.length ? html`<div class="qs-none">${t('qs.none')}</div>` : ''}
      ${q ? html`<a class="qs-all" href="#/catalog?q=${encodeURIComponent(input.value.trim())}">${icon('grid')} ${t('qs.all', { q: input.value.trim() })}</a>` : ''}`);
  };
  input.value = initial;
  input.addEventListener('input', () => { sel = 0; run(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
      run();
      out.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = results[sel];
      if (s) navigate(seriesHref(s));
      else if (input.value.trim()) navigate(`#/catalog?q=${encodeURIComponent(input.value.trim())}`);
    }
  });
  run();
  input.focus(); // synchronous, so iOS opens the keyboard from the tap
}

/* ---------- Routing ---------- */
function onRoute(route, params, query, { keepScroll = false } = {}) {
  cleanup?.();
  cleanup = null;
  closeAllSheets();
  const isReader = !!route?.reader;
  document.body.classList.toggle('is-reading', isReader);
  markNav(route?.nav ?? null);
  tgBackButton(route?.nav !== 'home');
  // Each view gets a fresh container so listeners it adds to `root` die with it.
  main.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'view';
  main.append(root);
  if (!catalogLoaded) {
    root.innerHTML = String(emptyState('info', t('err.noCatalog'), t('err.noCatalogText')));
  } else if (!route) {
    document.title = `${t('nf.title')} — ${site.title}`;
    root.innerHTML = String(emptyState('info', t('nf.title'), t('nf.text'), html`<a class="btn btn-primary" href="#/">${t('nf.home')}</a>`));
  } else {
    document.title = site.title;
    cleanup = route.view({ root, params, query }) || null;
  }
  if (!isReader) {
    const y = keepScroll ? scrollY : savedScroll();
    // Wait a frame so the new view has its height before restoring scroll.
    requestAnimationFrame(() => scrollTo(0, y || 0));
    if (!firstRoute && !keepScroll) main.focus({ preventScroll: true });
  }
  firstRoute = false;
}

/* ---------- Global keys ---------- */
addEventListener('keydown', (e) => {
  // Behind the 18+ question nothing else reacts to keys (search, page turning…).
  if (ageLocked()) {
    // Focus that slipped out of the question (a click on its text) is brought back on Tab.
    if (e.key === 'Tab' && !e.target.closest?.('.age-gate')) {
      e.preventDefault();
      document.querySelector('.age-gate [data-age="yes"]')?.focus();
    }
    e.stopImmediatePropagation();
    return;
  }
  if (e.key === 'Escape' && hasOpenSheet()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeTopSheet();
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === '/' && !hasOpenSheet()) {
    e.preventDefault();
    openSearch();
  } else if (e.key === '?' && !hasOpenSheet()) {
    e.preventDefault();
    showShortcuts();
  }
});

/* ---------- 18+ check ---------- */
// The content stays hidden (js/boot.js) until the visitor confirms their age once in this browser.
const ageLocked = () => document.documentElement.classList.contains('age-locked');
// Resolves once the visitor confirms they are 18+, so nothing (comic pages, reading history)
// loads behind the question.
function ageGate() {
  if (!ageLocked()) return Promise.resolve();
  let confirmed;
  const done = new Promise((r) => (confirmed = r));
  const gate = document.createElement('div');
  gate.className = 'age-gate';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'age-title');
  gate.innerHTML = String(html`<div class="age-card">
    <div class="age-mark" aria-hidden="true">18+</div>
    <h1 id="age-title">${t('age.title')}</h1>
    <p>${t('age.text')}</p>
    <div class="age-actions">
      <button class="btn btn-primary btn-lg" type="button" data-age="yes">${t('age.yes')}</button>
      <button class="btn btn-ghost" type="button" data-age="no">${t('age.no')}</button>
    </div>
  </div>`);
  document.body.append(gate);
  gate.querySelector('[data-age="yes"]').focus();
  gate.addEventListener('click', (e) => {
    const b = e.target.closest('[data-age]');
    if (!b) return;
    if (b.dataset.age === 'no') {
      if (tg) tg.close();
      else location.replace('https://www.google.com/');
      return;
    }
    try { localStorage.setItem('jfc:18', '1'); } catch {}
    document.documentElement.classList.remove('age-locked');
    gate.remove();
    main.focus({ preventScroll: true });
    confirmed();
  });
  return done;
}

/* ---------- Store reactions ---------- */
store.subscribe((type) => {
  if (type === 'settings.theme' || type === 'import' || type === 'sync') applyTheme();
  if (type === 'settings.lang' || type === 'import') {
    setLang(store.state.settings.lang, site.language);
    renderShell();
    rerender();
  }
});

/* ---------- Boot ---------- */
setLang(store.state.settings.lang, site.language);
applyTheme();
renderShell();
document.querySelector('meta[name="description"]')?.setAttribute('content', site.description || site.title);
// Cover/thumbnail images that fail to load fall back to a neutral placeholder.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.classList.contains('cover')) img.classList.add('is-broken');
}, true);
await initTelegram();
if (tg) {
  applyTheme();
  tg.onEvent('themeChanged', applyTheme);
  // Telegram's Back goes where the in-app Back would: from an episode opened by a link, to its series.
  tg.BackButton?.onClick(() => {
    const m = /^#\/read\/([^/?]+)/.exec(location.hash);
    goBack(m ? `#/series/${m[1]}` : '#/');
  });
}
await ageGate();
startRouter(ROUTES, onRoute);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

