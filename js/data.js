// Reads window.CATALOG (data/catalog.js) and turns it into normalized, sorted series/chapter objects.
const RAW = window.CATALOG || {};
export const catalogLoaded = !!window.CATALOG;

export const site = {
  title: 'Comics',
  description: '',
  language: '',
  logo: '',
  links: [],
  ...(RAW.site || {}),
};

const CATBOX = 'https://files.catbox.moe/';

/** "abc123.jpg" -> catbox URL; full URLs, data: URIs and relative paths are kept as-is. */
export function resolveUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (/^(files\.)?catbox\.moe\//i.test(u)) return 'https://' + u;
  if (u.includes('/')) return u;
  return CATBOX + u;
}

// Ukrainian (and common Russian) letters -> Latin, so generated IDs make clean, ASCII links.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '', "'": '', '’': '', 'ʼ': '',
};

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[а-яіїєґёыэъ'’ʼ]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'series';
}

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const toNum = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toDate = (d) => {
  if (!d) return 0;
  const ms = typeof d === 'number' ? d : Date.parse(d);
  return Number.isNaN(ms) ? 0 : ms;
};
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).map((x) => x.trim()).filter(Boolean);

const MODE_ALIASES = { vertical: 'vertical', webtoon: 'vertical', longstrip: 'vertical', ltr: 'ltr', paged: 'ltr', comic: 'ltr', rtl: 'rtl', manga: 'rtl' };
const VERTICAL_TYPES = ['manhwa', 'manhua', 'webtoon'];
export const STATUSES = ['ongoing', 'completed', 'hiatus', 'dropped'];

const safeLinks = (v) => (Array.isArray(v) ? v : []).filter((l) => l && /^https?:\/\//i.test(l.url));
site.links = safeLinks(site.links);

export const series = [];
export const byId = new Map();
const problems = [];

(RAW.series || []).forEach((s, i) => {
  if (!s || !s.title) return problems.push(`series #${i + 1} has no "title" and was skipped`);
  let id = String(s.id || slugify(s.title));
  if (byId.has(id)) {
    problems.push(`duplicate series id "${id}"`);
    id = `${id}-${i + 1}`;
  }

  const chapters = [];
  const seen = new Set();
  (s.chapters || []).forEach((c, j) => {
    if (!c) return;
    const number = toNum(c.number);
    let cid = String(c.id ?? (number != null ? number : j + 1));
    if (seen.has(cid)) {
      problems.push(`"${id}": duplicate chapter "${cid}"`);
      cid = `${cid}-${j + 1}`;
    }
    seen.add(cid);
    const pages = list(c.pages).map(resolveUrl);
    if (!pages.length) problems.push(`"${id}" chapter "${cid}" has no pages`);
    chapters.push({
      id: cid,
      seriesId: id,
      number,
      name: c.name ? String(c.name) : '',
      volume: toNum(c.volume) ?? (c.volume ? String(c.volume) : null),
      title: c.title ? String(c.title) : '',
      date: toDate(c.date),
      pages,
      order: j,
    });
  });
  if (chapters.every((c) => c.number != null)) chapters.sort((a, b) => a.number - b.number || a.order - b.order);
  chapters.forEach((c, k) => (c.index = k));

  const type = s.type ? String(s.type).toLowerCase() : '';
  const status = STATUSES.includes(String(s.status).toLowerCase()) ? String(s.status).toLowerCase() : 'ongoing';
  const mode = MODE_ALIASES[String(s.readingMode || '').toLowerCase()] ||
    (VERTICAL_TYPES.includes(type) ? 'vertical' : type === 'manga' ? 'rtl' : 'ltr');
  // The single episode of a one-shot is labelled "One-shot" rather than "Ep. 1".
  if (type === 'oneshot' && chapters.length === 1) chapters[0].oneshot = true;
  const dates = chapters.map((c) => c.date).filter(Boolean);
  const altTitles = list(s.altTitles);
  const tags = list(s.tags);

  const item = {
    id,
    title: String(s.title),
    altTitles,
    cover: resolveUrl(s.cover) || chapters[0]?.pages[0] || '',
    author: s.author ? String(s.author) : '',
    artist: s.artist ? String(s.artist) : '',
    status,
    type,
    year: s.year ? String(s.year) : '',
    tags,
    description: s.description ? String(s.description) : '',
    readingMode: mode,
    links: safeLinks(s.links),
    chapters,
    updated: dates.length ? Math.max(...dates) : 0,
    added: toDate(s.added) || (dates.length ? Math.min(...dates) : 0),
    order: i,
  };
  item.searchText = norm([item.title, ...altTitles, item.author, item.artist, ...tags].join(' '));
  series.push(item);
  byId.set(id, item);
});

if (problems.length) console.warn('[catalog] ' + problems.join('\n[catalog] '));

export const allTags = [...new Set(series.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b));
export const allTypes = [...new Set(series.map((s) => s.type).filter(Boolean))].sort();

export function findChapter(sid, cid) {
  const s = byId.get(sid);
  return s ? { s, c: s.chapters.find((c) => c.id === cid) || null } : { s: null, c: null };
}

/** Most recently released chapters across all series. */
export function latestChapters(limit = 20) {
  return series
    .flatMap((s) => s.chapters.filter((c) => c.date).map((c) => ({ s, c })))
    .sort((a, b) => b.c.date - a.c.date || b.c.index - a.c.index)
    .slice(0, limit);
}

/**
 * Latest releases for the home page: episodes of one series released on the same day are folded
 * into one entry (the newest episode + `more`), so a batch upload doesn't push everything else out.
 */
export function latestReleases(limit = 14) {
  const out = [];
  const byKey = new Map();
  for (const x of latestChapters(Infinity)) {
    const key = `${x.s.id}\n${new Date(x.c.date).toDateString()}`;
    const entry = byKey.get(key);
    if (entry) {
      entry.more++;
    } else if (out.length < limit) {
      const e = { ...x, more: 0 };
      byKey.set(key, e);
      out.push(e);
    }
  }
  return out;
}

export const NEW_DAYS = 7;
// Episodes released together with the series itself (a back catalogue uploaded at once) don't all
// count as new: only the newest of them does. Later episodes are new for NEW_DAYS as usual.
export const isNew = (c) => {
  if (!c.date || Date.now() - c.date >= NEW_DAYS * 864e5) return false;
  const s = byId.get(c.seriesId);
  return !s || c.date > s.added || c.index === s.chapters.length - 1;
};
