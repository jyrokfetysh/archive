// Shared building blocks used by several views.
import { html, icon, cssUrl, openSheet, toast, copyText } from './ui.js';
import { telegramShareUrl, openExternal, encodeStartParam } from './telegram.js';
import { t, chapterLabel, relTime } from './i18n.js';
import { store } from './store.js';
import { isNew, site } from './data.js';

export const readHref = (s, c, page) =>
  `#/read/${encodeURIComponent(s.id)}/${encodeURIComponent(c.id)}${page != null ? `?p=${page + 1}` : ''}`;
export const seriesHref = (s) => `#/series/${encodeURIComponent(s.id)}`;

export const chapterFull = (c) => chapterLabel(c) + (c.title ? ` — ${c.title}` : '');

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || '';

/** Absolute base URL of the site, e.g. "https://user.github.io/repo/". */
export function siteBase() {
  const base = meta('jfc:base') || site.url || location.origin + location.pathname.replace(/[^/]*$/, '');
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Public link for a series or chapter. When the site was deployed with tools/build.mjs, this points
 * at a static share page (s/<series>/<chapter>/) that carries a proper Telegram/Discord preview.
 */
export function shareUrl(s, c) {
  const sid = encodeURIComponent(s.id);
  const cid = c && encodeURIComponent(c.id);
  if (meta('jfc:share') === '1') return `${siteBase()}s/${sid}/${c ? `${cid}/` : ''}`;
  return `${siteBase()}#/${c ? `read/${sid}/${cid}` : `series/${sid}`}`;
}

/** Ready-to-post announcement text for a Telegram channel. */
export function telegramPost(s, c) {
  const url = shareUrl(s, c);
  const app = site.telegramApp && encodeStartParam(s.id, c.id);
  const lines = [`📖 ${s.title} — ${chapterLabel(c, true)}${c.title ? `: ${c.title}` : ''}`, '', `${t('tg.read')}: ${url}`];
  if (app) lines.push(`${t('tg.readApp')}: ${site.telegramApp}?startapp=${app}`);
  return lines.join('\n');
}

export function openShare({ title, text, url }) {
  const sheet = openSheet({
    title: t('share'),
    body: html`<div class="share-box">
      <input class="input" readonly value="${url}" aria-label="${t('share.link')}">
      <div class="menu-list">
        <button type="button" data-sh="tg">${icon('telegram')}<span>${t('share.telegram')}</span></button>
        <button type="button" data-sh="copy">${icon('copy')}<span>${t('share.copy')}</span></button>
        ${navigator.share ? html`<button type="button" data-sh="native">${icon('share')}<span>${t('share.more')}</span></button>` : ''}
      </div>
    </div>`,
  });
  sheet.body.querySelector('input').addEventListener('focus', (e) => e.target.select());
  sheet.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sh]');
    if (!b) return;
    if (b.dataset.sh === 'tg') {
      const link = telegramShareUrl(url, text || title);
      if (!openExternal(link)) window.open(link, '_blank', 'noopener');
    } else if (b.dataset.sh === 'copy') {
      if (await copyText(url)) toast(t('share.copied'));
    } else {
      navigator.share({ title, text, url }).catch(() => {});
    }
    sheet.close();
  });
}

/** Chapters after the furthest one the reader has finished. 0 if they never started the series. */
export function unreadCount(s) {
  const read = store.state.read[s.id];
  if (!read) return 0;
  let max = -1;
  for (const c of s.chapters) if (read[c.id]) max = c.index;
  return max < 0 ? 0 : s.chapters.length - 1 - max;
}

/**
 * Where "Continue" should take the reader:
 * kind = 'start' | 'resume' (mid-chapter) | 'next' (finished last one, a newer exists) | 'done' (caught up)
 */
export function resumeTarget(s) {
  const first = s.chapters[0];
  if (!first) return null;
  const h = store.getHistory(s.id);
  const c = h && s.chapters.find((x) => x.id === h.cid);
  if (!c) {
    const read = store.state.read[s.id];
    if (read) {
      const firstUnread = s.chapters.find((x) => !read[x.id]);
      if (firstUnread) return { kind: 'next', c: firstUnread, page: 0 };
      return { kind: 'done', c: s.chapters.at(-1), page: 0 };
    }
    return { kind: 'start', c: first, page: 0 };
  }
  // A read episode counts as finished unless it's being re-read (a saved position before the end).
  const pr = store.getProgress(s.id, c.id);
  const finished = h.page >= c.pages.length - 1 || (store.isRead(s.id, c.id) && !(pr && pr.page < c.pages.length - 1));
  if (!finished) return { kind: 'resume', c, page: h.page, total: c.pages.length };
  const next = s.chapters[c.index + 1];
  return next ? { kind: 'next', c: next, page: 0 } : { kind: 'done', c, page: 0 };
}

export function statusBadge(s) {
  return html`<span class="badge status-${s.status}">${t(`status.${s.status}`)}</span>`;
}

export function cover(src, alt = '', cls = '') {
  return src
    ? html`<img class="cover ${cls}" src="${src}" alt="${alt}" loading="lazy" decoding="async">`
    : html`<span class="cover cover-empty ${cls}">${icon('image')}</span>`;
}

export function seriesCard(s) {
  const last = s.chapters.at(-1);
  const unread = store.isFav(s.id) ? unreadCount(s) : 0;
  const fresh = last && isNew(last);
  return html`<a class="card" href="${seriesHref(s)}">
    <div class="card-cover">
      ${cover(s.cover)}
      ${statusBadge(s)}
      ${unread ? html`<span class="badge badge-count" title="${t('unread', { n: unread })}">${unread}</span>` :
        fresh ? html`<span class="badge badge-new">${t('new')}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${s.title}</div>
      <div class="card-meta">${last ? chapterLabel(last) : t('noChapters')}${last?.date ? html` · ${relTime(last.date)}` : ''}</div>
    </div>
  </a>`;
}

export function seriesRow(s) {
  const last = s.chapters.at(-1);
  const unread = store.isFav(s.id) ? unreadCount(s) : 0;
  return html`<a class="srow" href="${seriesHref(s)}">
    ${cover(s.cover, '', 'srow-cover')}
    <div class="srow-main">
      <div class="srow-title">${s.title}${store.isFav(s.id) ? html` <span class="fav-dot" title="${t('fav.in')}">${icon('heartFill')}</span>` : ''}</div>
      ${s.altTitles.length ? html`<div class="srow-alt">${s.altTitles.join(' · ')}</div>` : ''}
      <div class="srow-meta">
        ${statusBadge(s)}
        ${s.type ? html`<span class="badge badge-soft">${t(`type.${s.type}`, null, s.type)}</span>` : ''}
        <span>${t('chapters', { n: s.chapters.length })}</span>
        ${last?.date ? html`<span>· ${relTime(last.date)}</span>` : ''}
        ${unread ? html`<span class="badge badge-count">${t('unread', { n: unread })}</span>` : ''}
      </div>
      ${s.tags.length ? html`<div class="srow-tags">${s.tags.slice(0, 5).join(', ')}</div>` : ''}
    </div>
  </a>`;
}

export function continueCard(s, target) {
  const { c, kind, page, total } = target;
  const pct = kind === 'resume' ? Math.round(((page + 1) / total) * 100) : 0;
  const sub = kind === 'resume'
    ? t('progress.page', { p: page + 1, n: total })
    : kind === 'next' ? t('progress.next') : t('progress.done');
  return html`<a class="ccard" href="${kind === 'done' ? seriesHref(s) : readHref(s, c, kind === 'resume' ? page : null)}">
    <div class="ccard-cover" style="background-image:${cssUrl(s.cover)}"></div>
    <div class="ccard-body">
      <div class="ccard-title">${s.title}</div>
      <div class="ccard-ch">${chapterLabel(c)} · ${sub}</div>
      <div class="pbar"><span style="width:${pct}%"></span></div>
    </div>
  </a>`;
}

/** `more`: how many other episodes came out the same day (shown as "+N", the row opens the series). */
export function updateRow(s, c, more = 0) {
  const read = store.isRead(s.id, c.id);
  return html`<a class="urow ${read ? 'is-read' : ''}" href="${more ? seriesHref(s) : readHref(s, c)}">
    ${cover(s.cover, '', 'urow-cover')}
    <div class="urow-main">
      <div class="urow-series">${s.title}</div>
      <div class="urow-ch">${chapterFull(c)}${more ? html` <span class="urow-more">${t('home.andMore', { n: more })}</span>` : ''}</div>
    </div>
    <div class="urow-side">
      ${isNew(c) && !read ? html`<span class="badge badge-new">${t('new')}</span>` : ''}
      <span class="urow-time">${relTime(c.date)}</span>
    </div>
  </a>`;
}

export function emptyState(iconName, title, text, action = '') {
  return html`<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ''}
    ${action}
  </div>`;
}

export function showShortcuts() {
  const rows = [
    ['/', t('keys.search')],
    ['← →  /  A D', t('keys.turn')],
    ['Space', t('keys.space')],
    ['[  ]', t('keys.chapter')],
    ['Home  End', t('keys.firstLast')],
    ['C', t('keys.chapters')],
    ['S', t('keys.settings')],
    ['M', t('keys.menu')],
    ['F', t('keys.fullscreen')],
    ['Esc', t('keys.esc')],
    ['?', t('keys.help')],
  ];
  openSheet({
    title: t('keys.title'),
    body: html`<dl class="keys">${rows.map(([k, d]) => html`<div><dt>${k.split('  ').map((x) => html`<kbd>${x}</kbd>`)}</dt><dd>${d}</dd></div>`)}</dl>`,
  });
}
