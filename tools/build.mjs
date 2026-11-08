#!/usr/bin/env node
/*
 * Builds the deployable site into _site/ (no dependencies, Node 18+):
 *   - copies the app as-is,
 *   - writes link-preview tags (Open Graph) into index.html from data/catalog.js,
 *   - creates a share page for every series and chapter: s/<series>/ and s/<series>/<chapter>/.
 *
 * Why: Telegram, Discord, WhatsApp… build link previews from the page's HTML without running
 * JavaScript, and they never see the "#/series/..." part of a link. A share page is a tiny static
 * HTML file with the right title, description and cover that immediately forwards readers to the app.
 *
 *   node tools/build.mjs [--base https://example.com/path/] [--out _site]
 *
 * The base URL comes from --base, then the SITE_URL environment variable, then site.url in catalog.js.
 * The GitHub Pages workflow (.github/workflows/pages.yml) passes it automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCatalogSource } from '../js/admin/catalog-io.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const outDir = path.resolve(root, arg('--out') || '_site');
// `pages/` holds images uploaded from the admin page.
const COPY = ['index.html', 'admin.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'assets', 'pages'];
// The output folder is deleted first: never let that be the project (or a part of it).
if (outDir === root || root.startsWith(outDir + path.sep) || COPY.some((c) => path.resolve(root, c) === outDir)) {
  throw new Error(`Refusing to build into ${outDir}`);
}

/* ---------- Load the catalogue like the browser does ---------- */
// catalog.js is edited from the admin page, so it's read as data and never executed.
const { catalog: raw } = parseCatalogSource(fs.readFileSync(path.join(root, 'data/catalog.js'), 'utf8'));
globalThis.window = { CATALOG: raw };
const { site, series } = await import(pathToFileURL(path.join(root, 'js/data.js')).href);

let base = arg('--base') || process.env.SITE_URL || site.url || '';
if (base && !base.endsWith('/')) base += '/';
if (!base) console.warn('! No base URL (use --base or set site.url): previews will not include absolute links.');

const lang = ['uk', 'en'].includes(site.language) ? site.language : 'en';
const L = {
  en: { chapter: 'Episode', oneshot: 'One-shot', vol: 'Vol.', chapters: (n) => `${n} episode${n === 1 ? '' : 's'}`, open: 'Open', locale: 'en_US' },
  uk: { chapter: 'Епізод', oneshot: 'Ваншот', vol: 'Том', chapters: (n) => `Епізодів: ${n}`, open: 'Відкрити', locale: 'uk_UA' },
}[lang];

/* ---------- Helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n = 220) => {
  const one = String(s || '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : one;
};
const abs = (u) => (/^https?:\/\//i.test(u) ? u : base ? new URL(u, base).href : u);
const siteImage = abs(site.image || 'assets/og-image.png');
// Preview bots need a full address; data: URIs can't be fetched at all.
const imageFor = (s) => (!s.cover || /^data:/i.test(s.cover) ? siteImage : abs(s.cover));
// IDs become folder names, so they must be plain names, never paths.
const safeId = (id) => !!id && !id.startsWith('.') && !/[/\\:*?"<>|\0-\x1f]/.test(id);
const chLabel = (c) => c.name || (c.oneshot && L.oneshot) || `${c.volume != null ? `${L.vol} ${c.volume} · ` : ''}${L.chapter} ${c.number ?? c.index + 1}`;
const enc = encodeURIComponent;

function ogTags({ type = 'website', title, description, image, url }) {
  return [
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(site.title)}">`,
    `<meta property="og:locale" content="${L.locale}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description && `<meta property="og:description" content="${esc(description)}">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    url && `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    description && `<meta name="twitter:description" content="${esc(description)}">`,
    image && `<meta name="twitter:image" content="${esc(image)}">`,
  ].filter(Boolean).join('\n  ');
}

// Share pages only exist for link previews and forward readers on at once, so search engines skip them (noindex).
function sharePage({ title, description, image, url, redirect, type, noindex = true }) {
  const target = JSON.stringify(redirect).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="rating" content="adult">
  <meta name="rating" content="RTA-5042-1996-1400-1577-RTA">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
  ${ogTags({ type, title, description, image, url })}
  <meta http-equiv="refresh" content="0; url=${esc(redirect)}">
  <script>location.replace(${target});</script>
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;background:#1a1311;color:#f6e9e1}a{color:#ff9a76}</style>
</head>
<body><p><a href="${esc(redirect)}">${esc(L.open)}: ${esc(title)}</a></p></body>
</html>
`;
}

function write(rel, content) {
  const file = path.resolve(outDir, rel);
  if (!file.startsWith(outDir + path.sep)) throw new Error(`Refusing to write outside ${outDir}: ${rel}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/* ---------- Copy the app ---------- */
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const item of COPY) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(outDir, item), { recursive: true });
}

/* ---------- index.html: real preview tags + flags for the app ---------- */
const homeTags = ogTags({ title: site.title, description: clip(site.description), image: siteImage, url: base || undefined });
let index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// (Replacements are functions so "$&"-like text in a title is never treated as a pattern.)
const shareMeta = `<meta name="jfc:share" content="1">${base ? `\n  <meta name="jfc:base" content="${esc(base)}">` : ''}`;
index = index
  .replace(/<!-- og:start[\s\S]*?<!-- og:end -->/, () => `${homeTags}\n  ${shareMeta}`)
  .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(site.title)}</title>`)
  .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(clip(site.description))}">`)
  .replace(/<html lang="[^"]*">/, () => `<html lang="${lang}">`);
write('index.html', index);

// The admin page builds share links too (Telegram posts), so it gets the same flags.
const adminFile = path.join(root, 'admin.html');
if (fs.existsSync(adminFile)) {
  write('admin.html', fs.readFileSync(adminFile, 'utf8').replace('<meta name="robots"', () => `${shareMeta}\n  <meta name="robots"`));
}

// App name on the phone's home screen follows the site title.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
manifest.name = site.title;
manifest.short_name = site.title.length > 14 ? site.title.slice(0, 14).trim() : site.title;
manifest.description = clip(site.description, 120) || manifest.description;
write('manifest.webmanifest', JSON.stringify(manifest, null, 2));

/* ---------- Share pages ---------- */
let pages = 0;
const sitemap = base ? [base] : [];
for (const s of series) {
  if (!safeId(s.id)) {
    console.warn(`! No share page for series "${s.id}": the ID can't be used as a folder name.`);
    continue;
  }
  const sDir = `s/${s.id}/`;
  const sUrl = base && `${base}s/${enc(s.id)}/`;
  const sDesc = clip(s.description) || L.chapters(s.chapters.length);
  write(`${sDir}index.html`, sharePage({
    title: s.title,
    description: sDesc,
    image: imageFor(s),
    url: sUrl,
    redirect: `../../#/series/${enc(s.id)}`,
  }));
  pages++;

  for (const c of s.chapters) {
    if (!safeId(c.id)) {
      console.warn(`! No share page for "${s.id}" chapter "${c.id}": the ID can't be used as a folder name.`);
      continue;
    }
    const label = chLabel(c) + (c.title ? `: ${c.title}` : '');
    const cUrl = base && `${sUrl}${enc(c.id)}/`;
    write(`${sDir}${c.id}/index.html`, sharePage({
      type: 'article',
      title: `${s.title} — ${label}`,
      description: sDesc,
      image: imageFor(s),
      url: cUrl,
      redirect: `../../../#/read/${enc(s.id)}/${enc(c.id)}`,
    }));
    pages++;
  }
}

// Old or mistyped links land on the home page instead of a bare 404.
write('404.html', sharePage({ title: site.title, description: clip(site.description), image: siteImage, redirect: base ? `${base}#/` : '/' }));

// Only the home page is a real page (everything else lives after "#"), so that's all the sitemap lists.
if (base) {
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
}
// Crawlers only read robots.txt at the root of a host, so it's only useful when the site is served
// from "/" (a custom domain). Under a GitHub Pages project path (/repo/) it would be ignored anyway.
const basePath = base ? new URL(base).pathname : '/';
if (basePath === '/') {
  write('robots.txt', `User-agent: *\nDisallow: /admin.html\n${base ? `Sitemap: ${base}sitemap.xml\n` : ''}`);
}

console.log(`Built ${path.relative(root, outDir) || '.'}: ${series.length} series, ${pages} share pages${base ? `, base ${base}` : ''}.`);
