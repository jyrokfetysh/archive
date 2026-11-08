import { series, allTags, allTypes, STATUSES, norm } from '../data.js';
import { store } from '../store.js';
import { t, getLang } from '../i18n.js';
import { html, icon, raw, debounce } from '../ui.js';
import { setQuery } from '../router.js';
import { seriesCard, seriesRow, emptyState, seriesHref } from '../components.js';

const SORTS = {
  updated: (a, b) => b.updated - a.updated,
  title: (a, b) => a.title.localeCompare(b.title, getLang()),
  added: (a, b) => b.added - a.added || b.order - a.order,
  chapters: (a, b) => b.chapters.length - a.chapters.length,
};
const TAG_PREVIEW = 14;

export default function catalog({ root, query }) {
  const st = {
    q: query.get('q') || '',
    tags: (query.get('tags') || '').split(',').map((x) => x.trim()).filter(Boolean),
    status: query.get('status') || '',
    type: query.get('type') || '',
    sort: SORTS[query.get('sort')] ? query.get('sort') : 'updated',
    allTags: false,
  };
  const view = () => store.state.settings.catalogView;
  document.title = `${t('cat.title')} — ${document.title}`;

  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? raw('selected') : ''}>${label}</option>`;

  root.innerHTML = String(html`
    <div class="page-head">
      <h1>${t('cat.title')} <span class="count" data-count></span></h1>
      <button class="btn btn-ghost btn-sm" type="button" data-random>${icon('shuffle')}<span>${t('home.random')}</span></button>
    </div>
    <div class="filters">
      <div class="search-field">${icon('search')}
        <input type="search" class="input" data-q value="${st.q}" placeholder="${t('cat.search')}" aria-label="${t('search')}" enterkeyhint="search">
      </div>
      <div class="filter-row">
        <label class="select-wrap"><span class="sr-only">${t('cat.status')}</span>
          <select class="select" data-f="status">
            ${opt('', `${t('cat.status')}: ${t('cat.any')}`, st.status)}
            ${STATUSES.filter((s) => series.some((x) => x.status === s)).map((s) => opt(s, t(`status.${s}`), st.status))}
          </select></label>
        ${allTypes.length > 1 ? html`<label class="select-wrap"><span class="sr-only">${t('cat.type')}</span>
          <select class="select" data-f="type">
            ${opt('', `${t('cat.type')}: ${t('cat.any')}`, st.type)}
            ${allTypes.map((x) => opt(x, t(`type.${x}`, null, x), st.type))}
          </select></label>` : ''}
        <label class="select-wrap"><span class="sr-only">${t('cat.sort')}</span>
          <select class="select" data-f="sort">
            ${Object.keys(SORTS).map((k) => opt(k, t(`sort.${k}`), st.sort))}
          </select></label>
        <div class="seg seg-icons" role="radiogroup" aria-label="${t('view.grid')} / ${t('view.list')}">
          <button type="button" role="radio" data-view="grid" aria-label="${t('view.grid')}" title="${t('view.grid')}">${icon('grid')}</button>
          <button type="button" role="radio" data-view="list" aria-label="${t('view.list')}" title="${t('view.list')}">${icon('rows')}</button>
        </div>
      </div>
      ${allTags.length ? html`<div class="chips" data-tags></div>` : ''}
    </div>
    <div data-results></div>
  `);

  const $ = (s) => root.querySelector(s);
  const results = $('[data-results]');
  const tagsEl = $('[data-tags]');

  function renderTags() {
    if (!tagsEl) return;
    const shown = st.allTags ? allTags : [...new Set([...st.tags, ...allTags.slice(0, TAG_PREVIEW)])];
    tagsEl.innerHTML = String(html`${shown.map((tag) => html`<button type="button" class="chip" data-tag="${tag}" aria-pressed="${st.tags.includes(tag)}">${tag}</button>`)}
      ${allTags.length > TAG_PREVIEW ? html`<button type="button" class="chip chip-more" data-more-tags>${st.allTags ? t('cat.lessTags') : t('cat.moreTags')}</button>` : ''}`);
  }

  function apply() {
    const words = norm(st.q.trim()).split(/\s+/).filter(Boolean);
    const tagSet = st.tags.map(norm);
    const list = series
      .filter((s) => (!st.status || s.status === st.status) && (!st.type || s.type === st.type))
      .filter((s) => tagSet.every((tg) => s.tags.some((x) => norm(x) === tg)))
      .filter((s) => words.every((w) => s.searchText.includes(w)))
      .sort(SORTS[st.sort]);
    const active = st.q || st.tags.length || st.status || st.type;
    $('[data-count]').textContent = list.length;
    root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === view())));
    results.innerHTML = String(list.length
      ? html`${active ? html`<div class="result-bar"><span>${t('series', { n: list.length })}</span><button class="link" type="button" data-reset>${t('cat.reset')}</button></div>` : ''}
        ${view() === 'list' ? html`<div class="srows">${list.map(seriesRow)}</div>` : html`<div class="grid">${list.map(seriesCard)}</div>`}`
      : emptyState('search', t('cat.noneTitle'), t('cat.noneText'), active ? html`<button class="btn" type="button" data-reset>${t('cat.reset')}</button>` : ''));
    setQuery({ q: st.q.trim(), tags: st.tags.join(','), status: st.status, type: st.type, sort: st.sort === 'updated' ? '' : st.sort });
  }

  const applySoon = debounce(apply, 120);
  $('[data-q]').addEventListener('input', (e) => { st.q = e.target.value; applySoon(); });
  root.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    st[f] = e.target.value;
    apply();
  });
  root.addEventListener('click', (e) => {
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) {
      const tag = tagBtn.dataset.tag;
      st.tags = st.tags.includes(tag) ? st.tags.filter((x) => x !== tag) : [...st.tags, tag];
      renderTags();
      apply();
    } else if (e.target.closest('[data-more-tags]')) {
      st.allTags = !st.allTags;
      renderTags();
    } else if (e.target.closest('[data-view]')) {
      store.setSetting('catalogView', e.target.closest('[data-view]').dataset.view);
      apply();
    } else if (e.target.closest('[data-reset]')) {
      Object.assign(st, { q: '', tags: [], status: '', type: '' });
      $('[data-q]').value = '';
      root.querySelectorAll('[data-f="status"], [data-f="type"]').forEach((s) => (s.value = ''));
      renderTags();
      apply();
    } else if (e.target.closest('[data-random]')) {
      const pool = series.length ? series : [];
      if (pool.length) location.hash = seriesHref(pool[Math.floor(Math.random() * pool.length)]);
    }
  });

  renderTags();
  apply();
  return () => applySoon.cancel();
}
