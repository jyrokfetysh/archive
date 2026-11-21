import test from 'node:test';
import assert from 'node:assert/strict';

test('hides scheduled series and chapters until their release time', async () => {
  globalThis.window = {
    CATALOG: {
      series: [{
        id: 'future-series',
        title: 'Future series',
        releaseAt: '2099-01-01T00:00:00Z',
        chapters: [{ number: 1, pages: ['future.png'] }],
      }, {
        id: 'mixed-series',
        title: 'Mixed series',
        chapters: [
          { number: 1, pages: ['live.png'] },
          { number: 2, releaseAt: '2099-01-01T00:00:00Z', pages: ['future.png'] },
        ],
      }],
    },
  };
  const { byId } = await import(`../js/data.js?schedule=${Date.now()}`);
  assert.equal(byId.has('future-series'), false);
  assert.equal(byId.has('mixed-series'), true);
  assert.equal(byId.get('mixed-series').chapters.length, 1);
  assert.equal(byId.get('mixed-series').chapters[0].number, 1);
});
