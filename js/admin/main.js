// Admin page: password login, series/chapter editing, page uploads and publishing to GitHub.
import { html, icon, raw, toast, openSheet, confirmSheet, closeAllSheets, copyText, debounce } from '../ui.js';
import { t, setLang, addStrings, relTime } from '../i18n.js';
import { store } from '../store.js';
import { resolveUrl, slugify, STATUSES, site as siteData } from '../data.js';
import { extractPages } from '../views/builder.js';
import { shareUrl } from '../components.js';
import { encodeStartParam } from '../telegram.js';
import { GitHub, GitHubError, validRepo } from './github.js';
import { parseCatalogSource, serializeCatalog } from './catalog-io.js';
import { mergeCatalog, diffCatalog, looksLikeCatalog } from './merge.js';
import * as kc from './crypto.js';
import STRINGS from './strings.js';

addStrings(STRINGS);
setLang(store.state.settings.lang, '');

const KEYS_PATH = 'data/admin-keys.json';
const CATALOG_PATH = 'data/catalog.js';
const IDLE_MINUTES = 20;
const MAX_FILE_MB = 10;
const TYPES = ['manga', 'manhwa', 'manhua', 'webtoon', 'comic', 'oneshot'];
// Offered in the tags field (on top of tags already used), so tag names stay consistent across series.
const SUGGESTED_TAGS = [
  // what happens
  'Фідеризм', 'Набір ваги', 'Переїдання', 'Годування', 'Самогодування', 'Взаємний набір ваги', 'Повільний набір',
  'Швидкий набір', 'Магічний набір ваги', 'Трансформація', 'Зважування', 'Тісний одяг', 'Провалена дієта', 'Суперництво',
  // who and how big
  'Жіночий набір ваги', 'Чоловічий набір ваги', 'Фідер', 'Фіді', 'Пара', 'Пишні форми', 'Акцент на животі',
  'Великі груди', 'BBW', 'SSBBW', 'USSBBW', 'BHM',
  // genre and content
  'Комедія', 'Романтика', 'Драма', 'Повсякденність', 'Фентезі', 'Магія', 'Еротика', 'Без відвертих сцен',
];
const MODES = ['', 'vertical', 'ltr', 'rtl'];
const ID_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const NEW = '~new'; // route segment for "create"; IDs can't start with '~'

const app = document.getElementById('admin');
const S = {
  keys: null, // admin-keys.json
  keysSha: null,
  session: null, // { user, dataKey, gh } — kept in memory only
  baseSha: null, // blob sha of data/catalog.js the edits are based on
  header: '',
  catalog: null,
  baseCatalog: null, // the published version, for the change summary and merging
  pending: new Map(), // 'pending:<id>' -> File (new images, uploaded on publish)
  previews: new Map(), // 'pending:<id>' -> blob: URL
  changes: [],
  publishing: false, // an upload is running (blocks a second publish and the idle logout)
};
let viewAc = null;

/* ==========================================================================
   Helpers
   ========================================================================== */
const $ = (sel, root = app) => root.querySelector(sel);
// The local date (toISOString() is UTC, which is still "yesterday" just after midnight in Kyiv).
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const isPending = (p) => typeof p === 'string' && p.startsWith('pending:');
const imgSrc = (p) => (isPending(p) ? S.previews.get(p) || '' : resolveUrl(p));
const chId = (c) => String(c.id ?? c.number ?? '');
const chLabel = (c) => c.name || (c.number != null && c.number !== '' ? `${t('ch.long', { n: c.number })}` : t('a.chapter'));
const draftKey = () => `jfc:admin-draft:${S.keys?.repo}:${S.session?.user?.toLowerCase()}`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const pwExtra = () => [S.session?.user, ...(S.keys?.repo || '').split('/'), S.catalog?.site?.title];
const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
const field = (name) => $(`[name="${name}"]`);
const val = (name) => field(name)?.value.trim() ?? '';

function sortChapters(chs) {
  if (chs.every((c) => c.number != null && c.number !== '' && Number.isFinite(Number(c.number)))) {
    chs.sort((a, b) => Number(a.number) - Number(b.number));
  }
  return chs;
}

function errorText(e, what = 'catalog') {
  if (e instanceof GitHubError) {
    if (e.status === 401) return t('a.errToken');
    if (e.status === 403) return t('a.errForbidden');
    if (e.status === 404) return t('a.errNotFound');
    if (e.status === 409) return what === 'keys' ? t('a.errKeysConflict') : t('a.errConflict');
    if (e.status === 429) return t('a.errRate');
    return `GitHub: ${e.message}`;
  }
  if (e instanceof TypeError) return t('a.errNetwork');
  return e?.message || String(e);
}

function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
}

function newView() {
  viewAc?.abort();
  viewAc = new AbortController();
  closeAllSheets();
  const v = $('#adm-view');
  v.replaceChildren();
  const root = document.createElement('div');
  v.append(root);
  window.scrollTo(0, 0);
  // Typing in a view's form marks it as having unsaved edits (views can add their own check).
  S.touched = false;
  S.unsaved = () => false;
  root.addEventListener('input', (e) => { if (e.target.closest('[data-form]')) S.touched = true; }, { signal: viewAc.signal });
  S.viewHash = location.hash;
  return { root, signal: viewAc.signal };
}

/** The open form has edits that haven't been saved into the catalogue yet. */
const isDirty = () => !!S.session && (S.touched || !!S.unsaved?.());
// Called right before a form is saved, so leaving it afterwards doesn't ask.
const markSaved = () => { S.touched = false; S.unsaved = () => false; };

function strengthMeter(input, meter, extra = pwExtra) {
  const update = () => {
    const bits = kc.passwordStrength(input.value, extra());
    const ok = kc.passwordOk(input.value, extra());
    const level = !input.value ? 0 : ok ? (bits > 90 ? 4 : 3) : bits > 40 ? 2 : 1;
    meter.dataset.level = level;
    meter.querySelector('span').textContent = input.value ? t(`a.strength${level}`) : t('a.strengthHint', { n: kc.MIN_PASSWORD_LENGTH });
  };
  input.addEventListener('input', update);
  update();
}

const meterHtml = () => html`<div class="pw-meter" data-meter data-level="0"><i></i><i></i><i></i><i></i><span></span></div>`;

/* ==========================================================================
   Boot: setup or login
   ========================================================================== */
async function boot() {
  let res;
  try {
    res = await fetch(KEYS_PATH, { cache: 'no-store' });
  } catch {
    return renderMessage(t('a.errNetwork'));
  }
  if (res.status === 404) return renderSetup();
  try {
    S.keys = await res.json();
    if (!validKeys(S.keys)) throw new Error();
  } catch {
    return renderMessage(t('a.errKeys'));
  }
  S.keys = await freshKeys(S.keys);
  renderLogin();
}

const validKeys = (k) => k?.version === 2 && validRepo(k.repo) && Array.isArray(k.users) && k.users.length > 0 && !!k.token;

// The deployed copy can lag a minute behind the repository (e.g. right after a token change),
// so use the repository's current version when it can be read without signing in (public repos).
async function freshKeys(keys) {
  try {
    const res = await fetch(`https://api.github.com/repos/${keys.repo}/contents/${KEYS_PATH}?ref=${encodeURIComponent(keys.branch || 'main')}`, {
      headers: { Accept: 'application/vnd.github.raw+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000), // a stalled API must not keep the sign-in screen waiting
      referrerPolicy: 'no-referrer',
    });
    const k = res.ok ? await res.json() : null;
    return validKeys(k) && k.repo === keys.repo ? k : keys;
  } catch {
    return keys;
  }
}

const keysJson = (keys) => `${JSON.stringify(keys, null, 2)}\n`;
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function shell(content) {
  app.innerHTML = String(html`<div class="adm-auth">
    <div class="adm-auth-card">
      <div class="adm-brand"><img src="assets/icon.svg" alt="" width="40" height="40"><div><b>${t('a.title')}</b><small>${location.host}</small></div></div>
      ${content}
    </div>
    <p class="adm-foot"><a href="./">${icon('arrowLeft')} ${t('a.toSite')}</a></p>
  </div>`);
}

function renderMessage(msg) {
  shell(html`<p class="adm-error">${msg}</p><button class="btn" type="button" data-reload>${t('r.retry')}</button>`);
  $('[data-reload]').addEventListener('click', () => location.reload());
}

/* ---------- Login ---------- */
function throttleState() {
  try { return JSON.parse(localStorage.getItem('jfc:admin-fails')) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; }
}

function renderLogin() {
  let lastName = '';
  try { lastName = localStorage.getItem('jfc:admin-name') || ''; } catch {}
  shell(html`<form class="adm-form" data-login autocomplete="on">
      <h1>${t('a.login')}</h1>
      <label class="field"><span class="field-label">${t('a.name')}</span>
        <input class="input" name="name" autocomplete="username" required value="${lastName}" autocapitalize="none" spellcheck="false"></label>
      <label class="field"><span class="field-label">${t('a.password')}</span>
        <input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <p class="adm-error" data-err hidden></p>
      <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>${t('a.loginBtn')}</span></button>
      <p class="field-hint">${t('a.loginHint')}</p>
    </form>`);
  const form = $('[data-login]');
  (lastName ? field('password') : field('name')).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-err]');
    const btn = form.querySelector('[type=submit]');
    const th = throttleState();
    if (Date.now() < th.until) {
      err.hidden = false;
      err.textContent = t('a.wait', { s: Math.ceil((th.until - Date.now()) / 1000) });
      return;
    }
    const name = val('name');
    const password = field('password').value;
    busy(btn, true);
    err.hidden = true;
    const user = S.keys.users.find((u) => sameName(u.name, name));
    // Run the (slow) key derivation even for unknown names so both cases take the same time.
    const dataKey = await kc.unlockUser(S.keys, user || S.keys.users[0], password);
    field('password').value = '';
    if (!user || !dataKey) {
      busy(btn, false);
      const n = th.n + 1;
      // Slows down guessing from this browser: 0, 0, 2s, 4s, 8s … up to 5 minutes.
      const delay = n >= 3 ? Math.min(300, 2 ** (n - 2)) * 1000 : 0;
      try { localStorage.setItem('jfc:admin-fails', JSON.stringify({ n, until: Date.now() + delay })); } catch {}
      err.hidden = false;
      err.textContent = t('a.badLogin');
      return;
    }
    try { localStorage.removeItem('jfc:admin-fails'); localStorage.setItem('jfc:admin-name', user.name); } catch {}
    try {
      const token = await kc.decryptToken(S.keys, dataKey);
      const gh = new GitHub(token, S.keys.repo, S.keys.branch);
      S.session = { user: user.name, dataKey, gh };
      await gh.verify();
      await startApp();
    } catch (ex) {
      busy(btn, false);
      if (ex instanceof GitHubError && ex.status === 401) return renderReplaceToken(true);
      err.hidden = false;
      err.textContent = errorText(ex);
    }
  });
}

/* ---------- First-time setup ---------- */
function guessRepo() {
  const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname);
  if (!m) return '';
  const first = location.pathname.split('/').filter(Boolean)[0];
  return first && !first.includes('.') ? `${m[1]}/${first}` : `${m[1]}/${m[1]}.github.io`;
}

function tokenSteps(repo) {
  return html`<ol class="adm-steps">
    <li>${raw(t('a.tok1', { link: '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>' }))}</li>
    <li>${t('a.tok2', { repo: repo || 'owner/repo' })}</li>
    <li>${t('a.tok3')}</li>
    <li>${t('a.tok4')}</li>
  </ol>`;
}

function renderSetup() {
  const repo = guessRepo();
  shell(html`<form class="adm-form" data-setup autocomplete="off">
      <h1>${t('a.setup')}</h1>
      <p class="muted">${t('a.setupIntro')}</p>
      <div class="field-grid">
        <label class="field"><span class="field-label">${t('a.repo')}</span><input class="input" name="repo" required value="${repo}" placeholder="owner/repo" spellcheck="false" autocapitalize="none"></label>
        <label class="field"><span class="field-label">${t('a.branch')}</span><input class="input" name="branch" required value="main" spellcheck="false" autocapitalize="none"></label>
      </div>
      <details class="adm-details" open><summary>${t('a.tokHow')}</summary>${tokenSteps(repo)}</details>
      <label class="field"><span class="field-label">${t('a.token')}</span>
        <input class="input" name="token" type="password" required autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
      <hr>
      <label class="field"><span class="field-label">${t('a.yourName')}</span><input class="input" name="name" required maxlength="40" autocomplete="username"></label>
      <label class="field"><span class="field-label">${t('a.newPassword')}</span>
        <input class="input" name="password" type="password" required autocomplete="new-password" minlength="${kc.MIN_PASSWORD_LENGTH}">
        ${meterHtml()}</label>
      <label class="field"><span class="field-label">${t('a.confirmPassword')}</span><input class="input" name="password2" type="password" required autocomplete="new-password"></label>
      <p class="adm-error" data-err hidden></p>
      <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>${t('a.setupBtn')}</span></button>
      <p class="field-hint">${t('a.setupSafety')}</p>
    </form>`);
  const form = $('[data-setup]');
  const extra = () => [val('name'), ...val('repo').split('/')];
  strengthMeter(field('password'), $('[data-meter]'), extra);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-err]');
    const show = (m) => { err.hidden = false; err.textContent = m; };
    const btn = form.querySelector('[type=submit]');
    const repoName = val('repo');
    const branch = val('branch');
    const token = field('token').value.trim();
    const name = val('name');
    const pw = field('password').value;
    if (!validRepo(repoName)) return show(t('a.errRepo'));
    if (!kc.passwordOk(pw, extra())) return show(t('a.errWeak', { n: kc.MIN_PASSWORD_LENGTH }));
    if (pw !== field('password2').value) return show(t('a.errMismatch'));
    busy(btn, true);
    err.hidden = true;
    try {
      const gh = new GitHub(token, repoName, branch);
      await gh.verify();
      if (await gh.getFile(KEYS_PATH)) throw new Error(t('a.errAlreadySetUp'));
      const keys = {
        version: 2,
        repo: repoName,
        branch,
        kdf: { name: 'PBKDF2-SHA256', iterations: kc.KDF_ITERATIONS },
        keyVersion: 1,
        users: [],
      };
      const dataKey = kc.newDataKey();
      const user = await kc.createUser(keys, name, pw);
      await kc.wrapDataKey(keys, user, dataKey);
      keys.users.push(user);
      keys.token = await kc.encryptToken(keys, dataKey, token);
      const res = await gh.putFile(KEYS_PATH, keysJson(keys), `Set up admin access (${name})`);
      S.keys = keys;
      S.keysSha = res.content.sha;
      S.session = { user: name, dataKey, gh };
      try { localStorage.setItem('jfc:admin-name', name); } catch {}
      toast(t('a.setupDone'));
      await startApp();
    } catch (ex) {
      busy(btn, false);
      show(errorText(ex));
    }
  });
}

/* ---------- Token expired / replaced ---------- */
function renderReplaceToken(expired) {
  shell(html`<form class="adm-form" data-retoken autocomplete="off">
      <h1>${t('a.replaceToken')}</h1>
      <p class="muted">${expired ? t('a.tokenExpired') : t('a.replaceTokenText')}</p>
      <details class="adm-details" open><summary>${t('a.tokHow')}</summary>${tokenSteps(S.keys.repo)}</details>
      <label class="field"><span class="field-label">${t('a.token')}</span>
        <input class="input" name="token" type="password" required autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
      <p class="adm-error" data-err hidden></p>
      <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>${t('a.saveToken')}</span></button>
    </form>`);
  const form = $('[data-retoken]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    busy(btn, true);
    try {
      await rotateAccess(field('token').value.trim());
      toast(t('a.tokenSaved'), 5000);
      await startApp();
    } catch (ex) {
      busy(btn, false);
      const err = $('[data-err]');
      err.hidden = false;
      err.textContent = errorText(ex, 'keys');
    }
  });
}

/**
 * Saves a new GitHub token under a brand-new data key, wrapped for every admin still listed
 * (minus `remove`). Removed admins and old copies of the file can't unlock it, so once the old
 * token is revoked on GitHub, nothing they kept still works.
 */
async function rotateAccess(token, remove) {
  if (!token) throw new Error(t('a.errNoToken'));
  const old = await kc.decryptToken(S.keys, S.session.dataKey).catch(() => null);
  if (old && old === token) throw new Error(t('a.errSameToken'));
  const gh = new GitHub(token, S.keys.repo, S.keys.branch);
  await gh.verify();
  const current = await gh.getFile(KEYS_PATH);
  if (!current) throw new Error(t('a.errKeys'));
  const keys = JSON.parse(current.text);
  if (!validKeys(keys)) throw new Error(t('a.errKeys'));
  if (!keys.users.some((u) => sameName(u.name, S.session.user))) throw new Error(t('a.errNotAdmin'));
  const users = keys.users.filter((u) => !remove || !sameName(u.name, remove));
  const dataKey = await kc.rotate(keys, users, token);
  const message = remove ? `Remove admin ${remove}, new access key (by ${S.session.user})` : `Replace admin access token (${S.session.user})`;
  const res = await gh.putFile(KEYS_PATH, keysJson(keys), message, current.sha);
  S.keys = keys;
  S.keysSha = res.content.sha;
  S.session.gh = gh;
  S.session.dataKey = dataKey;
}

/* ==========================================================================
   Signed-in app
   ========================================================================== */
async function startApp() {
  const keysFile = await S.session.gh.getFile(KEYS_PATH);
  if (keysFile) {
    const keys = JSON.parse(keysFile.text);
    if (!validKeys(keys)) throw new Error(t('a.errKeys'));
    // Signed in with an older copy (the deployed one lags behind): the key was changed since, sign in again.
    const stale = keys.keyVersion !== S.keys.keyVersion || !keys.users.some((u) => sameName(u.name, S.session.user));
    S.keys = keys;
    S.keysSha = keysFile.sha;
    if (stale) return logout(t('a.keysChanged'));
  }
  await loadCatalog();
  app.innerHTML = String(html`
    <header class="adm-top">
      <a class="adm-brand" href="#/"><img src="assets/icon.svg" alt="" width="30" height="30"><b>${t('a.title')}</b></a>
      <nav class="adm-nav">
        <a href="#/" data-nav="series">${icon('book')}<span>${t('a.series')}</span></a>
        <a href="#/site" data-nav="site">${icon('sliders')}<span>${t('a.site')}</span></a>
        <a href="#/admins" data-nav="admins">${icon('bookmark')}<span>${t('a.admins')}</span></a>
      </nav>
      <div class="adm-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-telegraph-refresh title="${t('a.telegraphRefresh')}">${icon('refresh')}<span>${t('a.telegraphRefresh')}</span></button>
        <button class="btn btn-primary" type="button" data-publish>${icon('upload')}<span>${t('a.publish')}</span><b class="adm-count" data-count hidden></b></button>
        <button class="btn-icon" type="button" data-logout title="${t('a.logout')}" aria-label="${t('a.logout')}">${icon('x')}</button>
      </div>
    </header>
    <main class="container adm-main" id="adm-view"></main>`);
  $('[data-telegraph-refresh]').addEventListener('click', refreshTelegraph);
  $('[data-publish]').addEventListener('click', () => openPublish());
  // Signing out mid-upload would leave the publish running without a session.
  $('[data-logout]').addEventListener('click', () => (S.publishing ? toast(t('a.publishing')) : logout()));
  addEventListener('hashchange', route);
  route();
  updateCount();
  restoreDraft();
}

async function loadCatalog() {
  const file = await S.session.gh.getFile(CATALOG_PATH);
  if (!file) throw new Error(t('a.errNoCatalog'));
  setBase(file);
  S.catalog = clone(S.baseCatalog);
  S.changes = [];
  syncSite();
}

/** Makes `file` (data/catalog.js as published) the version edits are compared with and based on. */
function setBase(file) {
  const { header, catalog } = parseCatalogSource(file.text);
  catalog.series.forEach((s) => (s.chapters ||= []));
  S.baseSha = file.sha;
  S.header = header;
  S.baseCatalog = catalog;
}

// Share links and Telegram posts are built from the site settings being edited, not the deployed ones.
function syncSite() {
  const site = S.catalog?.site || {};
  siteData.url = site.url || '';
  siteData.telegramApp = site.telegramApp || '';
}

function logout(reason) {
  S.session = null;
  S.previews.forEach((u) => URL.revokeObjectURL(u));
  S.pending.clear();
  S.previews.clear();
  removeEventListener('hashchange', route);
  closeAllSheets();
  if (reason) toast(reason, 4000);
  renderLogin();
}

/* ---------- Idle auto-logout ---------- */
let lastActive = Date.now();
['pointerdown', 'keydown', 'scroll'].forEach((ev) => addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
setInterval(() => {
  if (S.session && !S.publishing && Date.now() - lastActive > IDLE_MINUTES * 60e3) {
    saveDraft();
    logout(t('a.idle', { n: IDLE_MINUTES }));
  }
}, 30e3);

addEventListener('beforeunload', (e) => {
  if (S.session && (S.changes.length || S.pending.size || isDirty())) e.preventDefault();
});

/* ---------- Draft (survives reloads; new image files do not) ---------- */
function saveDraft() {
  // A draft the user chose to keep for later (closed the restore question) stays untouched until
  // they decide at the next sign-in; this session's work is covered by the leave-page warning.
  if (!S.catalog || S.keepDraft) return;
  try {
    if (!S.changes.length) return localStorage.removeItem(draftKey());
    // Only the base's sha is kept: that exact version can be fetched again from git to merge later.
    localStorage.setItem(draftKey(), JSON.stringify({ baseSha: S.baseSha, catalog: S.catalog, changes: S.changes, saved: Date.now() }));
  } catch {}
}

const dropDraft = () => { if (S.keepDraft) return; try { localStorage.removeItem(draftKey()); } catch {} };

function stripPending(catalog) {
  let removed = 0;
  for (const s of catalog.series) {
    if (isPending(s.cover)) { s.cover = ''; removed++; }
    for (const c of s.chapters || []) {
      const before = c.pages?.length || 0;
      c.pages = (c.pages || []).filter((p) => !isPending(p));
      removed += before - c.pages.length;
    }
  }
  return removed;
}

async function restoreDraft() {
  S.keepDraft = false;
  let d = null;
  try { d = JSON.parse(localStorage.getItem(draftKey())); } catch {}
  if (!d) return;
  // Anything that could have run in this browser can write to localStorage: check the shape, and
  // always show what restoring would change before using it.
  if (!Array.isArray(d.changes) || !d.changes.length || !looksLikeCatalog(d.catalog)) return dropDraft();
  const lost = stripPending(d.catalog);
  let draft = d.catalog;
  let merged = false;
  let conflicts = [];
  if (d.baseSha !== S.baseSha) {
    // The catalogue was published since: combine both versions instead of overwriting the newer one.
    try {
      const base = parseCatalogSource(await S.session.gh.blobText(d.baseSha)).catalog;
      ({ catalog: draft, conflicts } = mergeCatalog(base, draft, S.baseCatalog));
      merged = true;
    } catch {}
  }
  const diff = diffCatalog(S.baseCatalog, draft);
  if (!diff.length) return dropDraft();
  const choice = await new Promise((resolve) => {
    let result = null; // just closing the sheet keeps the draft for next time
    const sheet = openSheet({
      title: t('a.draftTitle'),
      body: html`<p>${t('a.draftFound', { when: relTime(d.saved) })}</p>
        ${merged ? html`<p class="muted">${t('a.draftMerged')}</p>` : d.baseSha !== S.baseSha ? html`<p class="adm-error">${t('a.draftOld')}</p>` : ''}
        ${conflicts.length ? html`<p class="adm-error">${t('a.draftConflicts', { n: conflicts.length })}</p>` : ''}
        ${diffList(diff)}
        ${lost ? html`<p class="field-hint">${t('a.draftLost', { n: lost })}</p>` : ''}
        <div class="btn-row"><button class="btn btn-ghost btn-danger-text" type="button" data-choice="discard">${t('a.draftDiscard')}</button>
          <span class="adm-right"></span><button class="btn btn-primary" type="button" data-choice="restore">${t('a.draftRestore')}</button></div>`,
      onClose: () => resolve(result),
    });
    sheet.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-choice]');
      if (b) { result = b.dataset.choice; sheet.close(); }
    });
  });
  if (choice === 'discard') return dropDraft();
  if (!S.session) return;
  if (choice !== 'restore') {
    S.keepDraft = true;
    return;
  }
  S.catalog = draft;
  S.changes = d.changes;
  syncSite();
  saveDraft();
  updateCount();
  route();
  toast(t('a.draftRestored'));
}

/** One difference from diffCatalog(), in words. */
function diffLine(x) {
  const title = x.series?.title || x.series?.id || '?';
  const fields = x.fields?.join(', ');
  switch (x.type) {
    case 'site': return x.fields?.includes('telegraphRefreshAt') ? t('a.telegraphRefreshRequested') : t('a.dSite', { fields });
    case 'seriesAdd': return t('a.dSeriesAdd', { title, n: x.n });
    case 'seriesEdit': return t('a.dSeriesEdit', { title, fields });
    case 'seriesDel': return t('a.dSeriesDel', { title, n: x.n });
    case 'chapterAdd': return t('a.dChAdd', { title, ch: chLabel(x.chapter), n: x.pages });
    case 'chapterEdit': return t('a.dChEdit', { title, ch: chLabel(x.chapter), fields });
    default: return t('a.dChDel', { title, ch: chLabel(x.chapter) });
  }
}

// Deletions stand out, so nothing is removed unnoticed.
const diffList = (diff) => html`<ul class="adm-changes">${diff.map((x) => html`<li class="${/Del$/.test(x.type) ? 'is-del' : ''}">${diffLine(x)}</li>`)}</ul>`;
const diffText = (diff) => diff.map((x) => `- ${diffLine(x)}`).join('\n');

function changed(desc) {
  if (desc && S.changes.at(-1) !== desc) S.changes.push(desc);
  updateCount();
  saveDraft();
}

function updateCount() {
  const el = $('[data-count]');
  if (!el) return;
  const n = S.changes.length;
  el.hidden = !n;
  el.textContent = n;
  $('[data-publish]').classList.toggle('is-attention', n > 0);
}

/* ==========================================================================
   Router
   ========================================================================== */
function route() {
  if (!S.session) return;
  if (location.hash !== S.viewHash && isDirty() && !confirm(t('a.leaveUnsaved'))) {
    history.pushState(null, '', S.viewHash || '#/'); // stay on the form (this doesn't fire hashchange)
    return;
  }
  const parts = location.hash.replace(/^#\/?/, '').split('/').map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  let nav = 'series';
  if (parts[0] === 'site') { nav = 'site'; viewSite(); }
  else if (parts[0] === 'admins') { nav = 'admins'; viewAdmins(); }
  else if (parts[0] === 'series' && parts[2] === 'ch') viewChapter(parts[1], parts[3]);
  else if (parts[0] === 'series' && parts[1]) viewSeries(parts[1]);
  else viewList();
  app.querySelectorAll('[data-nav]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.nav === nav));
}

const go = (hash) => { location.hash = hash; };
const seriesById = (id) => S.catalog.series.find((s) => String(s.id || slugify(s.title)) === id);
const sid = (s) => String(s.id || slugify(s.title));

/* ==========================================================================
   Views
   ========================================================================== */
function viewList() {
  const { root, signal } = newView();
  const list = S.catalog.series;
  root.innerHTML = String(html`
    <div class="page-head">
      <h1>${t('a.series')} <span class="count">${list.length}</span></h1>
      <a class="btn btn-primary" href="#/series/${NEW}">${icon('edit')}<span>${t('a.newSeries')}</span></a>
    </div>
    ${list.length > 6 ? html`<div class="search-field adm-search">${icon('search')}<input class="input" type="search" data-q placeholder="${t('search')}…"></div>` : ''}
    <div class="adm-list" data-list></div>`);
  const render = (q = '') => {
    const f = q.trim().toLowerCase();
    const items = list.map((s, i) => ({ s, i })).filter(({ s }) => !f || `${s.title} ${(s.altTitles || []).join(' ')}`.toLowerCase().includes(f));
    $('[data-list]', root).innerHTML = String(items.length ? html`${items.map(({ s }) => {
      const chs = s.chapters || [];
      const last = chs.reduce((m, c) => (c.date > m ? c.date : m), '');
      return html`<a class="adm-row" href="#/series/${encodeURIComponent(sid(s))}">
        <img class="adm-thumb" src="${imgSrc(s.cover || chs[0]?.pages?.[0] || '')}" alt="" loading="lazy">
        <span class="adm-row-main"><b>${s.title}</b><small>${sid(s)} · ${t('chapters', { n: chs.length })}${last ? ` · ${last}` : ''}</small></span>
        <span class="badge status-${s.status || 'ongoing'}">${t(`status.${s.status || 'ongoing'}`)}</span>
        ${icon('chevRight')}
      </a>`;
    })}` : html`<div class="empty"><div class="empty-icon">${icon('book')}</div><h3>${t('a.noSeries')}</h3></div>`);
  };
  render();
  $('[data-q]', root)?.addEventListener('input', (e) => render(e.target.value), { signal });
}

/* ---------- Series editor ---------- */
function viewSeries(id) {
  const isNew = id === NEW;
  const s = isNew ? null : seriesById(id);
  if (!isNew && !s) return go('#/');
  const { root, signal } = newView();
  const v = s || { status: 'ongoing', type: 'comic', readingMode: 'vertical', chapters: [] };
  const telegraphUrl = v.type === 'oneshot'
    ? v.chapters.find((chapter) => chapter.telegraphUrl)?.telegraphUrl
    : v.telegraphUrl;
  let cover = v.cover || '';
  S.unsaved = () => cover !== (v.cover || '');
  const allTags = [...new Set([...S.catalog.series.flatMap((x) => x.tags || []), ...SUGGESTED_TAGS])].sort((a, b) => a.localeCompare(b));
  const opt = (value, label, cur) => html`<option value="${value}" ${String(value) === String(cur ?? '') ? raw('selected') : ''}>${label}</option>`;

  root.innerHTML = String(html`
    <div class="page-head">
      <div><a class="link" href="#/">${icon('arrowLeft')} ${t('a.series')}</a><h1>${isNew ? t('a.newSeries') : v.title}</h1></div>
      ${!isNew ? html`<div class="adm-actions">
        <a class="btn btn-ghost btn-sm" href="./#/series/${encodeURIComponent(sid(v))}" target="_blank" rel="noopener">${icon('external')}<span>${t('a.view')}</span></a>
        ${telegraphUrl
          ? html`<a class="btn btn-ghost btn-sm" href="${telegraphUrl}" target="_blank" rel="noopener">${icon('external')}<span>${t('a.telegraphLabel')}</span></a>`
          : html`<span class="badge badge-soft">${t('a.telegraphPending')}</span>`}
      </div>` : ''}
    </div>
    <form class="adm-grid" data-form novalidate>
      <section class="panel">
        <h2>${t('a.info')}</h2>
        <label class="field"><span class="field-label">${t('a.fTitle')} *</span><input class="input" name="title" required value="${v.title || ''}" maxlength="200"></label>
        <label class="field"><span class="field-label">${t('a.fId')}</span>
          <input class="input" name="id" value="${v.id || ''}" ${!isNew ? raw('readonly') : ''} spellcheck="false" autocapitalize="none" placeholder="${t('a.fIdAuto')}">
          <span class="field-hint">${isNew ? t('a.fIdHint') : t('a.fIdLocked')}</span></label>
        <label class="field"><span class="field-label">${t('a.fAlt')}</span><textarea class="input textarea-sm" name="altTitles" rows="2">${(v.altTitles || []).join('\n')}</textarea>
          <span class="field-hint">${t('a.onePerLine')}</span></label>
        <div class="field-grid">
          <label class="field"><span class="field-label">${t('series.author')}</span><input class="input" name="author" value="${v.author || ''}"></label>
          <label class="field"><span class="field-label">${t('series.artist')}</span><input class="input" name="artist" value="${v.artist || ''}"></label>
        </div>
        <div class="field-grid field-grid-3">
          <label class="field"><span class="field-label">${t('cat.type')}</span><select class="select" name="type">${TYPES.map((x) => opt(x, t(`type.${x}`), v.type))}</select></label>
          <label class="field"><span class="field-label">${t('cat.status')}</span><select class="select" name="status">${STATUSES.map((x) => opt(x, t(`status.${x}`), v.status))}</select></label>
          <label class="field"><span class="field-label">${t('series.year')}</span><input class="input" name="year" inputmode="numeric" value="${v.year || ''}" maxlength="4"></label>
        </div>
        <label class="field"><span class="field-label">${t('mode.title')}</span>
          <select class="select" name="readingMode">${MODES.map((m) => opt(m, m ? t(`mode.${m}`) : t('a.modeAuto'), v.readingMode || ''))}</select></label>
        <label class="field"><span class="field-label">${t('cat.tags')}</span><input class="input" name="tags" value="${(v.tags || []).join(', ')}" list="adm-tags" autocomplete="off">
          <datalist id="adm-tags">${allTags.map((x) => html`<option value="${x}">`)}</datalist>
          <span class="field-hint">${t('a.commaSep')}</span></label>
        <label class="field"><span class="field-label">${t('a.fDesc')}</span><textarea class="input textarea-sm" name="description" rows="5">${v.description || ''}</textarea></label>
        <label class="field"><span class="field-label">${t('series.links')}</span><textarea class="input textarea-sm" name="links" rows="2" placeholder="MangaDex | https://…">${(v.links || []).map((l) => `${l.label || ''} | ${l.url}`).join('\n')}</textarea>
          <span class="field-hint">${t('a.linksHint')}</span></label>
      </section>

      <section class="panel">
        <h2>${t('a.cover')}</h2>
        <div class="adm-cover"><img data-cover-img alt="" ${cover ? raw('') : raw('hidden')}><span data-cover-empty ${cover ? raw('hidden') : raw('')}>${icon('image')}</span></div>
        <label class="field"><span class="field-label">${t('a.coverUrl')}</span><input class="input" name="cover" value="${isPending(cover) ? '' : cover}" placeholder="abc123.jpg / https://…" spellcheck="false"></label>
        <label class="btn btn-sm">${icon('upload')}<span>${t('a.coverUpload')}</span><input type="file" accept="${ACCEPT}" data-cover-file hidden></label>
        <p class="field-hint">${t('a.coverHint')}</p>
      </section>

      <div class="adm-bar">
        <button class="btn btn-primary" type="submit">${icon('check')}<span>${isNew ? t('a.create') : t('a.saveChanges')}</span></button>
        <a class="btn btn-ghost" href="#/">${t('cancel')}</a>
        ${!isNew ? html`<button class="btn btn-ghost btn-danger-text adm-right" type="button" data-delete>${icon('trash')}<span>${t('a.deleteSeries')}</span></button>` : ''}
      </div>
    </form>

    ${!isNew ? html`<section class="section">
      <div class="section-head"><h2>${t('series.chapters')} <span class="count">${v.chapters.length}</span></h2>
        <a class="btn btn-primary btn-sm" href="#/series/${encodeURIComponent(sid(v))}/ch/${NEW}">${icon('edit')}<span>${t('a.addChapter')}</span></a></div>
      <div class="adm-list" data-chapters></div>
    </section>` : ''}`);

  const form = $('[data-form]', root);
  const coverImg = $('[data-cover-img]', root);
  const showCover = () => {
    const src = cover ? imgSrc(cover) : '';
    coverImg.hidden = !src;
    $('[data-cover-empty]', root).hidden = !!src;
    if (src) coverImg.src = src;
  };
  showCover();
  form.cover.addEventListener('input', debounce(() => { cover = form.cover.value.trim(); showCover(); }, 300), { signal });
  $('[data-cover-file]', root).addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const id = addPendingFile(f);
    if (!id) return;
    cover = id;
    form.cover.value = '';
    showCover();
  }, { signal });
  // Tag suggestions: a datalist only matches the whole field, so its options are rebuilt to complete
  // the tag after the last comma (keeping the ones already typed).
  const tagList = $('#adm-tags', root);
  const suggestTags = () => {
    const value = form.tags.value;
    const cut = value.lastIndexOf(',');
    const before = cut < 0 ? '' : `${value.slice(0, cut + 1).trim()} `;
    const have = new Set(value.slice(0, Math.max(cut, 0)).split(',').map((x) => x.trim().toLowerCase()));
    tagList.innerHTML = String(html`${allTags.filter((x) => !have.has(x.toLowerCase())).map((x) => html`<option value="${before}${x}">`)}`);
  };
  form.tags.addEventListener('input', suggestTags, { signal });
  form.tags.addEventListener('focus', suggestTags, { signal });
  if (isNew) {
    form.title.addEventListener('input', () => { if (!form.id.dataset.touched) form.id.placeholder = slugify(form.title.value) || t('a.fIdAuto'); }, { signal });
    form.id.addEventListener('input', () => (form.id.dataset.touched = '1'), { signal });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) return toast(t('a.errTitle'));
    const newId = isNew ? (form.id.value.trim() || slugify(title)) : sid(v);
    if (!ID_RE.test(newId)) return toast(t('a.errId'));
    if (isNew && seriesById(newId)) return toast(t('a.errIdTaken'));
    // The catalogue can be replaced while this form is open (a publish finishing in the background),
    // so save into the series as it is now, found by its ID.
    const cur = isNew ? null : seriesById(sid(v));
    if (!isNew && !cur) return toast(t('a.errGone'));
    const links = lines(form.links.value).map((l) => {
      const [a, b] = l.includes('|') ? l.split('|').map((x) => x.trim()) : ['', l];
      return { label: a || b, url: b };
    });
    if (links.some((l) => !/^https?:\/\//i.test(l.url))) return toast(t('a.errLink'));
    const coverVal = isPending(cover) ? cover : form.cover.value.trim();
    if (coverVal && !isPending(coverVal) && /^(javascript|data|vbscript):/i.test(coverVal)) return toast(t('a.errUrl'));
    const out = {
      id: newId,
      title,
      altTitles: lines(form.altTitles.value),
      cover: coverVal,
      author: form.author.value.trim(),
      artist: form.artist.value.trim(),
      type: form.type.value,
      status: form.status.value,
      year: form.year.value.trim(),
      readingMode: form.readingMode.value,
      tags: form.tags.value.split(',').map((x) => x.trim()).filter(Boolean),
      description: form.description.value.trim(),
      links,
      chapters: (cur || v).chapters || [],
    };
    // Keep the file tidy: drop empty optional fields.
    for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length && k !== 'chapters')) delete out[k];
    markSaved();
    if (isNew) {
      S.catalog.series.push(out);
      changed(t('a.chAddSeries', { title }));
      toast(t('a.created'));
      go(`#/series/${encodeURIComponent(newId)}`);
    } else {
      const i = S.catalog.series.indexOf(cur);
      S.catalog.series[i] = { ...cur, ...out };
      for (const k of Object.keys(cur)) if (!(k in out) && ['altTitles', 'cover', 'author', 'artist', 'year', 'readingMode', 'tags', 'description', 'links'].includes(k)) delete S.catalog.series[i][k];
      changed(t('a.chEditSeries', { title }));
      toast(t('a.saved'));
      viewSeries(newId);
    }
  }, { signal });

  $('[data-delete]', root)?.addEventListener('click', () => deleteSeries(v), { signal });
  if (!isNew) renderChapterList(root, v, signal);
}

function renderChapterList(root, s, signal) {
  const el = $('[data-chapters]', root);
  const chs = [...s.chapters].reverse();
  el.innerHTML = String(chs.length ? html`${chs.map((c) => html`<div class="adm-row">
      <a class="adm-row-link" href="#/series/${encodeURIComponent(sid(s))}/ch/${encodeURIComponent(chId(c))}">
        <img class="adm-thumb" src="${imgSrc(c.pages?.[0] || '')}" alt="" loading="lazy">
        <span class="adm-row-main"><b>${chLabel(c)}${c.title ? ` — ${c.title}` : ''}</b>
          <small>${c.date || '—'} · ${t('pages', { n: c.pages?.length || 0 })}${(c.pages || []).some(isPending) ? ` · ${t('a.unpublished')}` : ''}</small></span>
      </a>
      ${c.telegraphUrl
        ? html`<a class="btn-icon" href="${c.telegraphUrl}" target="_blank" rel="noopener" title="${t('a.telegraphOpen')}" aria-label="${t('a.telegraphOpen')}">${icon('external')}</a>`
        : html`<span class="badge badge-soft" title="${t('a.telegraphPending')}">Telegraph</span>`}
      <button class="btn-icon" type="button" data-post="${chId(c)}" title="${t('b.tgTitle')}" aria-label="${t('b.tgTitle')}">${icon('telegram')}</button>
    </div>`)}` : html`<p class="muted">${t('noChapters')}</p>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-post]');
    if (b) showPost(s, s.chapters.find((c) => chId(c) === b.dataset.post));
  }, { signal });
}

function showPost(s, c) {
  const site = S.catalog.site || {};
  const url = shareUrl({ id: sid(s) }, { id: chId(c) });
  const app = site.telegramApp && encodeStartParam(sid(s), chId(c));
  const text = [`📖 ${s.title} — ${chLabel(c)}${c.title ? `: ${c.title}` : ''}`, '', `${t('tg.read')}: ${url}`];
  if (app) text.push(`${t('tg.readApp')}: ${site.telegramApp}?startapp=${app}`);
  const post = text.join('\n');
  const sheet = openSheet({
    title: t('b.tgTitle'),
    body: html`<pre class="code code-wrap">${post}</pre><p class="field-hint">${t('a.postHint')}</p>
      <div class="btn-row"><button class="btn btn-primary" type="button" data-copy>${icon('copy')}<span>${t('b.copy')}</span></button></div>`,
  });
  sheet.body.querySelector('[data-copy]').addEventListener('click', async () => {
    if (await copyText(post)) toast(t('b.copied'));
  });
}

async function deleteSeries(s) {
  const sheet = openSheet({
    title: t('a.deleteSeries'),
    body: html`<p>${t('a.deleteSeriesText', { title: s.title })}</p>
      <label class="field"><span class="field-label">${t('a.typeToConfirm', { title: s.title })}</span><input class="input" data-confirm autocomplete="off"></label>
      <div class="btn-row end"><button class="btn" type="button" data-close>${t('cancel')}</button>
      <button class="btn btn-danger" type="button" data-ok disabled>${icon('trash')}<span>${t('a.delete')}</span></button></div>`,
  });
  const input = sheet.body.querySelector('[data-confirm]');
  const ok = sheet.body.querySelector('[data-ok]');
  input.addEventListener('input', () => (ok.disabled = input.value.trim() !== s.title.trim()));
  ok.addEventListener('click', () => {
    const i = S.catalog.series.indexOf(seriesById(sid(s)));
    if (i < 0) { sheet.close(); return toast(t('a.errGone')); }
    S.catalog.series.splice(i, 1);
    markSaved();
    changed(t('a.chDelSeries', { title: s.title }));
    sheet.close();
    toast(t('a.deleted'));
    go('#/');
  });
}

/* ---------- Pending files ---------- */
// Formats every browser shows. Others (HEIC from phones, TIFF, BMP, SVG) would show as broken pages.
const WEB_IMAGES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const ACCEPT = Object.keys(WEB_IMAGES).join(',');

function addPendingFile(file) {
  const ext = /\.(\w{2,5})$/.exec(file.name)?.[1]?.toLowerCase();
  if (!(WEB_IMAGES[file.type] || (!file.type && /^(jpe?g|png|webp|gif|avif)$/.test(ext || '')))) {
    toast(t('a.errNotImage', { name: file.name }));
    return null;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    toast(t('a.errTooBig', { name: file.name, n: MAX_FILE_MB }), 4000);
    return null;
  }
  const id = `pending:${crypto.randomUUID()}`;
  S.pending.set(id, file);
  S.previews.set(id, URL.createObjectURL(file));
  return id;
}

/* ---------- Chapter editor ---------- */
function viewChapter(seriesId, cid) {
  const s = seriesById(seriesId);
  if (!s) return go('#/');
  const isNew = cid === NEW || !cid;
  const c = isNew ? null : s.chapters.find((x) => chId(x) === cid);
  if (!isNew && !c) return go(`#/series/${encodeURIComponent(seriesId)}`);
  const { root, signal } = newView();
  const nums = s.chapters.map((x) => Number(x.number)).filter(Number.isFinite);
  const v = c || { number: nums.length ? Math.floor(Math.max(...nums)) + 1 : 1, date: today(), pages: [] };
  let pages = [...(v.pages || [])];
  S.unsaved = () => JSON.stringify(pages) !== JSON.stringify(v.pages || []);
  // The catalogue can be replaced while this form is open (a publish finishing in the background):
  // saving and deleting work on the series and episode as they are now, found by their IDs.
  const current = () => {
    const cs = seriesById(seriesId);
    const cc = isNew ? null : cs?.chapters.find((x) => chId(x) === cid);
    return cs && (isNew || cc) ? { cs, cc } : null;
  };

  root.innerHTML = String(html`
    <div class="page-head">
      <div><a class="link" href="#/series/${encodeURIComponent(seriesId)}">${icon('arrowLeft')} ${s.title}</a>
        <h1>${isNew ? t('a.addChapter') : chLabel(v)}</h1>
        ${!isNew && v.telegraphUrl
          ? html`<a class="btn btn-ghost btn-sm" href="${v.telegraphUrl}" target="_blank" rel="noopener">${icon('external')}<span>${t('a.telegraphLabel')}</span></a>`
          : !isNew ? html`<span class="badge badge-soft">${t('a.telegraphPending')}</span>` : ''}
      </div>
    </div>
    <form class="adm-form-wide" data-form novalidate>
      <section class="panel">
        <div class="field-grid field-grid-3">
          <label class="field"><span class="field-label">${t('b.number')} *</span><input class="input" name="number" inputmode="decimal" value="${v.number ?? ''}"></label>
          <label class="field"><span class="field-label">${t('a.volume')}</span><input class="input" name="volume" inputmode="numeric" value="${v.volume ?? ''}"></label>
          <label class="field"><span class="field-label">${t('b.date')}</span><input class="input" type="date" name="date" value="${v.date || today()}"></label>
        </div>
        <div class="field-grid">
          <label class="field"><span class="field-label">${t('b.chTitle')}</span><input class="input" name="title" value="${v.title || ''}"></label>
          <label class="field"><span class="field-label">${t('a.customLabel')}</span><input class="input" name="name" value="${v.name || ''}" placeholder="${t('a.customLabelPh')}"></label>
        </div>
      </section>

      <section class="panel adm-pages" data-drop>
        <div class="section-head"><h2>${t('a.pages')} <span class="count" data-n></span></h2></div>
        <div class="btn-row adm-tools">
          <label class="btn btn-primary btn-sm">${icon('upload')}<span>${t('a.addImages')}</span><input type="file" accept="${ACCEPT}" multiple data-files hidden></label>
          <button class="btn btn-sm" type="button" data-paste>${icon('copy')}<span>${t('a.pasteLinks')}</span></button>
          <a class="btn btn-sm btn-ghost" href="https://catbox.moe/" target="_blank" rel="noopener">${icon('external')}<span>catbox.moe</span></a>
          <span class="adm-right"></span>
          <button class="btn btn-sm btn-ghost" type="button" data-sortname title="${t('b.sortName')}">${icon('list')}<span>${t('a.sortShort')}</span></button>
          <button class="btn btn-sm btn-ghost" type="button" data-reverse title="${t('b.reverse')}">${icon('sort')}<span>${t('a.reverseShort')}</span></button>
          <button class="btn btn-sm btn-ghost btn-danger-text" type="button" data-clear>${icon('trash')}<span>${t('b.clear')}</span></button>
        </div>
        <p class="field-hint">${t('a.pagesHint', { n: MAX_FILE_MB })}</p>
        <div class="adm-pagegrid" data-grid></div>
        <div class="adm-dropzone" data-zone>${icon('image')}<span>${t('a.dropHere')}</span></div>
      </section>

      <div class="adm-bar">
        <button class="btn btn-primary" type="submit">${icon('check')}<span>${isNew ? t('a.addChapter') : t('a.saveChanges')}</span></button>
        <a class="btn btn-ghost" href="#/series/${encodeURIComponent(seriesId)}">${t('cancel')}</a>
        ${!isNew ? html`<button class="btn btn-ghost btn-danger-text adm-right" type="button" data-delete>${icon('trash')}<span>${t('a.deleteChapter')}</span></button>` : ''}
      </div>
    </form>`);

  const form = $('[data-form]', root);
  const grid = $('[data-grid]', root);
  let dragFrom = null;

  const render = () => {
    $('[data-n]', root).textContent = pages.length;
    $('[data-zone]', root).classList.toggle('is-compact', pages.length > 0);
    grid.innerHTML = String(html`${pages.map((p, i) => html`<figure class="adm-page ${isPending(p) ? 'is-new' : ''}" draggable="true" data-i="${i}">
        <img src="${imgSrc(p)}" alt="" loading="lazy" draggable="false">
        <figcaption>${i + 1}${isPending(p) ? html` · <b>${t('a.newBadge')}</b>` : ''}</figcaption>
        <div class="adm-page-tools">
          <button type="button" class="btn-icon" data-move="-1" aria-label="${t('a.moveLeft')}" ${i === 0 ? raw('disabled') : ''}>${icon('chevLeft')}</button>
          <button type="button" class="btn-icon" data-rm aria-label="${t('b.remove')}">${icon('x')}</button>
          <button type="button" class="btn-icon" data-move="1" aria-label="${t('a.moveRight')}" ${i === pages.length - 1 ? raw('disabled') : ''}>${icon('chevRight')}</button>
        </div>
        <span class="adm-page-name">${isPending(p) ? S.pending.get(p)?.name : p.split('/').pop()}</span>
      </figure>`)}`);
  };

  const addFiles = (files) => {
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    let added = 0;
    for (const f of list) {
      const id = addPendingFile(f);
      if (id) { pages.push(id); added++; }
    }
    if (added) toast(t('a.added', { n: added }));
    render();
  };

  $('[data-files]', root).addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; }, { signal });
  const drop = $('[data-drop]', root);
  drop.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); }
  }, { signal });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'), { signal });
  drop.addEventListener('drop', (e) => {
    drop.classList.remove('is-over');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, { signal });

  // Reorder by drag (desktop) or with the arrow buttons (touch).
  grid.addEventListener('dragstart', (e) => {
    const fig = e.target.closest('[data-i]');
    if (!fig) return;
    dragFrom = +fig.dataset.i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrom));
    fig.classList.add('is-dragging');
  }, { signal });
  grid.addEventListener('dragover', (e) => {
    if (dragFrom == null) return;
    e.preventDefault();
    grid.querySelectorAll('.is-target').forEach((x) => x.classList.remove('is-target'));
    e.target.closest('[data-i]')?.classList.add('is-target');
  }, { signal });
  grid.addEventListener('drop', (e) => {
    if (dragFrom == null) return;
    e.preventDefault();
    e.stopPropagation();
    const to = e.target.closest('[data-i]');
    if (to) {
      const [moved] = pages.splice(dragFrom, 1);
      pages.splice(+to.dataset.i, 0, moved);
    }
    dragFrom = null;
    render();
  }, { signal });
  grid.addEventListener('dragend', () => { dragFrom = null; render(); }, { signal });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const fig = b.closest('[data-i]');
    if (fig && b.matches('[data-move]')) {
      const i = +fig.dataset.i;
      const j = i + Number(b.dataset.move);
      [pages[i], pages[j]] = [pages[j], pages[i]];
      render();
    } else if (fig && b.matches('[data-rm]')) {
      pages.splice(+fig.dataset.i, 1);
      render();
    } else if (b.matches('[data-reverse]')) { pages.reverse(); render(); }
    else if (b.matches('[data-sortname]')) {
      const name = (p) => (isPending(p) ? S.pending.get(p)?.name || '' : p);
      pages.sort((a, z) => name(a).localeCompare(name(z), undefined, { numeric: true }));
      render();
    } else if (b.matches('[data-clear]') && pages.length) {
      confirmSheet(t('a.clearPages'), t('b.clear'), { danger: true }).then((ok) => { if (ok) { pages = []; render(); } });
    } else if (b.matches('[data-paste]')) {
      openPaste((found) => { pages.push(...found); render(); });
    } else if (b.matches('[data-delete]')) {
      confirmSheet(t('a.deleteChapterText', { ch: chLabel(v) }), t('a.delete'), { danger: true }).then((ok) => {
        if (!ok) return;
        const now = current();
        if (!now) return toast(t('a.errGone'));
        now.cs.chapters.splice(now.cs.chapters.indexOf(now.cc), 1);
        markSaved();
        changed(t('a.chDelChapter', { title: s.title, ch: chLabel(v) }));
        toast(t('a.deleted'));
        go(`#/series/${encodeURIComponent(seriesId)}`);
      });
    }
  }, { signal });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const numRaw = form.number.value.trim().replace(',', '.');
    const name = form.name.value.trim();
    if (!numRaw && !name) return toast(t('a.errNumber'));
    if (numRaw && !Number.isFinite(Number(numRaw))) return toast(t('a.errNumberFmt'));
    if (!pages.length) return toast(t('a.errNoPages'));
    const now = current();
    if (!now) return toast(t('a.errGone'));
    const { cs, cc } = now;
    // Start from the existing entry so fields this form doesn't know about (hand-written ones) survive.
    const out = { ...(cc || {}), number: numRaw ? Number(numRaw) : undefined, volume: form.volume.value.trim() || undefined,
      title: form.title.value.trim() || undefined, name: name || undefined, date: form.date.value || today(), pages: [...pages] };
    if (!numRaw && out.id == null) out.id = slugify(name);
    const id = chId(out);
    if (cs.chapters.some((x) => x !== cc && chId(x) === id)) return toast(t('a.errChTaken'));
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    if (out.volume && Number.isFinite(Number(out.volume))) out.volume = Number(out.volume);
    if (isNew) cs.chapters.push(out);
    else cs.chapters[cs.chapters.indexOf(cc)] = out;
    sortChapters(cs.chapters);
    markSaved();
    changed(t(isNew ? 'a.chAddChapter' : 'a.chEditChapter', { title: cs.title, ch: chLabel(out) }));
    toast(isNew ? t('a.chapterAdded') : t('a.saved'));
    go(`#/series/${encodeURIComponent(seriesId)}`);
  }, { signal });

  render();
}

function openPaste(onAdd) {
  const sheet = openSheet({
    title: t('a.pasteLinks'),
    body: html`<p class="field-hint">${t('b.linksHint')}</p>
      <textarea class="input textarea" rows="8" data-links spellcheck="false" placeholder="https://files.catbox.moe/abc123.jpg"></textarea>
      <div class="btn-row"><span class="muted" data-found></span><span class="adm-right"></span>
      <button class="btn btn-primary" type="button" data-ok disabled>${t('a.addPages')}</button></div>`,
  });
  const ta = sheet.body.querySelector('[data-links]');
  const ok = sheet.body.querySelector('[data-ok]');
  let found = [];
  ta.addEventListener('input', () => {
    found = extractPages(ta.value);
    sheet.body.querySelector('[data-found]').textContent = t('b.found', { n: found.length });
    ok.disabled = !found.length;
  });
  ok.addEventListener('click', () => { onAdd(found); sheet.close(); });
  setTimeout(() => ta.focus(), 50);
}

/* ---------- Site settings ---------- */
function viewSite() {
  const { root, signal } = newView();
  const site = (S.catalog.site ||= {});
  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('a.site')}</h1></div>
    <form class="adm-form-wide" data-form novalidate>
      <section class="panel">
        <label class="field"><span class="field-label">${t('a.siteTitle')}</span><input class="input" name="title" value="${site.title || ''}" maxlength="80"></label>
        <label class="field"><span class="field-label">${t('a.fDesc')}</span><textarea class="input textarea-sm" name="description" rows="3">${site.description || ''}</textarea></label>
        <div class="field-grid">
          <label class="field"><span class="field-label">${t('set.language')}</span><select class="select" name="language">
            ${[['', t('a.langAuto')], ['uk', 'Українська'], ['en', 'English']].map(([x, l]) => html`<option value="${x}" ${x === (site.language || '') ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label class="field"><span class="field-label">${t('a.logo')}</span><input class="input" name="logo" value="${site.logo || ''}" placeholder="assets/icon.svg"></label>
        </div>
        <label class="field"><span class="field-label">${t('series.links')}</span><textarea class="input textarea-sm" name="links" rows="3" placeholder="Telegram | https://t.me/your_channel">${(site.links || []).map((l) => `${l.label || ''} | ${l.url}`).join('\n')}</textarea>
          <span class="field-hint">${t('a.linksHint')}</span></label>
      </section>
      <section class="panel">
        <h2>${icon('telegram')} Telegram</h2>
        <label class="field"><span class="field-label">${t('a.siteUrl')}</span><input class="input" name="url" value="${site.url || ''}" placeholder="https://your-name.github.io/jf-community/"><span class="field-hint">${t('a.siteUrlHint')}</span></label>
        <label class="field"><span class="field-label">${t('a.previewImage')}</span><input class="input" name="image" value="${site.image || ''}" placeholder="assets/og-image.png"><span class="field-hint">${t('a.previewImageHint')}</span></label>
        <label class="field"><span class="field-label">${t('a.tgApp')}</span><input class="input" name="telegramApp" value="${site.telegramApp || ''}" placeholder="https://t.me/your_bot/read"><span class="field-hint">${t('a.tgAppHint')}</span></label>
      </section>
      <div class="adm-bar"><button class="btn btn-primary" type="submit">${icon('check')}<span>${t('a.saveChanges')}</span></button></div>
    </form>`);
  const form = $('[data-form]', root);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const links = lines(form.links.value).map((l) => {
      const [a, b] = l.includes('|') ? l.split('|').map((x) => x.trim()) : ['', l];
      return { label: a || b, url: b };
    });
    if (links.some((l) => !/^https?:\/\//i.test(l.url))) return toast(t('a.errLink'));
    for (const k of ['url', 'telegramApp']) if (form[k].value.trim() && !/^https:\/\//i.test(form[k].value.trim())) return toast(t('a.errUrl'));
    for (const k of ['logo', 'image']) if (/^\s*(javascript|vbscript):/i.test(form[k].value)) return toast(t('a.errUrl'));
    markSaved();
    // (into the site settings as they are now: the catalogue can be replaced by a finished publish)
    Object.assign(S.catalog.site ||= {}, {
      title: form.title.value.trim() || 'Comics',
      description: form.description.value.trim(),
      language: form.language.value,
      logo: form.logo.value.trim(),
      links,
      url: form.url.value.trim(),
      image: form.image.value.trim(),
      telegramApp: form.telegramApp.value.trim(),
    });
    delete S.catalog.site.demo; // (the demo series were removed from the project)
    syncSite();
    changed(t('a.chSite'));
    toast(t('a.saved'));
  }, { signal });
}

/* ---------- Admins ---------- */
function viewAdmins() {
  const { root, signal } = newView();
  const me = S.session.user.toLowerCase();
  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('a.admins')}</h1></div>
    <div class="adm-grid">
      <section class="panel">
        <h2>${t('a.people')}</h2>
        <div class="adm-list">${S.keys.users.map((u) => html`<div class="adm-row">
          <span class="adm-avatar">${u.name.slice(0, 1).toUpperCase()}</span>
          <span class="adm-row-main"><b>${u.name}${u.name.toLowerCase() === me ? html` <span class="badge badge-soft">${t('a.you')}</span>` : ''}</b><small>${u.added || ''}</small></span>
          ${u.name.toLowerCase() !== me ? html`<button class="btn-icon" type="button" data-remove="${u.name}" title="${t('a.removeAdmin')}" aria-label="${t('a.removeAdmin')}">${icon('trash')}</button>` : ''}
        </div>`)}</div>
        <p class="field-hint">${t('a.peopleHint')}</p>
      </section>
      <section class="panel">
        <h2>${t('a.addAdmin')}</h2>
        <form data-add autocomplete="off">
          <label class="field"><span class="field-label">${t('a.name')}</span><input class="input" name="newName" required maxlength="40" autocomplete="off"></label>
          <label class="field"><span class="field-label">${t('a.theirPassword')}</span><input class="input" name="newPw" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore required>${meterHtml()}
            <span class="field-hint">${t('a.theirPasswordHint')}</span></label>
          <label class="field"><span class="field-label">${t('a.currentPassword')}</span><input class="input" name="curPw1" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary" type="submit">${icon('check')}<span>${t('a.addAdmin')}</span></button>
        </form>
      </section>
      <section class="panel">
        <h2>${t('a.changePassword')}</h2>
        <form data-pw autocomplete="off">
          <label class="field"><span class="field-label">${t('a.currentPassword')}</span><input class="input" name="curPw2" type="password" autocomplete="current-password" required></label>
          <label class="field"><span class="field-label">${t('a.newPassword')}</span><input class="input" name="myPw" type="password" autocomplete="new-password" required><div class="pw-meter" data-meter2 data-level="0"><i></i><i></i><i></i><i></i><span></span></div></label>
          <label class="field"><span class="field-label">${t('a.confirmPassword')}</span><input class="input" name="myPw2" type="password" autocomplete="new-password" required></label>
          <button class="btn" type="submit">${icon('check')}<span>${t('a.changePassword')}</span></button>
          <p class="field-hint">${t('a.changePasswordHint')}</p>
        </form>
      </section>
      <section class="panel">
        <h2>${t('a.replaceToken')}</h2>
        <p class="muted">${t('a.replaceTokenText')}</p>
        <button class="btn" type="button" data-retoken>${icon('refresh')}<span>${t('a.replaceToken')}</span></button>
        <p class="field-hint">${t('a.repoInfo', { repo: S.keys.repo, branch: S.keys.branch })}</p>
      </section>
    </div>`);
  strengthMeter(field('newPw'), $('[data-meter]', root), () => [field('newName').value, ...pwExtra()]);
  strengthMeter(field('myPw'), $('[data-meter2]', root));

  // Lasting changes ask for the password again, so an unattended signed-in browser can't be used
  // to plant a new admin or take over an account.
  const checkMyPassword = async (pw) => {
    const mine = S.keys.users.find((u) => sameName(u.name, S.session.user));
    if (!mine || !(await kc.unlockUser(S.keys, mine, pw))) throw new Error(t('a.errCurrentPw'));
  };

  // Changes that keep the current data key. Refused when the file no longer matches it
  // (another admin rotated the key meanwhile): signing in again picks up the new one.
  const saveKeys = async (mutate, message) => {
    const current = await S.session.gh.getFile(KEYS_PATH);
    if (!current) throw new Error(t('a.errKeys'));
    const keys = JSON.parse(current.text);
    if (!validKeys(keys)) throw new Error(t('a.errKeys'));
    const fits = keys.keyVersion === S.keys.keyVersion && await kc.decryptToken(keys, S.session.dataKey).then(() => true, () => false);
    if (!fits) throw new GitHubError(409, 'conflict');
    await mutate(keys);
    const res = await S.session.gh.putFile(KEYS_PATH, keysJson(keys), message, current.sha);
    S.keys = keys;
    S.keysSha = res.content.sha;
  };

  const fail = (btn, ex) => {
    busy(btn, false);
    toast(errorText(ex, 'keys'), 5000);
  };

  $('[data-add]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    const name = field('newName').value.trim();
    const pw = field('newPw').value;
    if (!name) return;
    if (S.keys.users.some((u) => sameName(u.name, name))) return toast(t('a.errNameTaken'));
    if (!kc.passwordOk(pw, [name, ...pwExtra()])) return toast(t('a.errWeak', { n: kc.MIN_PASSWORD_LENGTH }));
    busy(btn, true);
    try {
      await checkMyPassword(field('curPw1').value);
      const user = await kc.createUser(S.keys, name, pw);
      await saveKeys(async (k) => {
        if (k.users.some((u) => sameName(u.name, name))) throw new Error(t('a.errNameTaken'));
        await kc.wrapDataKey(k, user, S.session.dataKey);
        k.users.push(user);
      }, `Add admin ${name} (by ${S.session.user})`);
      toast(t('a.adminAdded', { name }));
      viewAdmins();
    } catch (ex) {
      fail(btn, ex);
    }
  }, { signal });

  $('[data-pw]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    const pw = field('myPw').value;
    if (!kc.passwordOk(pw, pwExtra())) return toast(t('a.errWeak', { n: kc.MIN_PASSWORD_LENGTH }));
    if (pw !== field('myPw2').value) return toast(t('a.errMismatch'));
    busy(btn, true);
    try {
      await checkMyPassword(field('curPw2').value);
      await saveKeys(async (k) => {
        const i = k.users.findIndex((u) => sameName(u.name, S.session.user));
        if (i < 0) throw new Error(t('a.errNotAdmin'));
        // A fresh key pair, so the old password can't unlock anything in the new file. (Older versions
        // of the file stay in git history: after a leak, also replace the token, which rotates the data key.)
        const user = await kc.createUser(k, k.users[i].name, pw);
        await kc.wrapDataKey(k, user, S.session.dataKey);
        user.added = k.users[i].added || user.added;
        k.users[i] = user;
      }, `Change admin password (${S.session.user})`);
      toast(t('a.passwordChanged'));
      viewAdmins();
    } catch (ex) {
      fail(btn, ex);
    }
  }, { signal });

  // Both need a new GitHub token: whoever loses access may have seen the old one.
  const tokenSheet = ({ title, text, okLabel, danger, run }) => {
    const sheet = openSheet({
      title,
      body: html`<p>${text}</p>
        <details class="adm-details" open><summary>${t('a.tokHow')}</summary>${tokenSteps(S.keys.repo)}</details>
        <label class="field"><span class="field-label">${t('a.newToken')}</span>
          <input class="input" type="password" data-tok autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
        <p class="adm-error" data-err hidden></p>
        <div class="btn-row end"><button class="btn" type="button" data-close>${t('cancel')}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${okLabel}</button></div>`,
    });
    const btn = sheet.body.querySelector('[data-ok]');
    const err = sheet.body.querySelector('[data-err]');
    btn.addEventListener('click', async () => {
      busy(btn, true);
      err.hidden = true;
      try {
        await run(sheet.body.querySelector('[data-tok]').value.trim());
        sheet.close();
        viewAdmins();
      } catch (ex) {
        busy(btn, false);
        err.hidden = false;
        err.textContent = errorText(ex, 'keys');
      }
    });
  };

  root.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const name = rm.dataset.remove;
      tokenSheet({
        title: t('a.removeAdmin'),
        text: t('a.removeAdminText', { name }),
        okLabel: t('a.removeAdmin'),
        danger: true,
        run: async (token) => {
          await rotateAccess(token, name);
          toast(t('a.adminRemoved', { name }), 8000);
        },
      });
    } else if (e.target.closest('[data-retoken]')) {
      tokenSheet({
        title: t('a.replaceToken'),
        text: t('a.replaceTokenText'),
        okLabel: t('a.saveToken'),
        run: async (token) => {
          await rotateAccess(token);
          toast(t('a.tokenSaved'), 8000);
        },
      });
    }
  }, { signal });
}

/* ==========================================================================
   Publish
   ========================================================================== */
function extOf(file) {
  const fromName = /\.(\w{2,5})$/.exec(file.name)?.[1]?.toLowerCase();
  const fromType = WEB_IMAGES[file.type];
  return fromType || (fromName && /^(jpe?g|png|webp|gif|avif)$/.test(fromName) ? fromName : 'jpg');
}

/**
 * Copy of the catalogue with every new image given its final path in the repository.
 * -> { catalog, files: [{ path, file }] } — files are read only while uploading.
 */
function withFinalPaths(src) {
  const catalog = clone(src);
  const files = [];
  const used = new Set();
  const tag = `${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 4)}`;
  // Different chapter IDs can share a slug ("1.5" and "1-5"): never let two files get one path.
  const unique = (path) => {
    let p = path;
    for (let n = 2; used.has(p); n++) p = path.replace(/(\.\w+)$/, `-${n}$1`);
    used.add(p);
    return p;
  };
  const place = (ref, path) => {
    const file = S.pending.get(ref);
    if (!file) return '';
    const p = unique(`${path}.${extOf(file)}`);
    files.push({ path: p, file });
    return p;
  };
  for (const s of catalog.series) {
    const dir = `pages/${slugify(sid(s))}`;
    if (isPending(s.cover)) s.cover = place(s.cover, `${dir}/cover-${tag}`);
    for (const c of s.chapters || []) {
      c.pages = (c.pages || [])
        .map((p, i) => (isPending(p) ? place(p, `${dir}/${slugify(chId(c))}/${tag}-${String(i + 1).padStart(3, '0')}`) : p))
        .filter(Boolean);
    }
  }
  return { catalog, files };
}

const countNewFiles = (catalog) => catalog.series.reduce((n, s) => n + (isPending(s.cover) && S.pending.has(s.cover) ? 1 : 0)
  + (s.chapters || []).reduce((m, c) => m + (c.pages || []).filter((p) => isPending(p) && S.pending.has(p)).length, 0), 0);

/** Someone else published meanwhile: combine their version with these edits (yours win where both changed the same thing). */
async function mergeTheirs() {
  const file = await S.session.gh.getFile(CATALOG_PATH);
  if (!file) throw new Error(t('a.errNoCatalog'));
  const oldBase = S.baseCatalog;
  setBase(file);
  const { catalog, conflicts } = mergeCatalog(oldBase, S.catalog, S.baseCatalog);
  S.catalog = catalog;
  syncSite();
  saveDraft();
  updateCount();
  return conflicts;
}

function openPublish(notice) {
  if (S.publishing) return toast(t('a.publishing'));
  const diff = diffCatalog(S.baseCatalog, S.catalog);
  if (!diff.length) {
    S.changes = [];
    updateCount();
    dropDraft();
    return toast(t('a.nothing'));
  }
  const newFiles = countNewFiles(S.catalog);
  const subject = S.changes.length === 1 ? S.changes[0] : t('a.manyChanges', { n: diff.length });
  const sheet = openSheet({
    title: t('a.publish'),
    body: html`${notice ? html`<p class="adm-note">${icon('info')}<span>${notice}</span></p>` : ''}
      <p class="muted">${t('a.publishText')}</p>
      ${diffList(diff)}
      ${newFiles ? html`<p class="field-hint">${t('a.publishFiles', { n: newFiles })}</p>` : ''}
      <label class="field"><span class="field-label">${t('a.commitMsg')}</span>
        <input class="input" data-msg value="${subject}" maxlength="200"></label>
      <div class="adm-progress" data-progress hidden><div class="pbar"><span></span></div><small></small></div>
      <div class="btn-row">
        <button class="btn btn-ghost btn-danger-text" type="button" data-discard>${t('a.discard')}</button>
        <span class="adm-right"></span>
        <button class="btn btn-primary" type="button" data-go>${icon('upload')}<span>${t('a.publishNow')}</span></button>
      </div>`,
  });
  const goBtn = sheet.body.querySelector('[data-go]');
  const discardBtn = sheet.body.querySelector('[data-discard]');
  const prog = sheet.body.querySelector('[data-progress]');
  const at = { done: 0, total: 1 };
  const setProg = (done, total, label) => {
    Object.assign(at, { done, total });
    prog.hidden = false;
    prog.querySelector('span').style.width = `${total ? Math.round((done / total) * 100) : 100}%`;
    prog.querySelector('small').textContent = label;
  };

  discardBtn.addEventListener('click', async () => {
    if (!(await confirmSheet(t('a.discardText'), t('a.discard'), { danger: true }))) return;
    dropDraft();
    S.previews.forEach((u) => URL.revokeObjectURL(u));
    S.previews.clear();
    S.pending.clear();
    S.catalog = clone(S.baseCatalog);
    S.changes = [];
    syncSite();
    updateCount();
    sheet.close();
    route();
  });

  goBtn.addEventListener('click', async () => {
    const gh = S.session.gh;
    const started = JSON.stringify(S.catalog);
    const startedChanges = S.changes.length;
    S.publishing = true;
    busy(goBtn, true);
    discardBtn.disabled = true;
    try {
      const { catalog, files } = withFinalPaths(S.catalog);
      files.push({ path: CATALOG_PATH, text: serializeCatalog(catalog, S.header) });
      setProg(0, files.length, t('a.preparing'));
      gh.onWait = (s) => setProg(at.done, at.total, t('a.waitRate', { s }));
      const msg = sheet.body.querySelector('[data-msg]').value.trim() || subject;
      const { shas } = await gh.commit({
        files,
        message: `${msg}\n\n${diffText(diff)}\n\nPublished from the admin page by ${S.session.user}`,
        guard: { path: CATALOG_PATH, sha: S.baseSha },
        onProgress: (d, n) => {
          lastActive = Date.now();
          setProg(d, n, t('a.uploading', { i: d, n }));
        },
      });
      // The published version is the new base. Edits made while uploading (the sheet can be
      // closed) are kept on top of it; images stay in memory since open forms may still use them.
      S.baseSha = shas[CATALOG_PATH];
      S.baseCatalog = catalog;
      if (JSON.stringify(S.catalog) === started) {
        S.catalog = clone(catalog);
        S.changes = [];
      } else {
        S.catalog = mergeCatalog(JSON.parse(started), S.catalog, clone(catalog)).catalog;
        // (a repeated description isn't recorded twice, so the new part can look empty)
        S.changes = S.changes.length > startedChanges ? S.changes.slice(startedChanges) : S.changes.slice(-1);
      }
      saveDraft();
      updateCount();
      if (sheet.el.isConnected) {
        sheet.close();
        if (!isDirty()) route(); // (a form with unsaved edits stays open: it saves by ID)
        publishedNotice();
      } else {
        toast(t('a.published'), 4000);
      }
    } catch (ex) {
      busy(goBtn, false);
      discardBtn.disabled = false;
      prog.hidden = true;
      if (ex instanceof GitHubError && ex.status === 409) {
        S.publishing = false;
        try {
          const conflicts = await mergeTheirs();
          const notice = t('a.conflictMerged') + (conflicts.length ? ` ${t('a.draftConflicts', { n: conflicts.length })}` : '');
          if (sheet.el.isConnected) {
            sheet.close();
            if (!isDirty()) route();
            openPublish(notice);
          } else {
            toast(notice, 8000);
          }
        } catch (ex2) {
          toast(errorText(ex2), 6000);
        }
      } else {
        toast(errorText(ex), 6000);
      }
    } finally {
      S.publishing = false;
      gh.onWait = null;
    }
  });
}

function refreshTelegraph() {
  if (S.publishing) return toast(t('a.publishing'));
  if (isDirty()) return toast(t('a.saveBeforeRefresh'));
  const site = (S.catalog.site ||= {});
  const previous = Date.parse(site.telegraphRefreshAt || '') || 0;
  site.telegraphRefreshAt = new Date(Math.max(Date.now(), previous + 1)).toISOString();
  changed(t('a.telegraphRefreshRequested'));
  openPublish();
}

function publishedNotice() {
  openSheet({
    title: t('a.published'),
    body: html`<p>${t('a.publishedText')}</p>
      <div class="btn-row">
        <a class="btn" href="https://github.com/${S.keys.repo}/actions" target="_blank" rel="noopener">${icon('external')}<span>${t('a.deployStatus')}</span></a>
        <a class="btn btn-ghost" href="https://github.com/${S.keys.repo}/commits/${encodeURIComponent(S.keys.branch)}" target="_blank" rel="noopener">${icon('clock')}<span>${t('a.history')}</span></a>
      </div>`,
  });
}

boot();
