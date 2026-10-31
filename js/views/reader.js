// The comic reader: vertical (long strip) and paged (LTR / RTL) modes.
import { byId } from '../data.js';
import { store } from '../store.js';
import { t, chapterLabel } from '../i18n.js';
import { html, icon, raw, toast, openSheet, hasOpenSheet, mountControls, clamp, debounce } from '../ui.js';
import { navigate, goBack, setQuery } from '../router.js';
import { readHref, seriesHref, emptyState, openShare, shareUrl, chapterFull } from '../components.js';
import { tgFullscreen } from '../telegram.js';

const MODES = ['vertical', 'ltr', 'rtl'];

export function readerControlDefs({ perSeries }) {
  const paged = (v) => v.mode !== 'vertical';
  return [
    perSeries
      ? { key: 'mode', type: 'seg', label: t('mode.title'), options: MODES.map((m) => [m, t(`mode.${m}`)]) }
      : { key: 'defaultMode', type: 'seg', label: t('mode.default'), hint: t('mode.defaultHint'),
        options: [['auto', t('set.auto')], ...MODES.map((m) => [m, t(`mode.${m}`)])] },
    { key: 'fit', type: 'seg', label: t('fit.title'), show: (v) => !perSeries || paged(v),
      options: ['contain', 'width', 'height', 'original'].map((f) => [f, t(`fit.${f}`)]) },
    { key: 'width', type: 'range', label: t('r.width'), min: 400, max: 1600, step: 50, format: (v) => `${v}px`,
      show: (v) => !perSeries || v.mode === 'vertical' || v.fit === 'width' },
    { key: 'gap', type: 'toggle', label: t('r.gap'), show: (v) => !perSeries || v.mode === 'vertical' },
    { key: 'bg', type: 'seg', label: t('r.bg'), options: ['auto', 'black', 'gray', 'white'].map((b) => [b, t(`bg.${b}`)]) },
    { key: 'brightness', type: 'range', label: t('r.brightness'), min: 30, max: 100, step: 5, format: (v) => `${v}%` },
    { key: 'tapZones', type: 'toggle', label: t('r.tapZones'), hint: t('r.tapZonesHint'), show: (v) => !perSeries || paged(v) },
    { key: 'tapScroll', type: 'toggle', label: t('r.tapScroll'), hint: t('r.tapScrollHint'), show: (v) => !perSeries || v.mode === 'vertical' },
    { key: 'pageNum', type: 'toggle', label: t('r.pageNum'), hint: t('r.pageNumHint') },
    'wakeLock' in navigator && { key: 'wakeLock', type: 'toggle', label: t('r.wakeLock'), hint: t('r.wakeLockHint') },
    { key: 'preload', type: 'range', label: t('r.preload'), min: 1, max: 10, step: 1, format: (v) => t('pages', { n: v }) },
  ].filter(Boolean);
}

/** Adds a cache-busting query so a retry doesn't reuse a failed response. */
const bust = (u, n) => (/^https?:/i.test(u) ? `${u}${u.includes('?') ? '&' : '?'}retry=${n}` : u);

export default function reader({ root, params: [sid, cid], query }) {
  const s = byId.get(sid);
  const ch = s?.chapters.find((c) => c.id === cid);
  if (!s || !ch) {
    document.body.classList.remove('is-reading');
    root.innerHTML = String(emptyState('info', s ? t('r.chNotFound') : t('series.notFound'), '',
      html`<a class="btn btn-primary" href="${s ? seriesHref(s) : '#/catalog'}">${s ? t('r.toSeries') : t('home.browse')}</a>`));
    return;
  }
  document.title = `${chapterLabel(ch)} · ${s.title} — ${document.title}`;

  const pages = ch.pages;
  const N = pages.length;
  const prevCh = s.chapters[ch.index - 1] || null;
  const nextCh = s.chapters[ch.index + 1] || null;
  const rs = () => store.state.settings.reader;
  const def = rs().defaultMode;
  let mode = store.getMode(s.id) || (MODES.includes(def) ? def : s.readingMode);

  // Starting page: explicit ?p=, else the saved position for this chapter.
  let cur = 0;
  const qp = query.get('p');
  if (qp === 'last') cur = N - 1;
  else if (qp) cur = clamp((parseInt(qp, 10) || 1) - 1, 0, Math.max(0, N - 1));
  else {
    const pr = store.getProgress(s.id, ch.id);
    if (pr && pr.page < N - 1) cur = clamp(pr.page, 0, N - 1);
  }
  let atEnd = false;
  let uiVisible = true;
  let markedRead = store.isRead(s.id, ch.id);
  const ac = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { signal: ac.signal, ...opts });
  let stageAc = null;

  const chLabel = chapterLabel(ch) + (ch.title ? ` — ${ch.title}` : '');
  root.innerHTML = String(html`
    <div class="reader">
      <header class="r-bar r-top">
        <button class="btn-icon" type="button" data-act="back" aria-label="${t('back')}" title="${t('back')}">${icon('arrowLeft')}</button>
        <button class="r-title" type="button" data-act="chapters" aria-label="${t('r.chapters')}">
          <span class="r-series">${s.title}</span>
          <span class="r-chapter"><span>${chLabel}</span>${icon('chevDown')}</span>
        </button>
        ${document.fullscreenEnabled || tgFullscreen.supported ? html`<button class="btn-icon" type="button" data-act="fullscreen" aria-label="${t('r.fullscreen')}" title="${t('r.fullscreen')} (F)">${icon('maximize')}</button>` : ''}
        <button class="btn-icon" type="button" data-act="settings" aria-label="${t('r.settings')}" title="${t('r.settings')} (S)">${icon('sliders')}</button>
      </header>
      <div class="r-stage" data-stage></div>
      <footer class="r-bar r-bottom">
        <button class="btn-icon" type="button" data-act="prev-ch" aria-label="${t('r.prevCh')}" title="${t('r.prevCh')} ([)" ${prevCh ? '' : raw('disabled')}>${icon('chevsLeft')}</button>
        <div class="r-progress">
          <input type="range" class="r-slider" min="1" max="${Math.max(1, N)}" value="${cur + 1}" aria-label="${t('r.page')}" ${N < 2 ? raw('disabled') : ''}>
          <span class="r-count" data-count></span>
        </div>
        <button class="btn-icon" type="button" data-act="next-ch" aria-label="${t('r.nextCh')}" title="${t('r.nextCh')} (])" ${nextCh ? '' : raw('disabled')}>${icon('chevsRight')}</button>
      </footer>
      <div class="r-pagenum" data-pagenum aria-hidden="true"></div>
      <div class="r-dim" data-dim aria-hidden="true"></div>
    </div>`);

  const el = root.querySelector('.reader');
  const stage = el.querySelector('[data-stage]');
  const slider = el.querySelector('.r-slider');
  const countEl = el.querySelector('[data-count]');
  const pageNumEl = el.querySelector('[data-pagenum]');
  const dimEl = el.querySelector('[data-dim]');

  /* ---------- Look & UI ---------- */
  function applyLook() {
    const r = rs();
    const paged = mode !== 'vertical';
    el.className = [
      'reader',
      paged ? 'is-paged' : 'is-vertical',
      `dir-${mode}`,
      `fit-${paged ? r.fit : 'width'}`,
      `bg-${r.bg}`,
      r.gap ? 'has-gap' : '',
      r.pageNum ? 'show-pagenum' : '',
      uiVisible ? '' : 'ui-hidden',
    ].filter(Boolean).join(' ');
    el.style.setProperty('--rw', `${r.width}px`);
    dimEl.style.opacity = String(((100 - r.brightness) / 100) * 0.9);
    slider.dir = mode === 'rtl' ? 'rtl' : 'ltr';
  }
  // Hidden bars are inert too, so Tab can't land on buttons nobody can see.
  const setBarsInert = () => el.querySelectorAll('.r-bar').forEach((b) => (b.inert = !uiVisible));
  const setUI = (v) => {
    if (uiVisible === v) return;
    uiVisible = v;
    el.classList.toggle('ui-hidden', !v);
    setBarsInert();
  };
  const toggleUI = () => setUI(!uiVisible);

  function updateIndicators() {
    const shown = N ? Math.min(cur + 1, N) : 0;
    slider.value = String(shown || 1);
    countEl.textContent = `${shown} / ${N}`;
    pageNumEl.textContent = `${shown} / ${N}`;
    slider.style.setProperty('--pct', N > 1 ? `${((shown - 1) / (N - 1)) * 100}%` : '100%');
  }

  const saveSoon = debounce(() => {
    if (!N) return;
    store.setProgress(s.id, ch.id, Math.min(cur, N - 1), N);
    // Only touch the URL while it still belongs to this chapter (this also runs on unmount).
    if (!ac.signal.aborted) setQuery({ p: Math.min(cur, N - 1) + 1 });
  }, 400);

  function markRead() {
    if (markedRead) return;
    markedRead = true;
    store.setRead(s.id, ch.id, true);
  }

  function pageChanged() {
    updateIndicators();
    if (N && cur >= N - 1) markRead();
    saveSoon();
  }

  /* ---------- Image loading ---------- */
  function loadPage(pageEl, i, attempt = 0) {
    const img = pageEl.querySelector('img');
    const token = String(Math.random());
    pageEl.dataset.token = token;
    pageEl.classList.remove('is-error', 'is-loaded');
    pageEl.classList.add('is-loading');
    img.onload = () => {
      if (pageEl.dataset.token !== token) return;
      pageEl.classList.remove('is-loading');
      pageEl.classList.add('is-loaded');
      onPageLoaded(i);
    };
    img.onerror = () => {
      if (pageEl.dataset.token !== token) return;
      if (attempt < 2) {
        setTimeout(() => pageEl.dataset.token === token && !ac.signal.aborted && loadPage(pageEl, i, attempt + 1), 900 * (attempt + 1));
      } else {
        pageEl.classList.remove('is-loading');
        pageEl.classList.add('is-error');
      }
    };
    img.src = attempt ? bust(pages[i], attempt) : pages[i];
  }

  const placeholder = (i) => html`<div class="r-ph">
      <span class="spinner" aria-hidden="true"></span>
      <span class="r-ph-num">${i + 1}</span>
      <span class="r-ph-err">${t('r.loadFail', { n: i + 1 })}</span>
      <button class="btn btn-sm" type="button" data-act="retry">${icon('refresh')}<span>${t('r.retry')}</span></button>
    </div>`;

  const endCard = () => html`<div class="r-end-card">
      <div class="r-end-label">${t('r.end', { ch: chapterLabel(ch, true) })}</div>
      ${nextCh
        ? html`<button class="btn btn-primary btn-lg" type="button" data-act="next-ch">${t('r.nextUp', { ch: chapterLabel(nextCh, true) })}${icon('chevRight')}</button>
          ${nextCh.title ? html`<div class="r-end-sub">${nextCh.title}</div>` : ''}`
        : html`<h2>${t('r.caughtUp')}</h2>${!store.isFav(s.id) ? html`<p>${t('r.caughtUpText')}</p>
          <button class="btn" type="button" data-act="fav">${icon('heart')}<span>${t('fav.add')}</span></button>` : ''}`}
      <a class="btn btn-ghost" href="${seriesHref(s)}">${icon('list')}<span>${t('r.toSeries')}</span></a>
      <button class="btn btn-ghost btn-sm" type="button" data-act="share">${icon('share')}<span>${t('share.chapter')}</span></button>
    </div>`;

  let onPageLoaded = () => {};
  const preloaded = new Map();
  function preload(urls) {
    for (const u of urls) {
      if (!u || preloaded.has(u)) continue;
      const im = new Image();
      im.decoding = 'async';
      im.src = u;
      preloaded.set(u, im);
    }
  }
  const preloadNextChapter = () => nextCh && preload(nextCh.pages.slice(0, 2));

  /* ---------- Vertical mode ---------- */
  function buildVertical() {
    const sig = { signal: stageAc.signal };
    stage.innerHTML = String(html`<div class="r-strip">
        ${pages.map((_, i) => html`<div class="r-page" data-i="${i}"><img alt="${t('r.page')} ${i + 1}" decoding="async">${placeholder(i)}</div>`)}
      </div>
      <div class="r-end">${endCard()}</div>`);
    const pageEls = [...stage.querySelectorAll('.r-page')];
    const started = new Set();
    const start = (i) => {
      if (i < 0 || i >= N || started.has(i)) return;
      started.add(i);
      loadPage(pageEls[i], i);
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) start(+e.target.dataset.i);
    }, { rootMargin: `${Math.max(150, rs().preload * 60)}% 0px` });
    pageEls.forEach((p) => io.observe(p));
    stageAc.signal.addEventListener('abort', () => io.disconnect());

    const endEl = stage.querySelector('.r-end');
    const lastLoaded = () => pageEls[N - 1].classList.contains('is-loaded');
    const endIo = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || !lastLoaded()) return;
      cur = N - 1;
      pageChanged();
      setUI(true);
      preloadNextChapter();
    });
    endIo.observe(endEl);
    stageAc.signal.addEventListener('abort', () => endIo.disconnect());

    // Keep a jump target in place while pages above it finish loading and change height.
    let anchor = null;
    const scrollToPage = (i) => {
      const r = pageEls[i].getBoundingClientRect();
      scrollTo(0, scrollY + r.top);
    };
    const jump = (i) => {
      anchor = i;
      for (let k = i - 1; k <= i + rs().preload; k++) start(k);
      scrollToPage(i);
      cur = i;
      pageChanged();
    };
    onPageLoaded = (i) => {
      if (anchor != null && i < anchor) scrollToPage(anchor);
      // Short chapters: the end card may already be on screen when the last page arrives.
      if (i === N - 1 && endEl.getBoundingClientRect().top < innerHeight) {
        cur = N - 1;
        pageChanged();
      }
    };
    const releaseAnchor = (e) => {
      if (!e.target.closest?.('.r-bar')) anchor = null;
    };
    on(window, 'wheel', releaseAnchor, { passive: true, ...sig });
    on(window, 'touchstart', releaseAnchor, { passive: true, ...sig });
    on(window, 'pointerdown', releaseAnchor, sig); // scrollbar drags, mouse clicks
    // Capture phase: runs before the key handler below, which may set a new anchor.
    on(window, 'keydown', () => (anchor = null), { capture: true, ...sig });

    let lastY = scrollY;
    let ticking = false;
    on(window, 'scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (stageAc.signal.aborted || ac.signal.aborted) return;
        const y = scrollY;
        if (anchor == null) {
          if (y > lastY + 8 && y > 120) setUI(false);
          else if (y < 60) setUI(true);
        }
        lastY = y;
        const line = innerHeight * 0.3;
        let c = 0;
        for (let i = 0; i < N; i++) {
          if (pageEls[i].getBoundingClientRect().top <= line) c = i;
          else break;
        }
        if (lastLoaded() && innerHeight + y >= document.documentElement.scrollHeight - 4) c = N - 1;
        if (c !== cur) {
          cur = c;
          pageChanged();
        }
      });
    }, { passive: true, ...sig });

    start(0);
    start(1);
    if (cur > 0) requestAnimationFrame(() => jump(cur));
    else scrollTo(0, 0);
    return {
      goTo: jump,
      step: (d) => jump(clamp(cur + d, 0, N - 1)),
      retry: (i) => loadPage(pageEls[i], i),
    };
  }

  /* ---------- Paged mode ---------- */
  function buildPaged() {
    stage.innerHTML = String(html`<div class="r-paged">
        <div class="r-page" data-i="0"><img alt="" decoding="async">${placeholder(0)}</div>
        <div class="r-end" hidden>${endCard()}</div>
      </div>`);
    const pageEl = stage.querySelector('.r-page');
    const endEl = stage.querySelector('.r-end');
    const img = pageEl.querySelector('img');
    onPageLoaded = () => {};

    const show = (i) => {
      atEnd = false;
      cur = i;
      endEl.hidden = true;
      pageEl.hidden = false;
      pageEl.dataset.i = i;
      img.alt = `${t('r.page')} ${i + 1}`;
      pageEl.querySelector('.r-ph-num').textContent = i + 1;
      pageEl.querySelector('.r-ph-err').textContent = t('r.loadFail', { n: i + 1 });
      loadPage(pageEl, i);
      scrollTo(0, 0);
      pageChanged();
      const ahead = rs().preload;
      preload([...pages.slice(i + 1, i + 1 + ahead), pages[i - 1]]);
      if (i >= N - 2) preloadNextChapter();
    };
    const showEnd = () => {
      atEnd = true;
      cur = N - 1;
      pageEl.hidden = true;
      endEl.hidden = false;
      scrollTo(0, 0);
      pageChanged();
      setUI(true);
      preloadNextChapter();
    };
    const next = () => {
      if (atEnd) return nextCh ? goChapter(nextCh) : toast(t('r.lastChapter'));
      if (cur >= N - 1) return showEnd();
      show(cur + 1);
      setUI(false);
    };
    const prev = () => {
      if (atEnd) return show(N - 1);
      if (cur <= 0) return toast(t('r.firstPage'));
      show(cur - 1);
      setUI(false);
    };
    show(cur);
    maybeShowTapHint();
    return {
      goTo: (i) => show(clamp(i, 0, N - 1)),
      step: (d) => (d > 0 ? next() : prev()),
      first: () => show(0),
      last: () => show(N - 1),
      retry: () => loadPage(pageEl, cur),
      next,
      prev,
    };
  }

  function maybeShowTapHint() {
    if (!rs().tapZones || store.hint('tapZones')) return;
    store.setHint('tapZones');
    const rtl = mode === 'rtl';
    const hint = document.createElement('div');
    hint.className = 'r-hint';
    hint.innerHTML = String(html`<div>${rtl ? t('r.hintNext') : t('r.hintPrev')}</div><div>${t('r.hintMenu')}</div><div>${rtl ? t('r.hintPrev') : t('r.hintNext')}</div>`);
    el.append(hint);
    const kill = () => hint.remove();
    hint.addEventListener('click', kill);
    setTimeout(kill, 3500);
  }

  let ctl = null;
  function build() {
    stageAc?.abort();
    stageAc = new AbortController();
    applyLook();
    if (!N) {
      stage.innerHTML = String(html`<div class="r-paged">${emptyState('image', t('r.noPages'), '', endCard())}</div>`);
      const noop = () => {};
      ctl = { goTo: noop, step: noop, retry: noop, next: noop, prev: noop, first: noop, last: noop };
      updateIndicators();
      return;
    }
    ctl = mode === 'vertical' ? buildVertical() : buildPaged();
    updateIndicators();
  }

  /* ---------- Navigation ---------- */
  function goChapter(c, page) {
    saveSoon.flush();
    navigate(readHref(s, c).replace(/\?.*$/, '') + (page === 'last' ? '?p=last' : ''), { replace: true });
  }

  /* ---------- Panels ---------- */
  function openChapters() {
    const desc = s.chapters.length > 12;
    const list = desc ? [...s.chapters].reverse() : s.chapters;
    const sheet = openSheet({
      title: `${t('r.chapters')} · ${s.chapters.length}`,
      side: true,
      body: html`<button class="btn btn-sm share-chapter" type="button" data-share>${icon('share')}<span>${t('share.chapter')}</span></button>
        <ol class="ch-list ch-list-compact">${list.map((c) => html`<li class="ch-row ${store.isRead(s.id, c.id) ? 'is-read' : ''} ${c.id === ch.id ? 'is-current' : ''}">
          <a class="ch-link" href="${readHref(s, c)}" data-cid="${c.id}" ${c.id === ch.id ? raw('aria-current="page"') : ''}>
            <span class="ch-name">${chapterLabel(c, true)}${c.title ? html`<span class="ch-title">${c.title}</span>` : ''}</span>
          </a>
          ${store.isRead(s.id, c.id) ? html`<span class="ch-done">${icon('check')}</span>` : ''}
        </li>`)}</ol>`,
    });
    sheet.body.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
    sheet.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-share]')) {
        sheet.close();
        return shareChapter();
      }
      const a = e.target.closest('[data-cid]');
      if (!a) return;
      e.preventDefault();
      const c = s.chapters.find((x) => x.id === a.dataset.cid);
      if (c.id === ch.id) return sheet.close();
      goChapter(c);
    });
  }

  const shareChapter = () => openShare({
    title: `${s.title} — ${chapterFull(ch)}`,
    text: `${s.title} — ${chapterFull(ch)}`,
    url: shareUrl(s, ch),
  });

  function openSettings() {
    const defs = readerControlDefs({ perSeries: true });
    const values = () => ({ ...rs(), mode });
    const sheet = openSheet({ title: t('r.settings'), side: true, className: 'is-reader-settings', body: '<div class="controls"></div>' });
    mountControls(sheet.body.querySelector('.controls'), defs, values, (key, val) => {
      if (key === 'mode') {
        if (val === mode) return;
        mode = val;
        store.setMode(s.id, val);
        build();
        return;
      }
      const prevFit = rs().fit;
      store.setSetting(`reader.${key}`, val);
      applyLook();
      if (key === 'fit' && prevFit !== val && mode !== 'vertical') scrollTo(0, 0);
      if (key === 'wakeLock') wake(val);
    });
  }

  /* ---------- Fullscreen & wake lock ---------- */
  function toggleFullscreen() {
    if (tgFullscreen.supported) return tgFullscreen.toggle();
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  function syncFullscreenButton() {
    const b = el.querySelector('[data-act="fullscreen"]');
    if (!b) return;
    const fs = tgFullscreen.supported ? tgFullscreen.active : !!document.fullscreenElement;
    b.innerHTML = String(icon(fs ? 'minimize' : 'maximize'));
    b.title = fs ? t('r.exitFullscreen') : t('r.fullscreen');
    b.setAttribute('aria-label', b.title);
  }
  on(document, 'fullscreenchange', syncFullscreenButton);
  const offTgFullscreen = tgFullscreen.onChange(syncFullscreenButton);
  ac.signal.addEventListener('abort', offTgFullscreen);

  let lock = null;
  let pending = null;
  async function wake(onOff) {
    try {
      if (onOff && !lock && !pending && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        pending = navigator.wakeLock.request('screen');
        const l = await pending;
        pending = null;
        // Released meanwhile (setting turned off or reader closed)?
        if (ac.signal.aborted || !rs().wakeLock) return l.release();
        lock = l;
        lock.addEventListener('release', () => (lock = null));
      } else if (!onOff && lock) {
        const l = lock;
        lock = null;
        await l.release();
      }
    } catch {
      pending = null;
    }
  }
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible' && rs().wakeLock) wake(true);
    if (document.visibilityState === 'hidden') saveSoon.flush();
  });

  /* ---------- Input ---------- */
  const zoomed = () => (window.visualViewport?.scale || 1) > 1.05;

  on(el, 'click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) {
      const act = b.dataset.act;
      if (act === 'back') { saveSoon.flush(); goBack(seriesHref(s)); }
      else if (act === 'chapters') openChapters();
      else if (act === 'settings') openSettings();
      else if (act === 'fullscreen') toggleFullscreen();
      else if (act === 'share') shareChapter();
      else if (act === 'prev-ch' && prevCh) goChapter(prevCh);
      else if (act === 'next-ch') nextCh ? goChapter(nextCh) : toast(t('r.lastChapter'));
      else if (act === 'retry') ctl.retry(+b.closest('.r-page').dataset.i);
      else if (act === 'fav') {
        store.toggleFav(s.id);
        toast(t('fav.added'));
        b.remove();
      }
      return;
    }
    if (!e.target.closest('[data-stage]') || e.target.closest('a, button, input') || swiped || zoomed()) return;
    if (mode === 'vertical') {
      const y = e.clientY / innerHeight;
      if (rs().tapScroll && (y < 0.28 || y > 0.72)) {
        scrollBy({ top: (y < 0.5 ? -1 : 1) * innerHeight * 0.8, behavior: 'smooth' });
      } else toggleUI();
      return;
    }
    if (!rs().tapZones) return toggleUI();
    const x = e.clientX / innerWidth;
    const forward = mode === 'rtl' ? x < 0.33 : x > 0.67;
    const backward = mode === 'rtl' ? x > 0.67 : x < 0.33;
    if (forward) ctl.next();
    else if (backward) ctl.prev();
    else toggleUI();
  });

  // Swipe to turn pages in paged modes (ignored while pinch-zoomed).
  let touch = null;
  let swiped = false;
  on(stage, 'touchstart', (e) => {
    swiped = false;
    touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true });
  on(stage, 'touchend', (e) => {
    if (!touch || mode === 'vertical' || zoomed()) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - touch.x;
    const dy = p.clientY - touch.y;
    const quick = Date.now() - touch.t < 700;
    touch = null;
    if (!quick || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    setTimeout(() => (swiped = false), 350);
    const leftSwipe = dx < 0;
    if (leftSwipe === (mode !== 'rtl')) ctl.next();
    else ctl.prev();
  }, { passive: true });

  on(slider, 'input', () => {
    const i = +slider.value - 1;
    countEl.textContent = `${i + 1} / ${N}`;
    ctl.goTo(i);
  });

  on(document, 'keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || hasOpenSheet()) return;
    if (e.target.closest?.('input:not([type=range]), textarea, select')) return;
    const k = e.key;
    // Enter and Space press a focused button or link; they only steer the reader from the page itself.
    if ((k === 'Enter' || k === ' ') && e.target.closest?.('button, a, [role=radio]')) return;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const paged = mode !== 'vertical';
    const handled = () => e.preventDefault();
    if (k === 'ArrowRight' || lower === 'd') {
      if (e.target.type === 'range') return;
      handled();
      if (paged) mode === 'rtl' ? ctl.prev() : ctl.next();
      else ctl.step(1);
    } else if (k === 'ArrowLeft' || lower === 'a') {
      if (e.target.type === 'range') return;
      handled();
      if (paged) mode === 'rtl' ? ctl.next() : ctl.prev();
      else ctl.step(-1);
    } else if (paged && (k === ' ' || k === 'PageDown' || k === 'PageUp')) {
      const back = k === 'PageUp' || e.shiftKey;
      const doc = document.documentElement;
      const canScroll = back ? scrollY > 2 : innerHeight + scrollY < doc.scrollHeight - 2;
      if (canScroll) return; // let the browser scroll a tall page first
      handled();
      back ? ctl.prev() : ctl.next();
    } else if (paged && k === 'Home') { handled(); ctl.first(); }
    else if (paged && k === 'End') { handled(); ctl.last(); }
    else if (k === '[' || lower === 'p') { handled(); prevCh ? goChapter(prevCh) : toast(t('r.firstChapter')); }
    else if (k === ']' || lower === 'n') { handled(); nextCh ? goChapter(nextCh) : toast(t('r.lastChapter')); }
    else if (lower === 'c') { handled(); openChapters(); }
    else if (lower === 's') { handled(); openSettings(); }
    else if (lower === 'm' || k === 'Enter') { handled(); toggleUI(); }
    else if (lower === 'f') { handled(); toggleFullscreen(); }
    else if (k === 'Escape') { handled(); saveSoon.flush(); goBack(seriesHref(s)); }
  });

  /* ---------- Start ---------- */
  build();
  if (N) {
    store.setProgress(s.id, ch.id, Math.min(cur, N - 1), N);
  }
  if (rs().wakeLock) wake(true);
  // Hide the menu shortly after opening so the page is unobstructed.
  const hideTimer = setTimeout(() => { if (!el.querySelector('.r-bar:focus-within')) setUI(false); }, 2500);

  return () => {
    clearTimeout(hideTimer);
    stageAc?.abort();
    ac.abort();
    saveSoon.flush();
    wake(false);
  };
}
