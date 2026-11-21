import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramPostText } from '../js/admin/telegram-post.js';

test('formats a comic episode Telegram post with site and Telegraph links', () => {
  const post = telegramPostText({
    series: {
      id: 'klub-naboru-vahy',
      title: 'Клуб Набору Ваги',
      author: 'OTOKO_NO_ROMAN',
      telegramTranslator: 'nothing_just_fdrsm',
    },
    chapter: {
      id: '46',
      number: 46,
      title: 'Вузький Одяг',
      telegraphUrl: 'https://telegra.ph/Klub-Naboru-Vagi--Ep%D1%96zod-46---Vuzkij-Odyag-11-21',
    },
    siteUrl: 'https://jyrokfetysh.github.io/archive/',
  });

  assert.equal(post, [
    '📖 Клуб Набору Ваги — Епізод 46 - Вузький Одяг',
    '',
    'Читати:',
    '- [Сайт](https://jyrokfetysh.github.io/archive/#/read/klub-naboru-vahy/46)',
    '- [Телеграф](https://telegra.ph/Klub-Naboru-Vagi--Ep%D1%96zod-46---Vuzkij-Odyag-11-21)',
    '•',
    '•',
    'Переклад та адаптація: nothing_just_fdrsm',
    'Оригінал: #OTOKO_NO_ROMAN',
  ].join('\n'));
});

test('formats a one-shot title and keeps the original author hashtag', () => {
  const post = telegramPostText({
    series: {
      id: 'one-shot',
      title: 'One-shot title',
      author: '#ORIGINAL',
    },
    chapter: { id: '1', number: 1, name: 'One-shot', telegraphUrl: 'https://telegra.ph/one-shot' },
    siteUrl: 'https://example.com/archive/',
  });

  assert.match(post, /^📖 One-shot title — One-shot$/m);
  assert.match(post, /Оригінал: #ORIGINAL$/);
  assert.match(post, /https:\/\/example\.com\/archive\/#\/read\/one-shot\/1/);
});
