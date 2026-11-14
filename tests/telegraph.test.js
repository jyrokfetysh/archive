import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCatalogSource } from '../js/admin/catalog-io.js';
import { resolveImageUrl, savePage, siteBase, telegraphPlan } from '../tools/publish-telegraph.mjs';

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

test('plans every catalogue series, including one-shots, regardless of management flags', () => {
  const { catalog } = parseCatalogSource(fs.readFileSync(new URL('../data/catalog.js', import.meta.url), 'utf8'));
  const plans = telegraphPlan(catalog, 'https://reader.example/archive/');
  const expectedPlans = catalog.series.reduce((count, series) => {
    if (!series.chapters?.length) return count;
    return count + (series.type === 'oneshot' ? 1 : series.chapters.length + 1);
  }, 0);
  assert.equal(plans.length, expectedPlans);
  const oneShot = plans.find((plan) => plan.url === 'https://telegra.ph/Waifu-Quest--Vanshot-11-08');
  assert.ok(oneShot);
  assert.equal(oneShot.content.length, 19);
  assert.ok(oneShot.content.every((node) => node.tag === 'img'));
  assert.ok(plans.some((plan) => plan.title.startsWith('Клуб Набору Ваги —')));
  assert.equal(catalog.series.find((series) => series.id === 'waifu-quest').telegraphUrl, undefined);
});

test('plans episodes for series without telegraphManaged set', () => {
  const catalog = {
    series: [{
      title: 'Unmanaged series',
      type: 'manga',
      chapters: [{ number: 1, pages: ['episode-1.jpg'] }],
    }],
  };
  const plans = telegraphPlan(catalog, 'https://reader.example/');
  assert.equal(plans.length, 2);
  assert.equal(plans[0].title, 'Unmanaged series — Episode 1');
  assert.equal(plans[1].title, 'Unmanaged series — Contents');
});

test('reuses old Telegraph links as managed page URLs and removes duplicate links', () => {
  const legacyUrl = 'https://telegra.ph/series-contents';
  const catalog = {
    series: [{
      title: 'Legacy series',
      type: 'manga',
      links: [{ label: 'Telegraph', url: legacyUrl }, { label: 'Source', url: 'https://example.com' }],
      chapters: [{ number: 1, pages: ['episode-1.jpg'] }],
    }],
  };
  const plans = telegraphPlan(catalog, 'https://reader.example/');
  assert.equal(plans[1].url, legacyUrl);
  assert.deepEqual(catalog.series[0].links, [{ label: 'Source', url: 'https://example.com' }]);
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

test('waits for Telegraph FLOOD_WAIT and retries the same page request', async () => {
  const waits = [];
  const requests = [];
  const responses = [
    { ok: true, json: async () => ({ ok: false, error: 'FLOOD_WAIT_9' }) },
    { ok: true, json: async () => ({ ok: true, result: { url: 'https://telegra.ph/episode' } }) },
  ];
  const url = await savePage('token', {
    title: 'Episode 1',
    url: '',
    content: [{ tag: 'img', attrs: { src: 'https://example.com/page.png' } }],
  }, {
    fetchImpl: async (...args) => {
      requests.push(args);
      return responses.shift();
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(url, 'https://telegra.ph/episode');
  assert.deepEqual(waits, [9000]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0][0], 'https://api.telegra.ph/createPage');
  assert.equal(requests[1][0], requests[0][0]);
});

test('does not retry non-rate-limit Telegraph API errors', async () => {
  let requests = 0;
  await assert.rejects(savePage('token', {
    title: 'Episode 1',
    url: '',
    content: [],
  }, {
    fetchImpl: async () => {
      requests += 1;
      return { ok: true, json: async () => ({ ok: false, error: 'ACCESS_TOKEN_INVALID' }) };
    },
    sleep: async () => assert.fail('Unexpected retry'),
  }), /createPage failed: ACCESS_TOKEN_INVALID/);
  assert.equal(requests, 1);
});
