import { byId, isNew } from '../data.js';
import { store } from '../store.js';
import { t, chapterLabel, relTime, fullDate } from '../i18n.js';
import { html, icon, cssUrl, toast, openSheet, debounce } from '../ui.js';
import { readHref, resumeTarget, statusBadge, cover, emptyState, openShare, shareUrl } from '../components.js';

export default function seriesView({ root, params: [sid] }) {
  const s = byId.get(sid);
  if (!s) {
    root.innerHTML = String(emptyState('info', t('series.notFound'), t('series.notFoundText'),
      html`<a class="btn btn-primary" href="#/catalog">${t('home.browse')}</a>`));
    return;
  }
  document.title = `${s.title} — ${document.title}`;
  let filter = '';
  const telegraphUrl = s.type === 'oneshot'
    ? s.chapters.find((chapter) => chapter.telegraphUrl)?.telegraphUrl
    : s.telegraphUrl;

  const people = [
    s.author && [t('series.author'), s.author],
    s.artist && s.artist !== s.author && [t('series.artist'), s.artist],
    s.year && [t('series.year'), s.year],
  ].filter(Boolean);

  function actionButtons() {
    const target = resumeTarget(s);
    const fav = store.isFav(s.id);
    let main = '';
    if (target) {
      const label = {
        start: t('series.start'),
        resume: `${t('series.resume')} · ${chapterLabel(target.c)}`,
        next: `${t('series.next')} ${chapterLabel(target.c)}`,
        done: t('series.reread'),
      }[target.kind];
      const href = target.kind === 'done' ? readHref(s, s.chapters[0], 0) : readHref(s, target.c, target.kind === 'resume' ? target.page : 0);
      main = html`<a class="btn btn-primary btn-lg" href="${href}">${icon('play')}<span>${label}</span>
        ${target.kind === 'resume' ? html`<small>${t('progress.page', { p: target.page + 1, n: target.total })}</small>` : ''}</a>`;
    }
    const last = s.chapters.at(-1);
    return html`${main}
      ${last && s.chapters.length > 1 ? html`<a class="btn" href="${readHref(s, last, 0)}" title="${chapterLabel(last, true)}">${icon('chevsRight')}<span>${t('series.latest')}</span></a>` : ''}
      <button class="btn ${fav ? 'is-on' : ''}" type="button" data-fav aria-pressed="${fav}">${icon(fav ? 'heartFill' : 'heart')}<span>${fav ? t('fav.in') : t('fav.add')}</span></button>
      <button class="btn-icon btn-icon-bordered" type="button" data-share aria-label="${t('share')}" title="${t('share')}">${icon('share')}</button>`;
  }

  root.innerHTML = String(html`
    <div class="series-hero">
      <div class="series-bg" style="background-image:${cssUrl(s.cover)}" aria-hidden="true"></div>
      <div class="series-top">
        ${cover(s.cover, s.title, 'series-cover')}
        <div class="series-info">
          <h1>${s.title}</h1>
          ${s.altTitles.length ? html`<div class="series-alt">${s.altTitles.join(' · ')}</div>` : ''}
          <div class="series-badges">
            ${statusBadge(s)}
            ${s.type ? html`<span class="badge badge-soft">${t(`type.${s.type}`, null, s.type)}</span>` : ''}
            <span class="badge badge-soft">${t('chapters', { n: s.chapters.length })}</span>
            ${s.updated ? html`<span class="badge badge-soft" title="${fullDate(s.updated)}">${icon('clock')} ${relTime(s.updated)}</span>` : ''}
          </div>
          ${people.length ? html`<dl class="series-people">${people.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
        </div>
      </div>
    </div>
    <div class="series-actions" data-actions>${actionButtons()}</div>
    ${telegraphUrl ? html`<div class="series-links">
      <a class="btn btn-ghost btn-sm" href="${telegraphUrl}" target="_blank" rel="noopener">${icon('external')}<span>${t('series.telegraph')}</span></a>
    </div>` : ''}
    ${s.tags.length ? html`<div class="chips">${s.tags.map((tag) => html`<a class="chip" href="#/catalog?tags=${encodeURIComponent(tag)}">${tag}</a>`)}</div>` : ''}
    ${s.description ? html`<div class="desc-wrap">
      <p class="desc is-clamped" data-desc>${s.description}</p>
      <button class="link" type="button" data-more hidden>${t('series.more')}</button>
    </div>` : ''}
    ${s.links.length ? html`<div class="series-links">${s.links.map((l) => html`<a class="btn btn-ghost btn-sm" href="${l.url}" target="_blank" rel="noopener">${icon('external')}<span>${l.label || l.url}</span></a>`)}</div>` : ''}

    <section class="section chapters" aria-labelledby="ch-h">
      <div class="ch-head">
        <h2 id="ch-h">${t('series.chapters')} <span class="count">${s.chapters.length}</span></h2>
        <div class="ch-tools">
          ${s.chapters.length > 8 ? html`<div class="search-field search-sm">${icon('search')}<input type="search" class="input" data-filter placeholder="${t('series.findCh')}" aria-label="${t('series.findCh')}" inputmode="search"></div>` : ''}
          <button class="btn-icon btn-icon-bordered" type="button" data-sort></button>
          <button class="btn-icon btn-icon-bordered" type="button" data-menu aria-label="${t('series.options')}" title="${t('series.options')}">${icon('more')}</button>
        </div>
      </div>
      <ol class="ch-list" data-list></ol>
    </section>
  `);

  const $ = (q) => root.querySelector(q);
  const listEl = $('[data-list]');

  function renderList() {
    const desc = store.state.settings.chapterSort !== 'asc';
    const sortBtn = $('[data-sort]');
    sortBtn.innerHTML = String(icon('sort'));
    sortBtn.title = desc ? t('series.sortDesc') : t('series.sortAsc');
    sortBtn.setAttribute('aria-label', sortBtn.title);
    const h = store.getHistory(s.id);
    const f = filter.trim().toLowerCase();
    let chs = desc ? [...s.chapters].reverse() : s.chapters;
    if (f) chs = chs.filter((c) => `${chapterLabel(c)} ${chapterLabel(c, true)} ${c.number ?? ''} ${c.title}`.toLowerCase().includes(f));
    listEl.innerHTML = String(chs.length ? html`${chs.map((c) => {
      const read = store.isRead(s.id, c.id);
      const pr = !read && store.getProgress(s.id, c.id);
      const current = h?.cid === c.id;
      return html`<li class="ch-row ${read ? 'is-read' : ''} ${current ? 'is-current' : ''}">
        <a class="ch-link" href="${readHref(s, c, pr ? pr.page : null)}">
          <span class="ch-name">${chapterLabel(c, true)}${c.title ? html`<span class="ch-title">${c.title}</span>` : ''}</span>
          <span class="ch-meta">
            ${c.date ? html`<span title="${fullDate(c.date)}">${relTime(c.date)}</span>` : ''}
            <span>${t('pages', { n: c.pages.length })}</span>
            ${pr ? html`<span class="ch-progress">${t('series.inProgress', { p: pr.page + 1, n: pr.total })}</span>` : ''}
          </span>
        </a>
        ${c.telegraphUrl ? html`<a class="btn btn-ghost btn-sm" href="${c.telegraphUrl}" target="_blank" rel="noopener">${icon('external')}<span>${t('series.telegraph')}</span></a>` : ''}
        ${isNew(c) && !read ? html`<span class="badge badge-new">${t('new')}</span>` : ''}
        <button class="ch-check" type="button" data-toggle="${c.id}" aria-pressed="${read}" aria-label="${t('series.toggleRead')}" title="${t('series.toggleRead')}">${icon('check')}</button>
      </li>`;
    })}` : html`<li class="ch-empty">${s.chapters.length ? t('series.noMatch') : t('noChapters')}</li>`);
  }

  function refresh() {
    $('[data-actions]').innerHTML = String(actionButtons());
    renderList();
  }

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.matches('[data-fav]')) {
      toast(store.toggleFav(s.id) ? t('fav.added') : t('fav.removed'));
      refresh();
    } else if (el.matches('[data-share]')) {
      openShare({ title: s.title, text: s.title, url: shareUrl(s) });
    } else if (el.matches('[data-toggle]')) {
      const cid = el.dataset.toggle;
      store.setRead(s.id, cid, !store.isRead(s.id, cid));
      refresh();
    } else if (el.matches('[data-sort]')) {
      store.setSetting('chapterSort', store.state.settings.chapterSort === 'asc' ? 'desc' : 'asc');
      renderList();
    } else if (el.matches('[data-more]')) {
      const d = $('[data-desc]');
      d.classList.toggle('is-clamped');
      el.textContent = d.classList.contains('is-clamped') ? t('series.more') : t('series.less');
    } else if (el.matches('[data-menu]')) {
      openMenu();
    }
  });

  function openMenu() {
    const h = store.getHistory(s.id);
    const lastRead = s.chapters.filter((c) => store.isRead(s.id, c.id) || c.id === h?.cid).at(-1);
    const sheet = openSheet({
      title: t('series.options'),
      body: html`<div class="menu-list">
        <button type="button" data-m="all">${icon('check')}<span>${t('series.markAll')}</span></button>
        ${lastRead && lastRead.index > 0 ? html`<button type="button" data-m="prev">${icon('layers')}<span>${t('series.markPrev')}</span></button>` : ''}
        <button type="button" data-m="none">${icon('refresh')}<span>${t('series.unmarkAll')}</span></button>
      </div>`,
    });
    sheet.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const ids = s.chapters.map((c) => c.id);
      if (b.dataset.m === 'all') store.setReadMany(s.id, ids, true);
      if (b.dataset.m === 'none') store.setReadMany(s.id, ids, false);
      if (b.dataset.m === 'prev') store.setReadMany(s.id, s.chapters.slice(0, lastRead.index).map((c) => c.id), true);
      sheet.close();
      refresh();
    });
  }

  const filterInput = $('[data-filter]');
  const filterSoon = debounce(() => renderList(), 100);
  filterInput?.addEventListener('input', () => { filter = filterInput.value; filterSoon(); });

  renderList();
  const desc = $('[data-desc]');
  if (desc) requestAnimationFrame(() => {
    if (desc.scrollHeight > desc.clientHeight + 2) $('[data-more]').hidden = false;
    else desc.classList.remove('is-clamped');
  });
  return () => filterSoon.cancel();
}
