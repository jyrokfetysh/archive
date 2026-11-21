export function telegramPostText({
  series,
  chapter,
  siteUrl,
  language = 'uk',
}) {
  const number = chapter?.number;
  let episode = chapter?.name || '';
  if (!episode) {
    const labels = language === 'uk'
      ? 'Епізод'
      : 'Episode';
    episode = `${labels}${number != null ? ` ${number}` : ''}`;
  }
  const title = chapter?.title ? `${episode} - ${chapter.title}` : episode;
  const readUrl = `${String(siteUrl).replace(/\/$/, '')}/#/read/${encodeURIComponent(series.id)}/${encodeURIComponent(chapter?.id ?? number ?? '')}`;
  const telegraphUrl = chapter?.telegraphUrl || series.telegraphUrl || '';

  const lines = [
    `📖 ${series.title} — ${title}`,
    '',
    'Читати:',
    `- [Сайт](${readUrl})`,
  ];
  if (telegraphUrl) lines.push(`- [Телеграф](${telegraphUrl})`);
  lines.push('•', '•');

  const translator = String(series.telegramTranslator || series.translator || 'nothing_just_fdrsm').trim();
  if (translator) lines.push(`Переклад та адаптація: ${translator}`);

  const original = String(series.author || '').trim();
  if (original) lines.push(`Оригінал: ${original.startsWith('#') ? original : `#${original}`}`);

  return lines.join('\n');
}
