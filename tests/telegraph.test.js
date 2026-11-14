import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCatalogSource } from '../js/admin/catalog-io.js';
import { resolveImageUrl, siteBase, telegraphPlan } from '../tools/publish-telegraph.mjs';

test('resolves repository image paths and Catbox IDs to absolute URLs', () => {
  const base = 'https://reader.example/archive/';
  assert.equal(resolveImageUrl('pages/series/1/page.png', base), `${base}pages/series/1/page.png`);
  assert.equal(resolveImageUrl('abc123.jpg', base), 'https://files.catbox.moe/abc123.jpg');
  assert.equal(resolveImageUrl('https://cdn.example/page.png', base), 'https://cdn.example/page.png');
  assert.throws(() => resolveImageUrl('data:image/png;base64,abc', base), /Unsupported/);
});

test('derives the project GitHub Pages base URL', () => {
  assert.equal(siteBase({}, { GITHUB_REPOSITORY: 'owner/archive' }), 'https://owner.github.io/archive/');
  assert.equal(siteBase({}, { GITHUB_REPOSITORY: 'owner/owner.github.io' }), 'https://owner.github.io/');
  assert.equal(siteBase({ url: 'https://reader.example/' }, {}), 'https://reader.example/');
});

test('publishes a one-shot as one image-only page without a contents page', () => {
  const catalog = {
    series: [{
      title: 'One-shot',
      type: 'oneshot',
      telegraphManaged: true,
      telegraphUrl: 'https://telegra.ph/old-contents',
      chapters: [
        { telegraphUrl: 'https://telegra.ph/one-shot', pages: ['one.png'] },
        { pages: ['two.png'] },
      ],
    }],
  };
  const [plan] = telegraphPlan(catalog, 'https://reader.example/');
  assert.equal(plan.url, 'https://telegra.ph/one-shot');
  assert.deepEqual(plan.content, [
    { tag: 'img', attrs: { src: 'https://files.catbox.moe/one.png' } },
    { tag: 'img', attrs: { src: 'https://files.catbox.moe/two.png' } },
  ]);
  assert.equal(plan.title, 'One-shot');
});

test('plans the existing managed one-shot page from the repository catalogue', () => {
  const { catalog } = parseCatalogSource(fs.readFileSync(new URL('../data/catalog.js', import.meta.url), 'utf8'));
  const plans = telegraphPlan(catalog, 'https://reader.example/archive/');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].url, 'https://telegra.ph/Waifu-Quest--Vanshot-11-08');
  assert.equal(plans[0].content.length, 19);
  assert.ok(plans[0].content.every((node) => node.tag === 'img'));
});

test('creates chapter pages before a contents page and stores returned URLs', () => {
  const catalog = {
    series: [{
      title: 'Series',
      type: 'manga',
      telegraphManaged: true,
      chapters: [{ number: 1, pages: ['page.jpg'] }],
    }],
  };
  const [chapter, contents] = telegraphPlan(catalog, 'https://reader.example/');
  chapter.saveUrl('https://telegra.ph/episode');
  const nodes = contents.content();
  assert.equal(nodes[1].children[0].attrs.href, 'https://telegra.ph/episode');
  contents.saveUrl('https://telegra.ph/contents');
  assert.equal(catalog.series[0].telegraphUrl, 'https://telegra.ph/contents');
  assert.equal(catalog.series[0].chapters[0].telegraphUrl, 'https://telegra.ph/episode');
});
