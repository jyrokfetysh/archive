# JF Community — comic reader

A fast, phone-friendly website for reading translated comics. Pages are hosted on
[catbox.moe](https://catbox.moe); this site is the catalogue and reader around them.

- **No server code.** Plain HTML/CSS/JS that runs as-is; a small build script (`tools/build.mjs`) adds link-preview pages. Hosts for free on GitHub Pages, Netlify or Cloudflare Pages.
- **Admin page** with password login to add series and episodes, or edit `data/catalog.js` by hand.
- **Telegram-ready:** proper link previews for every series and episode, Share to Telegram, and Mini App support.
- **UI in English and Ukrainian** (readers can switch in Settings).

## Features

**Reader**
- Vertical long-strip mode (webtoons/manhwa) and paged mode, left-to-right or right-to-left (manga).
- Each series has a recommended mode, and each reader can pick their own per series.
- Tap zones (left/centre/right), swipe to turn pages, pinch-zoom friendly, plus a page slider and counter.
- Fit to screen / width / height / original size, max page width, page gaps, background colour and a brightness dimmer.
- Auto-hiding menu, full screen, an optional "keep screen on" setting, and pages preloaded ahead (including the start of the next episode).
- Remembers your page in every episode, marks episodes read at the end, and shows an end-of-episode card with a "Next episode" button.
- Pages that fail to load (catbox can be flaky) are retried automatically, with a manual **Retry** button as a fallback.
- Keyboard shortcuts on desktop (press `?`).

**Site**
- Home: Continue reading, Latest updates and all series.
- Catalogue: instant search across titles, alternative titles, authors and tags, plus tag/status/type filters, sorting, grid or list view and a "random" button. Filters stay in the URL, so the back button and shared links keep them.
- Series page: Continue/Start button, Latest episode, add to library, share, episode search, newest/oldest sorting, read checkmarks, "mark all read" and NEW badges.
- Library: favourites, with a count of new episodes, and reading history.
- Quick search from anywhere (`/` key or the 🔍 button).
- 9 themes: the site's own Peach (light) and Cocoa (dark), used by "System", plus Light, Dark, AMOLED, Sepia, Midnight and Sakura.
- **18+ only:** an age check on the first visit hides everything until it's confirmed, and pages carry adult-content ratings (`rating=adult` and the RTA label) for search engines and parental filters.
- Export/import of reading data as a JSON backup, so readers can move to another device.
- Installable on phones (PWA) and works offline for pages already visited.
- **Episode builder** (Settings → Episode builder): paste catbox links and get a ready-to-paste episode entry.

## Admin page — add series and episodes without editing files

Open **`https://<your-site>/admin.html`** (it isn't linked from the public site).

- **Series:** create and edit titles (cover, description, tags, type, status, reading mode) or delete them.
- **Episodes:** set the number, title, volume and date, then add pages:
  - drag and drop image files (they're stored in the site's repository under `pages/`), and/or
  - paste catbox links (catbox doesn't allow uploads directly from other websites, so upload there first and paste the list it gives you).

  Reorder pages by dragging or with the arrow buttons, sort them by file name, reverse them, or remove some.
  Images stored in the repository count towards GitHub Pages' **1 GB site limit** (and 10 MB per file here);
  for big series, catbox links are the better choice.
- **Publish:** first shows exactly what will change (deletions in red), then sends everything to GitHub in
  **one commit**; the site updates about a minute later. Unpublished edits survive a page reload as a draft.
- **Telegram post:** the ✈ button next to each episode gives you a ready-to-paste announcement with the episode link.
- **Telegraph:** series marked with `telegraphManaged: true` are published automatically after catalogue or page changes.
  Add the Telegraph access token as the repository Actions secret `TELEGRAPH_ACCESS_TOKEN`; set the Actions variable
  `SITE_URL` if the site uses a custom domain. One-shots are published as a single page without a contents section.
- **Site settings:** name, description, language, links, Telegram settings.
- **Admins:** add co-translators (each gets their own name and password), remove access, change your password or replace the GitHub token.

### How the password login works (and why it's safe)

The site is static, with no server, so changes are saved as commits to your GitHub repository. That
needs a GitHub access token, which you create **once** during setup:

1. On first visit, `admin.html` shows a setup form. Follow its steps to create a **fine-grained token**:
   only this repository, **Contents: Read and write**, nothing else, with an expiry date.
2. Choose your name and a **strong password**. The form refuses weak ones (under 14 characters, common
   words, your name or the site's, keyboard runs, repeats); a phrase of 4–5 random words is ideal.
3. The page encrypts the token and saves `data/admin-keys.json`.

After that you only need your name and password, on any device.

Security details:
- `data/admin-keys.json` is public (so is its history) and holds only encrypted data. The token is encrypted
  with **AES-256-GCM** under a random data key. Each admin has their own key pair, whose private half is
  encrypted with a key derived from their password (**PBKDF2-SHA256, 1,000,000 rounds**); the data key is
  encrypted to each admin's public key. A wrong password simply fails to decrypt.
- **Removing an admin needs a new GitHub token**, because they may have seen the old one. The page then makes
  a new data key for everyone who stays, so neither the removed admin nor an old copy of the file can unlock
  the new token. Afterwards **delete the old token on GitHub**: until you do, it still works for anyone who
  saw it. "Replace access token" does the same rotation without removing anyone.
- Adding an admin or changing your password asks for your current password again, so a browser left signed in
  can't be used to plant a new admin.
- The admin page keeps the decrypted token only in memory: never in storage, never in a URL. It signs you out
  after 20 minutes of inactivity, and slows down repeated wrong passwords.
- A strict Content-Security-Policy means only the site's own scripts run, and data can only be sent to
  `api.github.com`. The page refuses to load inside frames and is hidden from search engines. The public
  site has a CSP too (its own scripts plus Telegram's Mini App SDK).
- `data/catalog.js` is read as plain data, never executed (by the admin page and by the build), so a broken
  or tampered file can't run code.
- Publishing never force-pushes. If someone else published meanwhile, both versions are combined (yours wins
  where you both changed the same thing) and you're shown the result before publishing again. Every change is
  a normal commit, so the full history is on GitHub and any mistake can be reverted there.
- The main risk is a **weak password**, because the encrypted file can be attacked offline. Use a long,
  unique password, and replace the token right away if you suspect it leaked.
- Optional extra hardening: host `admin.html` on a separate (sub)domain from the public site, so nothing that
  might ever run on the public pages shares an origin (and localStorage) with the admin page.
- Forgot every password? Delete `data/admin-keys.json` in the repository on GitHub and run the setup again.

## Adding an episode by hand (no admin page)

1. Upload the pages to catbox.moe **in reading order** and copy the links it gives you.
2. Open your site → **Settings → Episode builder**.
3. Pick the series, check the episode number/date, paste the links, then press **Copy**.
4. Paste the entry into that series' `chapters: [ ... ]` list in `data/catalog.js`, then commit and push.

You can write pages as short catbox names (`"abc123.jpg"`), full catbox links, or any other image URL.
The format is documented at the top of `data/catalog.js`.

**Before going live:** check the site name, description, language and links (for example your Telegram channel).

## Telegram

- **Link previews.** Telegram builds a link preview from the page's HTML and never runs JavaScript or sees `#/…` links. So
  the build (`tools/build.mjs`) creates a small share page for every series and episode (`/s/<series>/` and
  `/s/<series>/<chapter>/`) with the right title, description and cover. Each one forwards readers straight to the reader.
  The site's **Share** buttons and the Telegram post text use these links automatically.
  Telegram caches previews; to refresh one, send the link to [@WebpageBot](https://t.me/WebpageBot).
- **Share to Telegram** is in every share menu (series page, reader → episode list, end-of-episode card).
- **Telegram in-app browser:** links open normally. Reading progress there is stored separately from the phone's main
  browser; readers can move it with Settings → Export / Import.
- **Mini App (optional).** Create a bot with [@BotFather](https://t.me/BotFather), then `/newapp` with the site URL.
  Inside Telegram the site follows Telegram's light/dark theme, uses Telegram's back button and full screen, and
  "swipe down to close" no longer interrupts scrolling. Put the app link (e.g. `https://t.me/your_bot/read`) into
  Admin → Site → *Telegram Mini App link*, and posts then also include a link that opens the episode inside Telegram
  (`?startapp=<series>__<chapter>`).

## Run it locally

Any static file server works (ES modules don't load from `file://`):

```bash
python -m http.server 8765
```

Then open http://localhost:8765. To try the deployed version with share pages:

```bash
node tools/build.mjs --base http://localhost:8766/
```

```bash
python -m http.server 8766 -d _site
```

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Every push to `main`, including publishing from the admin page, runs `.github/workflows/pages.yml`. That
   builds the site with its share pages and deploys it to `https://<user>.github.io/<repo>/`. For Telegraph
   publishing, add `TELEGRAPH_ACCESS_TOKEN` under **Settings → Secrets and variables → Actions → New repository secret**.
   The workflow updates managed Telegraph pages and saves any newly created page URLs back to the catalogue.

Netlify and Cloudflare Pages work too: set the build command to `node tools/build.mjs`, set the publish directory to `_site`,
and set `site.url` (or a `SITE_URL` environment variable) to the site's address.

## Project layout

```
index.html            app shell
data/catalog.js       ← your series and episodes
css/style.css         styles and themes
js/boot.js            applies the saved theme before the first paint
js/main.js            shell, routes, quick search
js/views/*.js         pages: home, catalog, series, reader, library, settings, builder
js/store.js           reader data in localStorage (library, history, settings)
js/i18n.js            UI translations (en, uk)
js/telegram.js        Telegram Mini App support and share links
admin.html, js/admin/ admin page (login, encryption, editors, merging, publishing)
data/admin-keys.json  encrypted admin access (created by the admin setup)
pages/                images uploaded from the admin page
tools/build.mjs       builds _site/ with share pages for link previews
.github/workflows/    GitHub Pages deployment
sw.js                 offline support
```

Readers' libraries, history and settings are stored only in their own browser. Nothing is sent anywhere.
