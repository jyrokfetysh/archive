// UI strings (English + Ukrainian) and locale-aware formatting.
// Add a language by copying the `en` block. Plural entries use Intl.PluralRules categories.
const STRINGS = {
  en: {
    'nav.home': 'Home', 'nav.catalog': 'Catalogue', 'nav.library': 'Library', 'nav.settings': 'Settings',
    close: 'Close', cancel: 'Cancel', back: 'Back', seeAll: 'See all', new: 'NEW', search: 'Search',
    'confirm.title': 'Are you sure?', 'skip': 'Skip to content',
    chapters: { one: '{n} episode', other: '{n} episodes' },
    pages: { one: '{n} page', other: '{n} pages' },
    series: { one: '{n} series', other: '{n} series' },
    unread: { one: '{n} new episode', other: '{n} new episodes' },
    noChapters: 'No episodes yet',
    'ch.short': 'Ep. {n}', 'ch.long': 'Episode {n}', 'vol.short': 'Vol. {n}',
    'status.ongoing': 'Ongoing', 'status.completed': 'Completed', 'status.hiatus': 'Hiatus', 'status.dropped': 'Dropped',
    'type.manga': 'Manga', 'type.manhwa': 'Manhwa', 'type.manhua': 'Manhua', 'type.webtoon': 'Webtoon', 'type.comic': 'Comic', 'type.oneshot': 'One-shot',
    'time.now': 'just now',
    'progress.page': 'page {p}/{n}', 'progress.next': 'up next', 'progress.done': 'caught up',

    'home.continue': 'Continue reading', 'home.latest': 'Latest updates', 'home.all': 'All series',
    'home.browse': 'Browse catalogue', 'home.random': 'Random', 'home.andMore': '+{n} more',
    'home.emptyTitle': 'Nothing here yet', 'home.emptyText': 'Add your first series to data/catalog.js.',

    'cat.title': 'Catalogue', 'cat.search': 'Search titles, authors, tags…', 'cat.status': 'Status', 'cat.type': 'Type',
    'cat.any': 'Any', 'cat.sort': 'Sort', 'cat.tags': 'Tags', 'cat.reset': 'Reset filters', 'cat.moreTags': 'More tags', 'cat.lessTags': 'Fewer tags',
    'sort.updated': 'Recently updated', 'sort.title': 'Title A–Z', 'sort.added': 'Newest', 'sort.chapters': 'Most episodes',
    'view.grid': 'Grid view', 'view.list': 'List view',
    'cat.noneTitle': 'No series found', 'cat.noneText': 'Try a different search or remove some filters.',

    'series.notFound': 'Series not found', 'series.notFoundText': 'It may have been renamed or removed.',
    'series.start': 'Start reading', 'series.resume': 'Continue', 'series.next': 'Read', 'series.reread': 'Read again',
    'series.latest': 'Latest', 'series.author': 'Author', 'series.artist': 'Artist', 'series.year': 'Year',
    'series.more': 'Show more', 'series.less': 'Show less', 'series.links': 'Links', 'series.telegraph': 'Read on Telegraph',
    'series.chapters': 'Episodes', 'series.findCh': 'Find episode…', 'series.sortAsc': 'Oldest first', 'series.sortDesc': 'Newest first',
    'series.markAll': 'Mark all as read', 'series.unmarkAll': 'Mark all as unread', 'series.markPrev': 'Mark all before last read as read',
    'series.options': 'Episode options', 'series.noMatch': 'No episodes match.',
    'series.toggleRead': 'Toggle read', 'series.inProgress': 'p. {p}/{n}',
    'fav.add': 'Add to library', 'fav.in': 'In library', 'fav.added': 'Added to your library', 'fav.removed': 'Removed from your library',
    share: 'Share', 'share.copied': 'Link copied', 'share.link': 'Link', 'share.telegram': 'Share to Telegram',
    'share.copy': 'Copy link', 'share.more': 'More…', 'share.chapter': 'Share episode',

    'lib.title': 'Library', 'lib.favorites': 'Favourites', 'lib.history': 'History',
    'lib.favEmpty': 'Your library is empty', 'lib.favEmptyText': 'Tap the heart on a series to keep it here and see new episodes at a glance.',
    'lib.histEmpty': 'No reading history', 'lib.histEmptyText': 'Episodes you open will show up here.',
    'lib.clearHistory': 'Clear history', 'lib.clearConfirm': 'Remove all reading history and page positions? Read marks are kept.',
    'lib.remove': 'Remove from history', 'lib.removed': 'Removed from history',

    'set.title': 'Settings', 'set.appearance': 'Appearance', 'set.theme': 'Theme', 'set.language': 'Language',
    'set.reader': 'Reader defaults', 'set.data': 'Your data', 'set.about': 'About',
    'set.dataText': 'Library, history and settings are stored only in this browser. Export them to move to another device.',
    'set.export': 'Export', 'set.import': 'Import', 'set.imported': 'Data imported', 'set.importFail': 'This file is not a valid backup',
    'set.clearRead': 'Clear read marks', 'set.clearReadConfirm': 'Mark every episode as unread?',
    'set.reset': 'Reset everything', 'set.resetConfirm': 'Delete your library, history, read marks and settings in this browser?',
    'set.done': 'Done', 'set.shortcuts': 'Keyboard shortcuts', 'set.builder': 'Episode builder (for translators)',
    'set.install': 'Install app', 'set.installText': 'Add the site to your home screen for full-screen reading.',
    'set.auto': 'Auto',

    'theme.system': 'System', 'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.amoled': 'AMOLED',
    'theme.sepia': 'Sepia', 'theme.midnight': 'Midnight', 'theme.sakura': 'Sakura',

    'mode.title': 'Reading mode', 'mode.vertical': 'Vertical', 'mode.ltr': 'Left → right', 'mode.rtl': 'Right ← left',
    'mode.default': 'Default mode', 'mode.defaultHint': '"Auto" uses each series’ recommended mode. You can still change it per series in the reader.',
    'fit.title': 'Page fit', 'fit.contain': 'Screen', 'fit.width': 'Width', 'fit.height': 'Height', 'fit.original': 'Original',
    'r.width': 'Max page width', 'r.gap': 'Gap between pages', 'r.bg': 'Background',
    'bg.auto': 'Theme', 'bg.black': 'Black', 'bg.gray': 'Gray', 'bg.white': 'White',
    'r.brightness': 'Brightness', 'r.tapZones': 'Tap zones', 'r.tapZonesHint': 'Tap left/right edges to turn pages (paged modes)',
    'r.tapScroll': 'Tap to scroll', 'r.tapScrollHint': 'Tap the top/bottom of the screen to scroll (vertical mode)',
    'r.pageNum': 'Page number', 'r.pageNumHint': 'Small counter while the menu is hidden',
    'r.wakeLock': 'Keep screen on', 'r.wakeLockHint': 'While the reader is open',
    'r.preload': 'Preload pages ahead',
    'r.settings': 'Reader settings', 'r.chapters': 'Episodes', 'r.fullscreen': 'Full screen', 'r.exitFullscreen': 'Exit full screen',
    'r.prevCh': 'Previous episode', 'r.nextCh': 'Next episode', 'r.page': 'Page', 'r.firstPage': 'This is the first page',
    'r.end': 'End of {ch}', 'r.nextUp': 'Next: {ch}', 'r.caughtUp': 'You’re all caught up!', 'r.caughtUpText': 'Add this series to your library to spot new episodes quickly.',
    'r.toSeries': 'Back to series', 'r.loadFail': 'Couldn’t load page {n}', 'r.retry': 'Retry', 'r.noPages': 'This episode has no pages yet.',
    'r.chNotFound': 'Episode not found', 'r.hintPrev': 'Previous', 'r.hintNext': 'Next', 'r.hintMenu': 'Menu',
    'r.lastChapter': 'This is the latest episode', 'r.firstChapter': 'This is the first episode',

    'keys.title': 'Keyboard shortcuts', 'keys.search': 'Search', 'keys.turn': 'Previous / next page', 'keys.space': 'Next page (Shift = previous)',
    'keys.chapter': 'Previous / next episode', 'keys.firstLast': 'First / last page', 'keys.chapters': 'Episode list',
    'keys.settings': 'Reader settings', 'keys.menu': 'Show / hide menu', 'keys.fullscreen': 'Full screen', 'keys.esc': 'Close panel / leave reader',
    'keys.help': 'This help',

    'qs.placeholder': 'Search series…', 'qs.all': 'Show all results for “{q}”', 'qs.none': 'Nothing found',

    'nf.title': 'Page not found', 'nf.text': 'The link may be broken or outdated.', 'nf.home': 'Go home',
    'err.noCatalog': 'Catalogue could not be loaded', 'err.noCatalogText': 'Check that data/catalog.js exists and has no syntax errors (open the browser console for details).',
    'footer.made': 'Translated with love',
    'age.badge': '18+', 'age.title': 'Adults only', 'age.yes': 'I’m 18 or older — enter', 'age.no': 'Leave',
    'age.text': 'This site has translations of feederism comics (weight gain, stuffing, big bodies) for an adult audience. All characters in these comics are adults (18+). By entering you confirm you are at least 18 years old.',
    'about.fan': 'Free fan translations, made out of love for the originals. Please support the original authors and buy the official release where it’s available.',
    'theme.peach': 'Peach', 'theme.cocoa': 'Cocoa',

    'b.title': 'Episode builder', 'b.intro': 'Upload pages to catbox.moe, paste the links here and copy the ready entry into data/catalog.js.',
    'b.series': 'Series', 'b.newSeries': '— New series —', 'b.number': 'Episode number', 'b.chTitle': 'Episode title (optional)',
    'b.date': 'Release date', 'b.links': 'Page links (in reading order)', 'b.linksHint': 'One per line, or any text that contains catbox links. Short names like abc123.jpg work too.',
    'b.found': { one: '{n} page found', other: '{n} pages found' }, 'b.reverse': 'Reverse order', 'b.sortName': 'Sort by name', 'b.clear': 'Clear',
    'b.output': 'Paste this into the chapters list', 'b.copy': 'Copy', 'b.copied': 'Copied to clipboard', 'b.preview': 'Preview',
    'tg.read': 'Read', 'tg.readApp': 'Read in Telegram',
    'b.tgTitle': 'Telegram post', 'b.tgHint': 'Paste into your channel. The link shows the series cover and title as a preview once the site is deployed.',
    'b.seriesTpl': 'New series template', 'b.seriesTplHint': 'Fill this in and add it to the series list.', 'b.remove': 'Remove page',
  },

  uk: {
    'nav.home': 'Головна', 'nav.catalog': 'Каталог', 'nav.library': 'Бібліотека', 'nav.settings': 'Налаштування',
    close: 'Закрити', cancel: 'Скасувати', back: 'Назад', seeAll: 'Усі', new: 'НОВЕ', search: 'Пошук',
    'confirm.title': 'Ви впевнені?', 'skip': 'Перейти до вмісту',
    chapters: { one: '{n} епізод', few: '{n} епізоди', many: '{n} епізодів', other: '{n} епізоду' },
    pages: { one: '{n} сторінка', few: '{n} сторінки', many: '{n} сторінок', other: '{n} сторінки' },
    series: { one: '{n} тайтл', few: '{n} тайтли', many: '{n} тайтлів', other: '{n} тайтлу' },
    unread: { one: '{n} новий епізод', few: '{n} нові епізоди', many: '{n} нових епізодів', other: '{n} нового епізоду' },
    noChapters: 'Епізодів ще немає',
    'ch.short': 'Еп. {n}', 'ch.long': 'Епізод {n}', 'vol.short': 'Том {n}',
    'status.ongoing': 'Виходить', 'status.completed': 'Завершено', 'status.hiatus': 'Перерва', 'status.dropped': 'Покинуто',
    'type.manga': 'Манґа', 'type.manhwa': 'Манхва', 'type.manhua': 'Маньхуа', 'type.webtoon': 'Вебтун', 'type.comic': 'Комікс', 'type.oneshot': 'Ваншот',
    'time.now': 'щойно',
    'progress.page': 'стор. {p}/{n}', 'progress.next': 'наступний', 'progress.done': 'усе прочитано',

    'home.continue': 'Продовжити читання', 'home.latest': 'Останні оновлення', 'home.all': 'Усі тайтли',
    'home.browse': 'Відкрити каталог', 'home.random': 'Випадковий', 'home.andMore': 'і ще {n}',
    'home.emptyTitle': 'Тут поки порожньо', 'home.emptyText': 'Додайте перший тайтл у data/catalog.js.',

    'cat.title': 'Каталог', 'cat.search': 'Пошук за назвою, автором, тегом…', 'cat.status': 'Статус', 'cat.type': 'Тип',
    'cat.any': 'Будь-який', 'cat.sort': 'Сортування', 'cat.tags': 'Теги', 'cat.reset': 'Скинути фільтри', 'cat.moreTags': 'Більше тегів', 'cat.lessTags': 'Менше тегів',
    'sort.updated': 'Нещодавно оновлені', 'sort.title': 'Назва А–Я', 'sort.added': 'Найновіші', 'sort.chapters': 'Найбільше епізодів',
    'view.grid': 'Сітка', 'view.list': 'Список',
    'cat.noneTitle': 'Нічого не знайдено', 'cat.noneText': 'Спробуйте інший запит або приберіть частину фільтрів.',

    'series.notFound': 'Тайтл не знайдено', 'series.notFoundText': 'Можливо, його перейменували або видалили.',
    'series.start': 'Почати читати', 'series.resume': 'Продовжити', 'series.next': 'Читати', 'series.reread': 'Читати знову',
    'series.latest': 'Останній', 'series.author': 'Автор', 'series.artist': 'Художник', 'series.year': 'Рік',
    'series.more': 'Показати більше', 'series.less': 'Згорнути', 'series.links': 'Посилання', 'series.telegraph': 'Читати в Telegraph',
    'series.chapters': 'Епізоди', 'series.findCh': 'Знайти епізод…', 'series.sortAsc': 'Спочатку старі', 'series.sortDesc': 'Спочатку нові',
    'series.markAll': 'Позначити все прочитаним', 'series.unmarkAll': 'Позначити все непрочитаним', 'series.markPrev': 'Позначити прочитаними всі до останнього прочитаного',
    'series.options': 'Дії з епізодами', 'series.noMatch': 'Немає відповідних епізодів.',
    'series.toggleRead': 'Прочитано', 'series.inProgress': 'стор. {p}/{n}',
    'fav.add': 'До бібліотеки', 'fav.in': 'У бібліотеці', 'fav.added': 'Додано до бібліотеки', 'fav.removed': 'Прибрано з бібліотеки',
    share: 'Поділитися', 'share.copied': 'Посилання скопійовано', 'share.link': 'Посилання', 'share.telegram': 'Надіслати в Telegram',
    'share.copy': 'Копіювати посилання', 'share.more': 'Інше…', 'share.chapter': 'Поділитися епізодом',

    'lib.title': 'Бібліотека', 'lib.favorites': 'Улюблене', 'lib.history': 'Історія',
    'lib.favEmpty': 'Бібліотека порожня', 'lib.favEmptyText': 'Натисніть сердечко на сторінці тайтлу, щоб зберегти його тут і бачити нові епізоди.',
    'lib.histEmpty': 'Історія порожня', 'lib.histEmptyText': 'Тут з’являться епізоди, які ви відкривали.',
    'lib.clearHistory': 'Очистити історію', 'lib.clearConfirm': 'Видалити всю історію та позиції сторінок? Позначки прочитаного залишаться.',
    'lib.remove': 'Прибрати з історії', 'lib.removed': 'Прибрано з історії',

    'set.title': 'Налаштування', 'set.appearance': 'Вигляд', 'set.theme': 'Тема', 'set.language': 'Мова',
    'set.reader': 'Читалка за замовчуванням', 'set.data': 'Ваші дані', 'set.about': 'Про сайт',
    'set.dataText': 'Бібліотека, історія та налаштування зберігаються лише в цьому браузері. Експортуйте їх, щоб перенести на інший пристрій.',
    'set.export': 'Експорт', 'set.import': 'Імпорт', 'set.imported': 'Дані імпортовано', 'set.importFail': 'Цей файл не є коректною резервною копією',
    'set.clearRead': 'Скинути позначки прочитаного', 'set.clearReadConfirm': 'Позначити всі епізоди непрочитаними?',
    'set.reset': 'Скинути все', 'set.resetConfirm': 'Видалити бібліотеку, історію, позначки та налаштування в цьому браузері?',
    'set.done': 'Готово', 'set.shortcuts': 'Гарячі клавіші', 'set.builder': 'Конструктор епізодів (для перекладачів)',
    'set.install': 'Встановити застосунок', 'set.installText': 'Додайте сайт на головний екран для читання на весь екран.',
    'set.auto': 'Авто',

    'theme.system': 'Системна', 'theme.light': 'Світла', 'theme.dark': 'Темна', 'theme.amoled': 'AMOLED',
    'theme.sepia': 'Сепія', 'theme.midnight': 'Північ', 'theme.sakura': 'Сакура',

    'mode.title': 'Режим читання', 'mode.vertical': 'Вертикально', 'mode.ltr': 'Зліва → направо', 'mode.rtl': 'Справа ← наліво',
    'mode.default': 'Режим за замовчуванням', 'mode.defaultHint': '«Авто» використовує рекомендований режим кожного тайтлу. У читалці його можна змінити для окремого тайтлу.',
    'fit.title': 'Масштаб сторінки', 'fit.contain': 'Екран', 'fit.width': 'Ширина', 'fit.height': 'Висота', 'fit.original': 'Оригінал',
    'r.width': 'Макс. ширина сторінки', 'r.gap': 'Проміжок між сторінками', 'r.bg': 'Фон',
    'bg.auto': 'Тема', 'bg.black': 'Чорний', 'bg.gray': 'Сірий', 'bg.white': 'Білий',
    'r.brightness': 'Яскравість', 'r.tapZones': 'Зони дотику', 'r.tapZonesHint': 'Торкніться лівого/правого краю, щоб гортати (посторінкові режими)',
    'r.tapScroll': 'Прокрутка дотиком', 'r.tapScrollHint': 'Торкніться верху/низу екрана, щоб прокрутити (вертикальний режим)',
    'r.pageNum': 'Номер сторінки', 'r.pageNumHint': 'Маленький лічильник, коли меню приховане',
    'r.wakeLock': 'Не вимикати екран', 'r.wakeLockHint': 'Поки відкрита читалка',
    'r.preload': 'Попереднє завантаження',
    'r.settings': 'Налаштування читалки', 'r.chapters': 'Епізоди', 'r.fullscreen': 'На весь екран', 'r.exitFullscreen': 'Вийти з повноекранного',
    'r.prevCh': 'Попередній епізод', 'r.nextCh': 'Наступний епізод', 'r.page': 'Сторінка', 'r.firstPage': 'Це перша сторінка',
    'r.end': 'Кінець: {ch}', 'r.nextUp': 'Далі: {ch}', 'r.caughtUp': 'Ви все прочитали!', 'r.caughtUpText': 'Додайте тайтл до бібліотеки, щоб швидко помічати нові епізоди.',
    'r.toSeries': 'До тайтлу', 'r.loadFail': 'Не вдалося завантажити сторінку {n}', 'r.retry': 'Повторити', 'r.noPages': 'У цьому епізоді ще немає сторінок.',
    'r.chNotFound': 'Епізод не знайдено', 'r.hintPrev': 'Назад', 'r.hintNext': 'Далі', 'r.hintMenu': 'Меню',
    'r.lastChapter': 'Це останній епізод', 'r.firstChapter': 'Це перший епізод',

    'keys.title': 'Гарячі клавіші', 'keys.search': 'Пошук', 'keys.turn': 'Попередня / наступна сторінка', 'keys.space': 'Наступна сторінка (Shift — попередня)',
    'keys.chapter': 'Попередній / наступний епізод', 'keys.firstLast': 'Перша / остання сторінка', 'keys.chapters': 'Список епізодів',
    'keys.settings': 'Налаштування читалки', 'keys.menu': 'Показати / сховати меню', 'keys.fullscreen': 'На весь екран', 'keys.esc': 'Закрити панель / вийти з читалки',
    'keys.help': 'Ця довідка',

    'qs.placeholder': 'Пошук тайтлів…', 'qs.all': 'Усі результати для «{q}»', 'qs.none': 'Нічого не знайдено',

    'nf.title': 'Сторінку не знайдено', 'nf.text': 'Посилання може бути пошкодженим або застарілим.', 'nf.home': 'На головну',
    'err.noCatalog': 'Не вдалося завантажити каталог', 'err.noCatalogText': 'Перевірте, що data/catalog.js існує і не має синтаксичних помилок (деталі в консолі браузера).',
    'footer.made': 'Перекладено з любов’ю',
    'age.badge': '18+', 'age.title': 'Лише для дорослих', 'age.yes': 'Мені є 18 — увійти', 'age.no': 'Вийти',
    'age.text': 'На сайті — переклади коміксів про фідеризм (набір ваги, переїдання, пишні тіла) для повнолітньої аудиторії. Усі персонажі коміксів — повнолітні (18+). Заходячи, ви підтверджуєте, що вам виповнилося 18 років.',
    'about.fan': 'Це безкоштовні фанатські переклади, зроблені з любові до творів. Будь ласка, підтримайте оригінальних авторів і придбайте офіційний реліз, якщо він доступний у вашому регіоні.',
    'theme.peach': 'Персик', 'theme.cocoa': 'Какао',

    'b.title': 'Конструктор епізодів', 'b.intro': 'Завантажте сторінки на catbox.moe, вставте посилання сюди та скопіюйте готовий запис у data/catalog.js.',
    'b.series': 'Тайтл', 'b.newSeries': '— Новий тайтл —', 'b.number': 'Номер епізоду', 'b.chTitle': 'Назва епізоду (необов’язково)',
    'b.date': 'Дата виходу', 'b.links': 'Посилання на сторінки (у порядку читання)', 'b.linksHint': 'По одному в рядку або будь-який текст із посиланнями catbox. Короткі назви на кшталт abc123.jpg теж підходять.',
    'b.found': { one: 'Знайдено {n} сторінку', few: 'Знайдено {n} сторінки', many: 'Знайдено {n} сторінок', other: 'Знайдено {n} сторінки' },
    'b.reverse': 'Зворотний порядок', 'b.sortName': 'Сортувати за назвою', 'b.clear': 'Очистити',
    'b.output': 'Вставте це у список chapters', 'b.copy': 'Копіювати', 'b.copied': 'Скопійовано', 'b.preview': 'Перегляд',
    'tg.read': 'Читати', 'tg.readApp': 'Читати в Telegram',
    'b.tgTitle': 'Пост для Telegram', 'b.tgHint': 'Вставте у свій канал. Після публікації сайту посилання покаже обкладинку та назву тайтлу.',
    'b.seriesTpl': 'Шаблон нового тайтлу', 'b.seriesTplHint': 'Заповніть і додайте до списку series.', 'b.remove': 'Прибрати сторінку',
  },
};

export const LANGS = Object.keys(STRINGS);

/** Merge extra strings (e.g. the admin page's) into the dictionaries: { en: {...}, uk: {...} }. */
export function addStrings(dicts) {
  for (const [l, d] of Object.entries(dicts)) Object.assign((STRINGS[l] ||= {}), d);
}
let lang = 'en';
let plural = new Intl.PluralRules('en');
let rtf = null;
let dtf = null;

export function setLang(pref, siteDefault) {
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const pick = [pref, siteDefault, nav === 'ru' ? 'uk' : nav].find((l) => l && STRINGS[l]) || 'en';
  lang = pick;
  plural = new Intl.PluralRules(lang);
  rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  dtf = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  document.documentElement.lang = lang;
}
export const getLang = () => lang;

/** t('key', { n: 3 }, 'fallback text') */
export function t(key, vars, fallback) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key];
  if (s == null) return fallback ?? key;
  if (typeof s === 'object') s = s[plural.select(vars?.n ?? 0)] ?? s.other;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}

export function chapterLabel(c, long = false) {
  if (c.name) return c.name;
  if (c.oneshot) return t('type.oneshot');
  const base = t(long ? 'ch.long' : 'ch.short', { n: c.number ?? c.index + 1 });
  return c.volume != null ? `${t('vol.short', { n: c.volume })} · ${base}` : base;
}

export function relTime(ms) {
  if (!ms) return '';
  const diff = Math.max(0, Date.now() - ms) / 1000;
  if (diff < 60) return t('time.now');
  const steps = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2629800, 'month'], [31557600, 'year']];
  let [size, unit] = steps[0];
  for (const step of steps) if (diff >= step[0]) [size, unit] = step;
  return rtf.format(-Math.floor(diff / size), unit);
}

export const fullDate = (ms) => (ms ? dtf.format(ms) : '');
