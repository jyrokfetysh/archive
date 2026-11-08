// Theme list (colours here are only for the picker swatches; the real palettes live in css/style.css).
import { html } from './ui.js';
import { t } from './i18n.js';
import { store } from './store.js';

export const THEMES = [
  { id: 'system' },
  { id: 'peach', bg: '#fff6ef', card: '#ffffff', fg: '#3b261f', accent: '#d4472b' },
  { id: 'cocoa', bg: '#1a1311', card: '#251b18', fg: '#f6e9e1', accent: '#ff9a76' },
  { id: 'light', bg: '#f6f7f9', card: '#ffffff', fg: '#15171a', accent: '#5b4cf0' },
  { id: 'dark', bg: '#121316', card: '#1d1f24', fg: '#e9eaee', accent: '#8b7dff' },
  { id: 'amoled', bg: '#000000', card: '#141416', fg: '#e6e6e6', accent: '#9d8fff' },
  { id: 'sepia', bg: '#f4ecd8', card: '#fbf5e6', fg: '#3b2f22', accent: '#b3541e' },
  { id: 'midnight', bg: '#0f1729', card: '#1a2542', fg: '#dbe4ff', accent: '#5eb1ff' },
  { id: 'sakura', bg: '#fff5f7', card: '#ffffff', fg: '#3a2230', accent: '#e0457b' },
];

export function themeGrid() {
  const cur = store.state.settings.theme;
  return html`<div class="theme-grid" role="radiogroup" aria-label="${t('set.theme')}">
    ${THEMES.map((th) => html`<button type="button" class="theme-opt" role="radio" aria-checked="${cur === th.id}" data-theme-id="${th.id}">
      <span class="theme-swatch" style="${th.id === 'system'
        ? 'background:linear-gradient(135deg,#fff6ef 50%,#1a1311 50%)'
        : `background:${th.bg}`}">
        <i style="background:${th.accent || '#8b7dff'}"></i><b style="background:${th.card || 'rgba(127,127,127,.35)'}"></b>
      </span>
      <span>${t(`theme.${th.id}`)}</span>
    </button>`)}
  </div>`;
}

/** Wires a container that holds themeGrid() so clicks switch the theme and refresh the grid. */
export function bindThemeGrid(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    store.setSetting('theme', b.dataset.themeId);
    el.innerHTML = String(themeGrid());
    el.querySelector(`[data-theme-id="${b.dataset.themeId}"]`)?.focus();
  });
}
