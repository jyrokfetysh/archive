// Comparing and merging catalogue versions:
//  - diffCatalog() lists what will really change (shown before publishing, so nothing slips in unseen),
//  - mergeCatalog() combines my edits with edits someone else published meanwhile (three-way merge
//    per series, per field and per chapter), instead of overwriting their work.

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const seriesKey = (s, i) => String(s?.id ?? s?.title ?? `#${i}`);
export const chapterKey = (c, i) => String(c?.id ?? c?.number ?? c?.name ?? `#${i}`);

function mergeList(base = [], mine = [], theirs = [], key, mergeItem, conflicts) {
  const B = new Map(base.map((x, i) => [key(x, i), x]));
  const M = new Map(mine.map((x, i) => [key(x, i), x]));
  const out = [];
  const seen = new Set();
  // Their order first…
  theirs.forEach((t, i) => {
    const k = key(t, i);
    seen.add(k);
    const b = B.get(k);
    const m = M.get(k);
    if (!b && !m) return out.push(t); // they added it
    if (b && !m) { // I deleted it
      if (!same(t, b)) { conflicts.push(k); out.push(t); } // …but they changed it: keep theirs
      return;
    }
    if (!b) { // both added the same key
      if (!same(m, t)) conflicts.push(k);
      return out.push(mergeItem ? mergeItem({}, m, t, conflicts) : m);
    }
    out.push(mergeItem ? mergeItem(b, m, t, conflicts) : same(m, b) ? t : same(t, b) ? m : (conflicts.push(k), m));
  });
  // …then what only I have.
  mine.forEach((m, i) => {
    const k = key(m, i);
    if (seen.has(k)) return;
    if (B.has(k)) { // they deleted it
      if (!same(m, B.get(k))) { conflicts.push(k); out.push(m); } // …but I changed it: keep mine
      return;
    }
    out.push(m); // I added it
  });
  return out;
}

function mergeObject(b = {}, m = {}, t = {}, conflicts, lists = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)])) {
    if (lists[k]) {
      out[k] = mergeList(b[k], m[k], t[k], lists[k], null, conflicts);
      continue;
    }
    const v = same(m[k], b[k]) ? t[k] : same(t[k], b[k]) ? m[k] : (conflicts.push(k), m[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** -> { catalog, conflicts } — on a real conflict (both changed the same thing) my version wins. */
export function mergeCatalog(base, mine, theirs) {
  const conflicts = [];
  const site = mergeObject(base.site, mine.site, theirs.site, conflicts);
  const series = mergeList(base.series, mine.series, theirs.series, seriesKey,
    (b, m, t, c) => mergeObject(b, m, t, c, { chapters: chapterKey }), conflicts);
  return { catalog: { ...theirs, site, series }, conflicts };
}

/** Human-readable list of differences: [{ type, series, chapter?, fields?, pages? }]. */
export function diffCatalog(base, cur) {
  const out = [];
  if (!same(base.site, cur.site)) {
    out.push({ type: 'site', fields: Object.keys({ ...base.site, ...cur.site }).filter((k) => !same(base.site?.[k], cur.site?.[k])) });
  }
  const B = new Map(base.series.map((s, i) => [seriesKey(s, i), s]));
  const C = new Map(cur.series.map((s, i) => [seriesKey(s, i), s]));
  for (const [k, s] of C) {
    const b = B.get(k);
    if (!b) {
      out.push({ type: 'seriesAdd', series: s, n: s.chapters?.length || 0 });
      continue;
    }
    const fields = Object.keys({ ...b, ...s }).filter((f) => f !== 'chapters' && !same(b[f], s[f]));
    if (fields.length) out.push({ type: 'seriesEdit', series: s, fields });
    const bc = new Map((b.chapters || []).map((c, i) => [chapterKey(c, i), c]));
    const cc = new Map((s.chapters || []).map((c, i) => [chapterKey(c, i), c]));
    for (const [ck, c] of cc) {
      const old = bc.get(ck);
      if (!old) out.push({ type: 'chapterAdd', series: s, chapter: c, pages: c.pages?.length || 0 });
      else if (!same(old, c)) {
        out.push({ type: 'chapterEdit', series: s, chapter: c, fields: Object.keys({ ...old, ...c }).filter((f) => !same(old[f], c[f])) });
      }
    }
    for (const [ck, c] of bc) if (!cc.has(ck)) out.push({ type: 'chapterDel', series: s, chapter: c });
  }
  for (const [k, b] of B) if (!C.has(k)) out.push({ type: 'seriesDel', series: b, n: b.chapters?.length || 0 });
  return out;
}

/** Light structural check for drafts read back from localStorage. */
export function looksLikeCatalog(c) {
  const str = (v) => v == null || typeof v === 'string' || typeof v === 'number';
  return !!c && typeof c === 'object' && !Array.isArray(c) && Array.isArray(c.series)
    && (c.site == null || (typeof c.site === 'object' && !Array.isArray(c.site)))
    && c.series.every((s) => s && typeof s === 'object' && typeof s.title === 'string' && str(s.id) && str(s.cover)
      && (s.chapters == null || (Array.isArray(s.chapters) && s.chapters.every((ch) => ch && typeof ch === 'object'
        && Array.isArray(ch.pages) && ch.pages.every((p) => typeof p === 'string')))));
}
