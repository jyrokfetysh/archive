// Translator tool: turn pasted catbox links into a ready-to-paste chapter entry for data/catalog.js.
import { series, resolveUrl } from '../data.js';
import { t } from '../i18n.js';
import { html, icon, toast, copyText, debounce } from '../ui.js';
import { telegramPost } from '../components.js';

const CATBOX_RE = /(?:https?:\/\/)?files\.catbox\.moe\/([\w-]+\.\w{2,5})/gi;
const URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>]*)?/gi;
const NAME_RE = /^[\w-]+\.(?:jpe?g|png|webp|gif|avif)$/i;

/** Pull page references out of arbitrary pasted text, keeping order and dropping duplicates. */
export function extractPages(text) {
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const before = found.length;
    for (const m of line.matchAll(CATBOX_RE)) found.push(m[1]);
    if (found.length === before) for (const m of line.matchAll(URL_RE)) found.push(m[0]);
    if (found.length === before) {
      for (const word of line.trim().split(/[\s,;]+/)) if (NAME_RE.test(word)) found.push(word);
    }
  }
  return [...new Set(found)];
}

const js = (v) => JSON.stringify(v);

export default function builder({ root }) {
  document.title = `${t('b.title')} — ${document.title}`;
  const today = new Date().toISOString().slice(0, 10);
  let pages = [];

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('b.title')}</h1></div>
    <p class="muted">${t('b.intro')}</p>
    <div class="builder">
      <section class="panel">
        <label class="field"><span class="field-label">${t('b.series')}</span>
          <select class="select" data-k="series">
            <option value="">${t('b.newSeries')}</option>
            ${series.map((s) => html`<option value="${s.id}">${s.title}</option>`)}
          </select></label>
        <div class="field-grid">
          <label class="field"><span class="field-label">${t('b.number')}</span><input class="input" data-k="number" inputmode="decimal" value="1"></label>
          <label class="field"><span class="field-label">${t('b.date')}</span><input class="input" type="date" data-k="date" value="${today}"></label>
        </div>
        <label class="field"><span class="field-label">${t('b.chTitle')}</span><input class="input" data-k="title"></label>
        <label class="field"><span class="field-label">${t('b.links')}</span>
          <textarea class="input textarea" data-k="links" rows="8" spellcheck="false" placeholder="https://files.catbox.moe/abc123.jpg&#10;https://files.catbox.moe/def456.png"></textarea>
          <span class="field-hint">${t('b.linksHint')}</span></label>
        <div class="btn-row">
          <span class="muted" data-found></span>
          <button class="btn btn-sm" type="button" data-reverse>${icon('sort')}<span>${t('b.reverse')}</span></button>
          <button class="btn btn-sm" type="button" data-sortname>${icon('list')}<span>${t('b.sortName')}</span></button>
          <button class="btn btn-sm btn-ghost" type="button" data-clear>${icon('x')}<span>${t('b.clear')}</span></button>
        </div>
      </section>

      <section class="panel">
        <div class="section-head"><h2>${t('b.output')}</h2>
          <button class="btn btn-primary btn-sm" type="button" data-copy="out">${icon('copy')}<span>${t('b.copy')}</span></button></div>
        <pre class="code" data-out></pre>
        <div data-tpl-wrap hidden>
          <div class="section-head"><h2>${t('b.seriesTpl')}</h2>
            <button class="btn btn-sm" type="button" data-copy="tpl">${icon('copy')}<span>${t('b.copy')}</span></button></div>
          <p class="field-hint">${t('b.seriesTplHint')}</p>
          <pre class="code" data-tpl></pre>
        </div>
      </section>

      <section class="panel" data-tg-wrap hidden>
        <div class="section-head"><h2>${icon('telegram')} ${t('b.tgTitle')}</h2>
          <button class="btn btn-sm" type="button" data-copy="tg">${icon('copy')}<span>${t('b.copy')}</span></button></div>
        <p class="field-hint">${t('b.tgHint')}</p>
        <pre class="code code-wrap" data-tg></pre>
      </section>

      <section class="panel" data-preview-wrap hidden>
        <h2>${t('b.preview')}</h2>
        <div class="thumbs" data-preview></div>
      </section>
    </div>`);

  const $ = (q) => root.querySelector(q);
  const val = (k) => $(`[data-k="${k}"]`).value.trim();

  // Pre-fill the next chapter number when an existing series is picked.
  $('[data-k="series"]').addEventListener('change', (e) => {
    const s = series.find((x) => x.id === e.target.value);
    const nums = s?.chapters.map((c) => c.number).filter((n) => n != null) || [];
    $('[data-k="number"]').value = nums.length ? Math.floor(Math.max(...nums)) + 1 : 1;
    update();
  });

  function chapterSnippet() {
    const n = Number(val('number'));
    const lines = [
      `  number: ${Number.isFinite(n) && val('number') !== '' ? n : js(val('number'))},`,
      val('title') ? `  title: ${js(val('title'))},` : null,
      `  date: ${js(val('date') || today)},`,
      `  pages: [\n${pages.map((p) => `    ${js(p)},`).join('\n')}\n  ],`,
    ].filter(Boolean);
    return `{\n${lines.join('\n')}\n},`;
  }

  function seriesSnippet() {
    return `{
  id: "my-series",            // used in links: #/series/my-series
  title: "Series title",
  altTitles: ["Original title"],
  cover: ${js(pages[0] || 'cover.jpg')},
  author: "",
  artist: "",
  type: "comic",              // comic | oneshot | manga | manhwa | manhua | webtoon
  status: "ongoing",          // ongoing | completed | hiatus | dropped
  readingMode: "vertical",    // vertical | ltr | rtl (optional)
  tags: ["Фідеризм"],
  description: "",
  chapters: [
${chapterSnippet().replace(/^/gm, '    ')}
  ],
},`;
  }

  function update() {
    $('[data-found]').textContent = t('b.found', { n: pages.length });
    $('[data-out]').textContent = chapterSnippet();
    const isNewSeries = !val('series');
    $('[data-tpl-wrap]').hidden = !isNewSeries;
    if (isNewSeries) $('[data-tpl]').textContent = seriesSnippet();
    const s = series.find((x) => x.id === val('series'));
    $('[data-tg-wrap]').hidden = !s;
    if (s) $('[data-tg]').textContent = telegramPost(s, { id: val('number') || '1', number: Number(val('number')) || null, title: val('title'), index: 0 });
    $('[data-preview-wrap]').hidden = !pages.length;
    $('[data-preview]').innerHTML = String(html`${pages.map((p, i) => html`<figure class="thumb">
        <img src="${resolveUrl(p)}" alt="" loading="lazy">
        <figcaption>${i + 1}</figcaption>
        <button class="btn-icon" type="button" data-rm="${i}" aria-label="${t('b.remove')}" title="${t('b.remove')}">${icon('x')}</button>
      </figure>`)}`);
  }

  const parseSoon = debounce(() => {
    pages = extractPages($('[data-k="links"]').value);
    update();
  }, 150);
  $('[data-k="links"]').addEventListener('input', parseSoon);
  root.addEventListener('input', (e) => {
    if (e.target.dataset.k && e.target.dataset.k !== 'links') update();
  });

  const writeBack = () => {
    $('[data-k="links"]').value = pages.join('\n');
    update();
  };
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-reverse]')) { pages.reverse(); writeBack(); }
    else if (b.matches('[data-sortname]')) { pages.sort((a, z) => a.localeCompare(z, undefined, { numeric: true })); writeBack(); }
    else if (b.matches('[data-clear]')) { pages = []; writeBack(); }
    else if (b.matches('[data-rm]')) { pages.splice(+b.dataset.rm, 1); writeBack(); }
    else if (b.matches('[data-copy]')) {
      const text = { tpl: seriesSnippet, tg: () => $('[data-tg]').textContent }[b.dataset.copy]?.() ?? chapterSnippet();
      if (await copyText(text)) toast(t('b.copied'));
    }
  });

  update();
  return () => parseSoon.cancel();
}

