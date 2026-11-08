import { site, series, latestReleases } from '../data.js';
import { store } from '../store.js';
import { t } from '../i18n.js';
import { html, icon } from '../ui.js';
import { seriesCard, continueCard, updateRow, resumeTarget, emptyState, seriesHref } from '../components.js';

const HOME_GRID_LIMIT = 12;

export default function home({ root }) {
  if (!series.length) {
    root.innerHTML = String(emptyState('book', t('home.emptyTitle'), t('home.emptyText')));
    return;
  }

  const recent = Object.entries(store.state.history)
    .sort((a, b) => b[1].t - a[1].t)
    .map(([sid]) => series.find((s) => s.id === sid))
    .filter(Boolean)
    .map((s) => ({ s, target: resumeTarget(s) }))
    .filter((x) => x.target && x.target.kind !== 'done')
    .slice(0, 12);

  const updates = latestReleases(8);
  const all = [...series].sort((a, b) => b.updated - a.updated);

  root.innerHTML = String(html`
    <section class="hero">
      <div class="hero-text">
        <h1>${site.title}</h1>
        ${site.description ? html`<p>${site.description}</p>` : ''}
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/catalog">${icon('grid')}<span>${t('home.browse')}</span></a>
        <button class="btn" type="button" data-random>${icon('shuffle')}<span>${t('home.random')}</span></button>
        ${site.links.map((l) => html`<a class="btn btn-ghost" href="${l.url}" target="_blank" rel="noopener">${icon('external')}<span>${l.label}</span></a>`)}
      </div>
    </section>

    ${recent.length ? html`<section class="section">
      <div class="section-head"><h2>${t('home.continue')}</h2><a class="link" href="#/library?tab=history">${t('seeAll')}</a></div>
      <div class="hscroll">${recent.map(({ s, target }) => continueCard(s, target))}</div>
    </section>` : ''}

    ${updates.length ? html`<section class="section">
      <div class="section-head"><h2>${t('home.latest')}</h2></div>
      <div class="urows">${updates.map(({ s, c, more }) => updateRow(s, c, more))}</div>
    </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>${t('home.all')} <span class="count">${series.length}</span></h2>
        ${series.length > HOME_GRID_LIMIT ? html`<a class="link" href="#/catalog">${t('seeAll')}</a>` : ''}</div>
      <div class="grid">${all.slice(0, HOME_GRID_LIMIT).map(seriesCard)}</div>
    </section>
  `);

  root.querySelector('[data-random]').addEventListener('click', () => {
    const s = series[Math.floor(Math.random() * series.length)];
    location.hash = seriesHref(s);
  });
}
