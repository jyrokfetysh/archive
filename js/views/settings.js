import { site } from '../data.js';
import { store } from '../store.js';
import { t, LANGS, getLang } from '../i18n.js';
import { html, icon, raw, toast, confirmSheet, mountControls } from '../ui.js';
import { themeGrid, bindThemeGrid } from '../themes.js';
import { showShortcuts } from '../components.js';
import { readerControlDefs } from './reader.js';

const LANG_NAMES = { en: 'English', uk: 'Українська' };

let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

export default function settings({ root }) {
  document.title = `${t('set.title')} — ${document.title}`;
  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('set.title')}</h1></div>
    <div class="settings">
      <section class="panel">
        <h2>${t('set.appearance')}</h2>
        <div class="field-label">${t('set.theme')}</div>
        <div data-themes>${themeGrid()}</div>
        <label class="field">
          <span class="field-label">${t('set.language')}</span>
          <select class="select" data-lang>
            ${LANGS.map((l) => html`<option value="${l}" ${l === getLang() ? raw('selected') : ''}>${LANG_NAMES[l] || l}</option>`)}
          </select>
        </label>
      </section>

      <section class="panel">
        <h2>${t('set.reader')}</h2>
        <div class="controls" data-reader></div>
      </section>

      ${installPrompt ? html`<section class="panel">
        <h2>${t('set.install')}</h2>
        <p class="muted">${t('set.installText')}</p>
        <button class="btn btn-primary" type="button" data-install>${icon('download')}<span>${t('set.install')}</span></button>
      </section>` : ''}

      <section class="panel">
        <h2>${t('set.data')}</h2>
        <p class="muted">${t('set.dataText')}</p>
        <div class="btn-row">
          <button class="btn" type="button" data-export>${icon('download')}<span>${t('set.export')}</span></button>
          <label class="btn">${icon('upload')}<span>${t('set.import')}</span><input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" type="button" data-clear-read>${icon('refresh')}<span>${t('set.clearRead')}</span></button>
          <button class="btn btn-ghost btn-danger-text" type="button" data-reset>${icon('trash')}<span>${t('set.reset')}</span></button>
        </div>
      </section>

      <section class="panel">
        <h2>${t('set.about')}</h2>
        ${site.description ? html`<p class="muted">${site.description}</p>` : ''}
        <p class="field-hint">${t('about.fan')}</p>
        <div class="menu-list">
          ${site.links.map((l) => html`<a href="${l.url}" target="_blank" rel="noopener">${icon('external')}<span>${l.label}</span></a>`)}
          <button type="button" data-keys>${icon('keyboard')}<span>${t('set.shortcuts')}</span></button>
          <a href="#/builder">${icon('edit')}<span>${t('set.builder')}</span></a>
        </div>
      </section>
    </div>`);

  bindThemeGrid(root.querySelector('[data-themes]'));
  root.querySelector('[data-lang]').addEventListener('change', (e) => store.setSetting('lang', e.target.value));
  mountControls(root.querySelector('[data-reader]'), readerControlDefs({ perSeries: false }),
    () => store.state.settings.reader, (key, val) => store.setSetting(`reader.${key}`, val));

  root.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(site.title || 'comics').replace(/[^\p{L}\p{N}]+/gu, '-')}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  root.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !('settings' in data || 'history' in data || 'favorites' in data)) throw new Error('bad');
      store.importData(data, true);
      toast(t('set.imported'));
    } catch {
      toast(t('set.importFail'));
    }
  });

  root.querySelector('[data-clear-read]').addEventListener('click', async () => {
    if (await confirmSheet(t('set.clearReadConfirm'), t('set.clearRead'), { danger: true })) {
      store.clearRead();
      toast(t('set.done'));
    }
  });
  root.querySelector('[data-reset]').addEventListener('click', async () => {
    if (await confirmSheet(t('set.resetConfirm'), t('set.reset'), { danger: true })) {
      store.resetAll();
      toast(t('set.done'));
    }
  });
  root.querySelector('[data-keys]').addEventListener('click', showShortcuts);
  root.querySelector('[data-install]')?.addEventListener('click', async () => {
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    root.querySelector('[data-install]')?.closest('.panel')?.remove();
  });
}
