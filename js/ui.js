// Small UI toolkit: safe HTML templating, icons, toasts, sheets and settings controls.
import { t } from './i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function flat(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(flat).join('');
  return esc(v);
}

/**
 * Tagged template: interpolated values are escaped unless wrapped in raw()/html``.
 * false/null render as nothing (for `${cond && html`...`}`), except directly inside an
 * attribute value, where booleans become "true"/"false" (aria-pressed="${on}").
 */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    out += (typeof v === 'boolean' && strings[i].endsWith('="') ? String(v) : flat(v)) + strings[i + 1];
  }
  return new Raw(out);
}

/** Safe CSS url() value for inline styles. */
export const cssUrl = (u) => `url("${String(u).replace(/["\\\n\r]/g, encodeURIComponent)}")`;

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  chevLeft: 'm15 18-6-6 6-6',
  chevRight: 'm9 18 6-6-6-6',
  chevDown: 'm6 9 6 6 6-6',
  chevsLeft: 'm11 17-5-5 5-5M18 17l-5-5 5-5',
  chevsRight: 'm13 17 5-5-5-5M6 17l5-5-5-5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  x: 'M18 6 6 18M6 6l12 12',
  heart: 'M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.5-9 9-9 9z',
  heartFill: '<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.5-9 9-9 9z" fill="currentColor"/>',
  check: 'M20 6 9 17l-5-5',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
  maximize: 'M8 3H3v5M21 8V3h-5M16 21h5v-5M3 16v5h5',
  minimize: 'M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  book: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  external: 'M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  rows: 'M4 5h16M4 12h16M4 19h16',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  telegram: 'M21.5 3.5 2.8 10.7c-.9.4-.9 1.6 0 1.9l4.7 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.7-2.6 4.6 3.4c.6.4 1.4.1 1.6-.6L22.9 4.9c.2-.9-.6-1.7-1.4-1.4zM7.6 14.1l11-7.2-8.6 8.9',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
};

export function icon(name, cls = '') {
  const d = ICONS[name] || '';
  const inner = d.startsWith('<') ? d : `<path d="${d}"/>`;
  return raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`);
}

export function debounce(fn, ms) {
  let id;
  const d = (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(id); fn(...a); };
  d.cancel = () => clearTimeout(id);
  return d;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- Toasts ---------- */
let toastWrap;
export function toast(msg, ms = 2200) {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toasts';
    toastWrap.setAttribute('role', 'status');
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.append(toastWrap);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastWrap.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ---------- Sheets (bottom sheet on phones, dialog/drawer on desktop) ---------- */
const openSheets = [];
// Only the top sheet takes focus and clicks: everything behind it (the page, lower sheets) is inert,
// so Tab can't wander out of a dialog. Toasts stay usable.
function syncInert() {
  const top = openSheets.at(-1)?.el;
  for (const el of document.body.children) {
    if (el.classList.contains('toasts')) continue;
    el.inert = !!top && el !== top;
  }
}

export function openSheet({ title, body, side = false, className = '', onClose }) {
  const wrap = document.createElement('div');
  wrap.className = `sheet-wrap ${side ? 'is-side' : ''} ${className}`;
  wrap.innerHTML = String(html`
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-head">
        <h2>${title}</h2>
        <button class="btn-icon" type="button" data-close aria-label="${t('close')}">${icon('x')}</button>
      </div>
      <div class="sheet-body"></div>
    </div>`);
  const bodyEl = wrap.querySelector('.sheet-body');
  if (body instanceof Node) bodyEl.append(body);
  else if (body != null) bodyEl.innerHTML = String(body);
  document.body.append(wrap);
  document.documentElement.classList.add('has-sheet');
  const prevFocus = document.activeElement;
  const panel = wrap.querySelector('.sheet');

  const api = {
    el: wrap,
    body: bodyEl,
    close() {
      if (!wrap.isConnected || wrap.classList.contains('closing')) return;
      wrap.classList.add('closing');
      wrap.classList.remove('open');
      const i = openSheets.indexOf(api);
      if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) document.documentElement.classList.remove('has-sheet');
      syncInert();
      setTimeout(() => wrap.remove(), 220);
      onClose?.();
      if (prevFocus?.isConnected) prevFocus.focus?.({ preventScroll: true });
    },
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) api.close();
  });
  // Swipe the handle/header down to close on touch devices.
  let startY = null;
  panel.addEventListener('touchstart', (e) => {
    startY = e.target.closest('.sheet-head, .sheet-handle') ? e.touches[0].clientY : null;
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (startY != null && e.changedTouches[0].clientY - startY > 60) api.close();
    startY = null;
  });
  openSheets.push(api);
  syncInert();
  requestAnimationFrame(() => {
    wrap.classList.add('open');
    if (!wrap.contains(document.activeElement)) panel.focus({ preventScroll: true });
  });
  return api;
}

export const hasOpenSheet = () => openSheets.length > 0;
export function closeTopSheet() {
  const s = openSheets.at(-1);
  if (!s) return false;
  s.close();
  return true;
}
export function closeAllSheets() {
  [...openSheets].forEach((s) => s.close());
}

export function confirmSheet(message, okLabel, { danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const sheet = openSheet({
      title: t('confirm.title'),
      body: html`<p class="confirm-msg">${message}</p>
        <div class="btn-row end">
          <button class="btn" type="button" data-close>${t('cancel')}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${okLabel}</button>
        </div>`,
      onClose: () => resolve(result),
    });
    sheet.body.querySelector('[data-ok]').addEventListener('click', () => {
      result = true;
      sheet.close();
    });
  });
}

/* ---------- Settings controls ---------- */
// def: { key, label, type: 'seg'|'toggle'|'range'|'select', options: [[value, label]], min, max, step, format, hint, show(values) }
export function renderControls(defs, values) {
  return html`${defs.filter((d) => !d.show || d.show(values)).map((d) => {
    const v = values[d.key];
    const id = `ctl-${d.key}`;
    if (d.type === 'seg') {
      return html`<div class="field">
        <div class="field-label" id="${id}">${d.label}</div>
        <div class="seg" role="radiogroup" aria-labelledby="${id}">
          ${d.options.map(([ov, ol]) => html`<button type="button" role="radio" aria-checked="${String(ov) === String(v)}"
            data-ctl="${d.key}" data-val="${ov}">${ol}</button>`)}
        </div>
        ${d.hint ? html`<div class="field-hint">${d.hint}</div>` : ''}
      </div>`;
    }
    if (d.type === 'toggle') {
      return html`<label class="field field-row">
        <span class="field-text">${d.label}${d.hint ? html`<small>${d.hint}</small>` : ''}</span>
        <input type="checkbox" class="switch" data-ctl="${d.key}" ${v ? raw('checked') : ''}>
      </label>`;
    }
    if (d.type === 'range') {
      return html`<div class="field">
        <label class="field-label" for="${id}">${d.label} <output>${d.format ? d.format(v) : v}</output></label>
        <input id="${id}" type="range" min="${d.min}" max="${d.max}" step="${d.step || 1}" value="${v}" data-ctl="${d.key}">
      </div>`;
    }
    if (d.type === 'select') {
      return html`<label class="field">
        <span class="field-label">${d.label}</span>
        <select class="select" data-ctl="${d.key}">
          ${d.options.map(([ov, ol]) => html`<option value="${ov}" ${String(ov) === String(v) ? raw('selected') : ''}>${ol}</option>`)}
        </select>
      </label>`;
    }
    return '';
  })}`;
}

/** Renders controls into `el` and keeps them in sync. getValues() returns the current values object. */
export function mountControls(el, defs, getValues, onChange) {
  const render = () => { el.innerHTML = String(renderControls(defs, getValues())); };
  render();
  const rerender = (focusSel) => {
    render();
    if (focusSel) el.querySelector(focusSel)?.focus();
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ctl]');
    if (!b) return;
    onChange(b.dataset.ctl, b.dataset.val);
    rerender(`button[data-ctl="${b.dataset.ctl}"][data-val="${CSS.escape(b.dataset.val)}"]`);
  });
  el.addEventListener('input', (e) => {
    const r = e.target.closest('input[type=range][data-ctl]');
    if (!r) return;
    const d = defs.find((x) => x.key === r.dataset.ctl);
    const v = Number(r.value);
    const out = r.parentElement.querySelector('output');
    if (out) out.textContent = d?.format ? d.format(v) : v;
    onChange(r.dataset.ctl, v);
  });
  el.addEventListener('change', (e) => {
    const c = e.target;
    if (!c.dataset?.ctl || c.type === 'range') return;
    if (c.type === 'checkbox') onChange(c.dataset.ctl, c.checked);
    else if (c.tagName === 'SELECT') onChange(c.dataset.ctl, c.value);
    rerender(`[data-ctl="${c.dataset.ctl}"]`);
  });
  return { render };
}
