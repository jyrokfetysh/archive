import { byId } from '../data.js';
import { store } from '../store.js';
import { t, chapterLabel, relTime } from '../i18n.js';
import { html, icon, toast, confirmSheet } from '../ui.js';
import { setQuery } from '../router.js';
import { seriesCard, emptyState, readHref, seriesHref, cover, unreadCount } from '../components.js';

export default function library({ root, query }) {
  let tab = query.get('tab') === 'history' ? 'history' : 'favorites';
  document.title = `${t('lib.title')} — ${document.title}`;

  const favs = () => Object.keys(store.state.favorites).map((id) => byId.get(id)).filter(Boolean)
    // Series with new chapters first, then most recently updated.
    .sort((a, b) => (unreadCount(b) > 0) - (unreadCount(a) > 0) || b.updated - a.updated);
  const hist = () => Object.entries(store.state.history)
    .map(([sid, h]) => ({ s: byId.get(sid), h }))
    .filter((x) => x.s)
    .sort((a, b) => b.h.t - a.h.t);

  function render() {
    const f = favs();
    const h = hist();
    root.innerHTML = String(html`
      <div class="page-head"><h1>${t('lib.title')}</h1></div>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="favorites" aria-selected="${tab === 'favorites'}">${icon('heart')}<span>${t('lib.favorites')}</span><span class="count">${f.length}</span></button>
        <button type="button" role="tab" data-tab="history" aria-selected="${tab === 'history'}">${icon('clock')}<span>${t('lib.history')}</span><span class="count">${h.length}</span></button>
      </div>
      <div role="tabpanel">
      ${tab === 'favorites'
        ? f.length ? html`<div class="grid">${f.map(seriesCard)}</div>`
          : emptyState('heart', t('lib.favEmpty'), t('lib.favEmptyText'), html`<a class="btn btn-primary" href="#/catalog">${t('home.browse')}</a>`)
        : h.length ? html`
          <div class="hrows">${h.map(({ s, h: e }) => {
            const c = s.chapters.find((x) => x.id === e.cid);
            const done = c && store.isRead(s.id, c.id);
            const pct = c ? Math.round(((e.page + 1) / Math.max(1, e.total)) * 100) : 0;
            return html`<div class="hrow">
              <a class="hrow-link" href="${c ? readHref(s, c, done ? null : e.page) : seriesHref(s)}">
                ${cover(s.cover, '', 'hrow-cover')}
                <div class="hrow-main">
                  <div class="hrow-title">${s.title}</div>
                  <div class="hrow-sub">${c ? `${chapterLabel(c)} · ` : ''}${done ? icon('check') : t('progress.page', { p: e.page + 1, n: e.total })} · ${relTime(e.t)}</div>
                  <div class="pbar"><span style="width:${done ? 100 : pct}%"></span></div>
                </div>
              </a>
              <button class="btn-icon" type="button" data-remove="${s.id}" aria-label="${t('lib.remove')}" title="${t('lib.remove')}">${icon('x')}</button>
            </div>`;
          })}</div>
          <div class="btn-row center"><button class="btn btn-ghost" type="button" data-clear>${icon('trash')}<span>${t('lib.clearHistory')}</span></button></div>`
          : emptyState('clock', t('lib.histEmpty'), t('lib.histEmptyText'), html`<a class="btn btn-primary" href="#/catalog">${t('home.browse')}</a>`)}
      </div>`);
  }

  root.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      tab = tb.dataset.tab;
      setQuery({ tab: tab === 'history' ? 'history' : '' });
      render();
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      store.removeHistory(rm.dataset.remove);
      toast(t('lib.removed'));
      render();
      return;
    }
    if (e.target.closest('[data-clear]') && await confirmSheet(t('lib.clearConfirm'), t('lib.clearHistory'), { danger: true })) {
      store.clearHistory();
      render();
    }
  });

  render();
}
