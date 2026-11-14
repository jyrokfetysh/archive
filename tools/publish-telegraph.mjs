#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCatalogSource, serializeCatalog } from '../js/admin/catalog-io.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'data/catalog.js');
const telegraPhApi = 'https://api.telegra.ph';

const labelOf = (chapter, index, language) => {
  const episode = chapter.name
    || `${language === 'uk' ? 'Епізод' : 'Episode'} ${chapter.number ?? index + 1}`;
  return chapter.title ? `${episode} - ${chapter.title}` : episode;
};

export function siteBase(site, env = process.env) {
  const configured = env.SITE_URL || site?.url;
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;

  const [owner, repo] = String(env.GITHUB_REPOSITORY || '').split('/');
  if (!owner || !repo) throw new Error('Set SITE_URL or GITHUB_REPOSITORY so local page images can be resolved.');
  const rootRepo = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  return `https://${owner}.github.io/${rootRepo ? '' : `${repo}/`}`;
}

export function resolveImageUrl(value, base) {
  const image = String(value || '').trim();
  if (!image) throw new Error('A Telegraph episode contains an empty page URL.');
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith('//')) return `https:${image}`;
  if (/^(files\.)?catbox\.moe\//i.test(image)) return `https://${image}`;
  if (/^[\w-]+\.[a-z0-9]+$/i.test(image)) return `https://files.catbox.moe/${image}`;
  if (/^(data|blob|javascript):/i.test(image)) throw new Error(`Unsupported Telegraph image URL: ${image.slice(0, 40)}`);
  return new URL(image, base).href;
}

function imageNodes(chapters, base) {
  return chapters.flatMap((chapter) => {
    const pages = Array.isArray(chapter.pages) ? chapter.pages : [];
    if (!pages.length) throw new Error('A Telegraph episode has no pages.');
    return pages.map((page) => ({ tag: 'img', attrs: { src: resolveImageUrl(page, base) } }));
  });
}

function legacyTelegraphUrl(series) {
  return (Array.isArray(series.links) ? series.links : [])
    .find((link) => /^https:\/\/telegra\.ph\//i.test(link?.url || '') && /telegraph/i.test(link.label || ''))?.url || '';
}

function removeLegacyTelegraphLinks(series) {
  if (!Array.isArray(series.links)) return;
  series.links = series.links.filter((link) => !(/^https:\/\/telegra\.ph\//i.test(link?.url || '') && /telegraph/i.test(link.label || '')));
  if (!series.links.length) delete series.links;
}

function pagePath(url) {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid Telegraph URL: ${url}`); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'telegra.ph' || !parsed.pathname.slice(1)) {
    throw new Error(`Expected a https://telegra.ph page URL, got: ${url}`);
  }
  return parsed.pathname.slice(1);
}

export function telegraphPlan(catalog, base) {
  const plans = [];
  for (const series of catalog.series || []) {
    const chapters = Array.isArray(series.chapters) ? series.chapters : [];
    const language = catalog.site?.language;
    if (!chapters.length) continue;

    if (series.type === 'oneshot') {
      const chapterWithUrl = chapters.find((chapter) => chapter.telegraphUrl);
      const target = chapterWithUrl || chapters[0];
      const url = target.telegraphUrl || series.telegraphUrl || legacyTelegraphUrl(series);
      delete series.telegraphUrl;
      removeLegacyTelegraphLinks(series);
      plans.push({
        title: series.title,
        url,
        content: imageNodes(chapters, base),
        saveUrl: (url) => { target.telegraphUrl = url; },
      });
      continue;
    }

    series.telegraphUrl ||= legacyTelegraphUrl(series);
    removeLegacyTelegraphLinks(series);
    const chapterUrls = [];
    chapters.forEach((chapter, index) => {
      const label = labelOf(chapter, index, language);
      plans.push({
        title: `${series.title} — ${label}`,
        url: chapter.telegraphUrl || '',
        content: imageNodes([chapter], base),
        saveUrl: (url) => { chapter.telegraphUrl = url; },
      });
      chapterUrls.push({ label, chapter });
    });

    plans.push({
      title: `${series.title} — ${language === 'uk' ? 'Зміст' : 'Contents'}`,
      url: series.telegraphUrl || '',
      content: () => [
        { tag: 'h3', children: [{ tag: 'b', children: [{ tag: 'text', children: [language === 'uk' ? 'Зміст' : 'Contents'] }] }] },
        ...chapterUrls.map(({ label, chapter }) => ({
          tag: 'p',
          children: [{
            tag: 'a',
            attrs: { href: chapter.telegraphUrl || '' },
            children: [{ tag: 'text', children: [label] }],
          }],
        })),
      ],
      saveUrl: (url) => { series.telegraphUrl = url; },
    });
  }
  return plans;
}

export async function savePage(token, plan, {
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const path = pagePath(plan.url);
  const endpoint = path
    ? `${telegraPhApi}/editPage/${encodeURIComponent(path)}`
    : `${telegraPhApi}/createPage`;
  const content = typeof plan.content === 'function' ? plan.content() : plan.content;
  const body = new URLSearchParams({
    access_token: token,
    title: plan.title.slice(0, 256),
    content: JSON.stringify(content),
    return_content: 'false',
  });
  while (true) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok && result.result?.url) return result.result.url;

    const error = result?.error || response.statusText;
    const floodWait = /^FLOOD_WAIT_(\d+)$/.exec(error);
    if (!floodWait) {
      throw new Error(`Telegraph ${path ? 'editPage' : 'createPage'} failed: ${error}`);
    }

    const waitSeconds = Number(floodWait[1]);
    console.log(`Telegraph rate limit reached; retrying "${plan.title}" in ${waitSeconds} seconds.`);
    await sleep(waitSeconds * 1000);
  }
}

async function main() {
  const source = fs.readFileSync(catalogPath, 'utf8');
  const { header, catalog } = parseCatalogSource(source);
  const originalCatalog = JSON.stringify(catalog);
  if (!(catalog.series || []).some((series) => Array.isArray(series.chapters) && series.chapters.length)) {
    console.log('No series with episodes in the catalogue.');
    return;
  }

  const token = process.env.TELEGRAPH_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error('Telegraph publishing requires the TELEGRAPH_ACCESS_TOKEN repository secret.');
  }

  const plans = telegraphPlan(catalog, siteBase(catalog.site));
  let lastSavedCatalog = originalCatalog;
  for (const plan of plans) {
    const url = await savePage(token, plan);
    plan.saveUrl(url);
    console.log(`Published "${plan.title}" to ${url}`);

    const currentCatalog = JSON.stringify(catalog);
    if (currentCatalog !== lastSavedCatalog) {
      fs.writeFileSync(catalogPath, serializeCatalog(catalog, header));
      lastSavedCatalog = currentCatalog;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
