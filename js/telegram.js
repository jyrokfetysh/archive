// Telegram integration: running as a Telegram Mini App (opened from a bot) and Telegram share links.
// Telegram puts its launch data in the URL hash (#tgWebAppData=...), which would otherwise confuse the
// hash router, and passes deep links as ?tgWebAppStartParam=<startapp value>.
import { byId } from './data.js';

const TG_SCRIPT = 'https://telegram.org/js/telegram-web-app.js';
const FLAG = 'jfc:tg';

/** Telegram.WebApp when running inside Telegram as a Mini App, otherwise null. */
export let tg = null;

const hasTgParams = () => /tgWebApp/.test(location.hash) || /tgWebApp/.test(location.search);

function loadScript(src, timeout) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    s.src = src;
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
    document.head.append(s);
  });
}

/**
 * Start-app parameters: "<seriesId>" or "<seriesId>__<chapterId>" ('.' in chapter ids becomes '_',
 * because Telegram only allows A-Z a-z 0-9 _ - in startapp values).
 */
export function encodeStartParam(sid, cid) {
  const v = cid == null ? sid : `${sid}__${String(cid).replace(/\./g, '_')}`;
  return /^[\w-]{1,64}$/.test(v) ? v : null;
}

function routeForStartParam(param) {
  if (!param) return null;
  const cut = param.lastIndexOf('__');
  const sid = cut > 0 ? param.slice(0, cut) : param;
  const s = byId.get(sid) || byId.get(param);
  if (!s) return null;
  if (cut > 0 && byId.has(sid)) {
    const raw = param.slice(cut + 2);
    const c = s.chapters.find((x) => x.id === raw) || s.chapters.find((x) => x.id === raw.replace(/_/g, '.'));
    if (c) return `#/read/${encodeURIComponent(s.id)}/${encodeURIComponent(c.id)}`;
  }
  return `#/series/${encodeURIComponent(s.id)}`;
}

/** Must run before the router starts. Resolves once Telegram's SDK is ready (or immediately outside Telegram). */
export async function initTelegram() {
  let remembered = false;
  try { remembered = sessionStorage.getItem(FLAG) === '1'; } catch {}
  if (!hasTgParams() && !remembered) return null;

  const hashParams = new URLSearchParams(/tgWebApp/.test(location.hash) ? location.hash.slice(1) : '');
  const query = new URLSearchParams(location.search);
  try {
    await loadScript(TG_SCRIPT, 4000);
  } catch {
    // Without the SDK the site still works as a normal web page.
  }
  const app = window.Telegram?.WebApp;
  // The SDK also loads in a normal browser (e.g. a copied link with tgWebApp… in it): there it has
  // no launch data and an "unknown" platform, and the page must stay a normal web page.
  if (app && (app.initData || (app.platform && app.platform !== 'unknown'))) {
    tg = app;
    try { sessionStorage.setItem(FLAG, '1'); } catch {}
    document.documentElement.classList.add('in-telegram');
    tg.ready();
    tg.expand();
    // Stops the "swipe down to close" gesture from firing while scrolling a long strip.
    if (tg.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes();
  } else {
    try { sessionStorage.removeItem(FLAG); } catch {}
  }

  if (hasTgParams()) {
    const start = query.get('tgWebAppStartParam') || hashParams.get('tgWebAppStartParam') || tg?.initDataUnsafe?.start_param;
    for (const k of [...query.keys()]) if (k.startsWith('tgWebApp')) query.delete(k);
    const qs = query.toString();
    const keepHash = location.hash.startsWith('#/') ? location.hash : '#/';
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + (routeForStartParam(start) || keepHash));
  }
  return tg;
}

/** 'dark' | 'light' from Telegram's own theme, or null outside Telegram. */
export const tgColorScheme = () => tg?.colorScheme || null;

export function tgSetColors(bg) {
  if (!tg || !bg || !tg.isVersionAtLeast?.('6.1')) return;
  try {
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor(bg);
  } catch {}
}

export function tgBackButton(visible) {
  if (!tg?.BackButton || !tg.isVersionAtLeast?.('6.1')) return;
  if (visible) tg.BackButton.show();
  else tg.BackButton.hide();
}

/** Opens a link the right way inside Telegram (t.me links stay in Telegram). Returns true if handled. */
export function openExternal(url) {
  if (!tg) return false;
  if (/^https:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
  else tg.openLink(url);
  return true;
}

export const telegramShareUrl = (url, text) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;

/** Mini App full screen (Bot API 8.0+). */
export const tgFullscreen = {
  get supported() { return !!tg?.isVersionAtLeast?.('8.0'); },
  get active() { return !!tg?.isFullscreen; },
  toggle() {
    if (!this.supported) return;
    if (tg.isFullscreen) tg.exitFullscreen();
    else tg.requestFullscreen();
  },
  onChange(fn) {
    if (!this.supported) return () => {};
    tg.onEvent('fullscreenChanged', fn);
    return () => tg.offEvent('fullscreenChanged', fn);
  },
};
