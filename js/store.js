// Reader data kept in localStorage: settings, favourites, history, read marks and page progress.
const KEY = 'jfc:v1';

export const DEFAULTS = {
  settings: {
    theme: 'system',
    lang: '',
    catalogView: 'grid',
    chapterSort: 'desc',
    reader: {
      defaultMode: 'auto', // auto = whatever the series recommends
      fit: 'contain',
      width: 900,
      gap: false,
      bg: 'auto',
      brightness: 100,
      tapZones: true,
      tapScroll: false,
      pageNum: true,
      wakeLock: false,
      preload: 3,
    },
  },
  favorites: {}, // sid -> addedAt
  history: {}, // sid -> { cid, page, total, t }
  read: {}, // sid -> { cid: readAt }
  progress: {}, // sid -> { cid: { page, total } } (only unfinished chapters)
  modes: {}, // sid -> 'vertical' | 'ltr' | 'rtl'
  hints: {},
};

const MAPS = ['favorites', 'history', 'read', 'progress', 'modes', 'hints'];
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const clone = (o) => JSON.parse(JSON.stringify(o));

export function normalize(data) {
  const s = clone(DEFAULTS);
  if (!isObj(data)) return s;
  if (isObj(data.settings)) {
    const { reader, ...rest } = data.settings;
    Object.assign(s.settings, rest);
    if (isObj(reader)) Object.assign(s.settings.reader, reader);
  }
  for (const k of MAPS) if (isObj(data[k])) s[k] = data[k];
  return s;
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return normalize(null);
  }
}

let state = load();
const listeners = new Set();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save reader data', e);
  }
}

function changed(type) {
  if (!saveTimer) saveTimer = setTimeout(persist, 200);
  listeners.forEach((fn) => fn(type));
}

addEventListener('pagehide', () => saveTimer && persist());
// Phones often freeze or kill a backgrounded tab without a pagehide, so save right away.
addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer && persist());
addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  state = load();
  listeners.forEach((fn) => fn('sync'));
});

export const store = {
  get state() { return state; },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setSetting(path, value) {
    const parts = path.split('.');
    let o = state.settings;
    for (const p of parts.slice(0, -1)) o = o[p];
    if (o[parts.at(-1)] === value) return;
    o[parts.at(-1)] = value;
    changed(`settings.${path}`);
  },

  isFav: (sid) => !!state.favorites[sid],
  toggleFav(sid) {
    if (state.favorites[sid]) delete state.favorites[sid];
    else state.favorites[sid] = Date.now();
    changed('favorites');
    return !!state.favorites[sid];
  },

  isRead: (sid, cid) => !!state.read[sid]?.[cid],
  setRead(sid, cid, on) {
    store.setReadMany(sid, [cid], on);
  },
  setReadMany(sid, cids, on) {
    const m = (state.read[sid] ||= {});
    const now = Date.now();
    for (const cid of cids) {
      if (on) {
        m[cid] ||= now;
        if (state.progress[sid]) delete state.progress[sid][cid];
      } else delete m[cid];
    }
    if (!Object.keys(m).length) delete state.read[sid];
    changed('read');
  },

  getProgress: (sid, cid) => state.progress[sid]?.[cid] || null,
  setProgress(sid, cid, page, total) {
    (state.progress[sid] ||= {})[cid] = { page, total };
    state.history[sid] = { cid, page, total, t: Date.now() };
    changed('progress');
  },

  getHistory: (sid) => state.history[sid] || null,
  removeHistory(sid) {
    delete state.history[sid];
    delete state.progress[sid];
    changed('history');
  },
  clearHistory() {
    state.history = {};
    state.progress = {};
    changed('history');
  },
  clearRead() {
    state.read = {};
    state.progress = {};
    changed('read');
  },

  getMode: (sid) => state.modes[sid] || null,
  setMode(sid, mode) {
    state.modes[sid] = mode;
    changed('modes');
  },

  hint: (name) => !!state.hints[name],
  setHint(name) {
    state.hints[name] = 1;
    changed('hints');
  },

  exportData: () => ({ app: 'jf-community', version: 1, exported: new Date().toISOString(), ...clone(state) }),
  importData(data, merge = true) {
    const incoming = normalize(data);
    if (merge) {
      state.settings = incoming.settings;
      for (const k of MAPS) {
        if (k === 'read') {
          for (const [sid, m] of Object.entries(incoming.read)) state.read[sid] = { ...state.read[sid], ...m };
        } else if (k === 'history') {
          for (const [sid, h] of Object.entries(incoming.history)) {
            if (!state.history[sid] || (h.t || 0) > (state.history[sid].t || 0)) state.history[sid] = h;
          }
        } else state[k] = { ...state[k], ...incoming[k] };
      }
    } else {
      state = incoming;
    }
    persist();
    listeners.forEach((fn) => fn('import'));
  },
  resetAll() {
    state = normalize(null);
    persist();
    listeners.forEach((fn) => fn('import'));
  },
};
