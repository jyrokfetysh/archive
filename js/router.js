// Hash router with per-entry scroll restoration and history depth tracking.
let routes = [];
let onRoute = () => {};
let depth = -1;
let replacing = false;
let currentKey = null;
const scrollPos = new Map();

export function parseHash() {
  const h = location.hash.slice(1) || '/';
  const qi = h.indexOf('?');
  let path = (qi < 0 ? h : h.slice(0, qi)).replace(/\/+$/, '') || '/';
  // Anything that isn't a "#/route" (e.g. launch data a host app appended) means home.
  if (!path.startsWith('/')) return { path: '/', query: new URLSearchParams() };
  const query = new URLSearchParams(qi < 0 ? '' : h.slice(qi + 1));
  return { path, query };
}

export function navigate(hash, { replace = false } = {}) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (hash === location.hash) return resolve();
  if (replace) {
    replacing = true;
    location.replace(hash);
  } else {
    location.hash = hash;
  }
}

/** Go back inside the app if possible, otherwise to `fallback`. */
export function goBack(fallback = '#/') {
  if (depth > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Update the query string of the current route without re-rendering. */
export function setQuery(params) {
  const { path } = parseHash();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v);
  const qs = q.toString().replace(/%2C/g, ',');
  history.replaceState(history.state, '', `#${path}${qs ? '?' + qs : ''}`);
}

export const savedScroll = () => scrollPos.get(currentKey);
export const canGoBack = () => depth > 0;

const dec = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

function resolve() {
  if (currentKey) scrollPos.set(currentKey, scrollY);
  let st = history.state;
  if (!st || st.key == null) {
    st = { key: Math.random().toString(36).slice(2), depth: replacing ? Math.max(depth, 0) : depth + 1 };
    history.replaceState(st, '');
  }
  replacing = false;
  depth = st.depth;
  currentKey = st.key;

  const { path, query } = parseHash();
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return onRoute(r, m.slice(1).map(dec), query);
  }
  onRoute(null, [], query);
}

export function startRouter(routeList, handler) {
  routes = routeList;
  onRoute = handler;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  addEventListener('hashchange', resolve);
  resolve();
}

export const rerender = () => {
  if (currentKey) scrollPos.set(currentKey, scrollY);
  const { path, query } = parseHash();
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return onRoute(r, m.slice(1).map(dec), query, { keepScroll: true });
  }
  onRoute(null, [], query, { keepScroll: true });
};
