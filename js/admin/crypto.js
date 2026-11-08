// Password-based protection for the GitHub access token (Web Crypto only, no libraries).
//
// data/admin-keys.json is public (and so is its git history), so it only ever holds encrypted data:
//   token        = AES-256-GCM(dataKey, githubToken)
//   users[i].pub = the admin's ECDH P-256 public key
//   users[i].priv= AES-256-GCM(PBKDF2-SHA256(password_i, salt_i), admin's private key)
//   users[i].dk  = dataKey encrypted to users[i].pub (ephemeral ECDH + HKDF-SHA256 + AES-256-GCM)
//
// Signing in = password -> private key -> data key -> token. A wrong password fails GCM authentication.
// Because every admin has a public key, any signed-in admin can rotate the data key for everyone
// (on "replace token" / "remove admin") without knowing their passwords. After a rotation with a new,
// revoked-old GitHub token, nothing in the file's history unlocks the current token.

export const KDF_ITERATIONS = 1_000_000;
const MIN_ITERATIONS = 600_000; // never accept less, whatever the file says
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const te = new TextEncoder();
const td = new TextDecoder();

export const toB64 = (bytes) => {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const norm = (name) => name.trim().toLowerCase();
export const kdfIterations = (keys) => Math.max(MIN_ITERATIONS, Number(keys?.kdf?.iterations) || KDF_ITERATIONS);

// Associated data binds every box to its purpose, repository, key version and owner,
// so boxes can't be swapped between users, repositories or key generations.
const privAad = (repo, name) => te.encode(`jfc-priv:${repo}:${norm(name)}`);
const dkAad = (repo, version, name) => te.encode(`jfc-dk:${repo}:${version}:${norm(name)}`);
const tokenAad = (repo, version) => te.encode(`jfc-token:${repo}:${version}`);

async function passwordKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Math.max(MIN_ITERATIONS, iterations) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, bytes, aad) {
  const iv = random(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, bytes);
  return { iv: toB64(iv), data: toB64(data) };
}
async function open(key, box, aad) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: aad }, key, fromB64(box.data)));
}

async function hkdfKey(shared, salt, info) {
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** New random data key (raw bytes). */
export const newDataKey = () => random(32);

export async function encryptToken(keys, dataKey, token) {
  return seal(await aesKey(dataKey), te.encode(token), tokenAad(keys.repo, keys.keyVersion));
}
export async function decryptToken(keys, dataKey) {
  return td.decode(await open(await aesKey(dataKey), keys.token, tokenAad(keys.repo, keys.keyVersion)));
}

/** New admin entry (key pair protected by the password). Call wrapDataKey() afterwards. */
export async function createUser(keys, name, password) {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const salt = random(16);
  const kek = await passwordKey(password, salt, kdfIterations(keys));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    name: name.trim(),
    salt: toB64(salt),
    pub: toB64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    priv: await seal(kek, pkcs8, privAad(keys.repo, name)),
    added: new Date().toISOString().slice(0, 10),
  };
}

/** Encrypts the data key to a user's public key (sets user.dk). */
export async function wrapDataKey(keys, user, dataKey) {
  const aad = dkAad(keys.repo, keys.keyVersion, user.name);
  const pub = await crypto.subtle.importKey('spki', fromB64(user.pub), ECDH, false, []);
  const eph = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
  const salt = random(16);
  const key = await hkdfKey(shared, salt, aad);
  user.dk = { epk: toB64(await crypto.subtle.exportKey('spki', eph.publicKey)), salt: toB64(salt), ...(await seal(key, dataKey, aad)) };
  return user;
}

/** Returns the data key, or null when the password is wrong. */
export async function unlockUser(keys, user, password) {
  try {
    const kek = await passwordKey(password, fromB64(user.salt), kdfIterations(keys));
    const pkcs8 = await open(kek, user.priv, privAad(keys.repo, user.name));
    const priv = await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);
    const epk = await crypto.subtle.importKey('spki', fromB64(user.dk.epk), ECDH, false, []);
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: epk }, priv, 256);
    const aad = dkAad(keys.repo, keys.keyVersion, user.name);
    return await open(await hkdfKey(shared, fromB64(user.dk.salt), aad), user.dk, aad);
  } catch {
    return null;
  }
}

/** New data key + new token for the given users (everyone else, and all history, is locked out). */
export async function rotate(keys, users, token) {
  const dataKey = newDataKey();
  keys.keyVersion = (Number(keys.keyVersion) || 0) + 1;
  keys.users = users;
  for (const u of users) await wrapDataKey(keys, u, dataKey);
  keys.token = await encryptToken(keys, dataKey, token);
  return dataKey;
}

/* ---------- Password policy ---------- */
// The encrypted file can be attacked offline, so weak passwords must be refused, not just discouraged.
const COMMON = ('password passw0rd qwerty qwertz azerty letmein welcome iloveyou admin administrator dragon monkey '
  + 'football baseball sunshine princess master shadow superman batman naruto pokemon anime manga comics comic manhwa '
  + 'webtoon sakura kitty hello freedom whatever trustno secret login starwars computer internet summer winter spring '
  + 'autumn flower purple orange banana cookie chocolate soccer hockey ninja killer pepper ginger charlie michael '
  + 'jennifer jordan hunter ranger buster thomas robert daniel andrew joshua matthew ashley jessica translator '
  + 'translate community github telegram catbox password1 abc123 iloveu loveme lovely angel '
  + 'пароль привіт привет кохання любовь україна украина йцукен кошеня котик сонечко').split(/\s+/);
const LEET = { '@': 'a', 4: 'a', 8: 'b', 3: 'e', 6: 'g', 1: 'i', '!': 'i', '|': 'i', 0: 'o', $: 's', 5: 's', 7: 't', 2: 'z' };

export const MIN_PASSWORD_LENGTH = 14;
export const MIN_PASSWORD_BITS = 70;

/** Rough strength estimate in bits; extra = words that shouldn't appear (user name, site name…). */
export function passwordStrength(pw, extra = []) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[\p{P}\p{S}]/u.test(pw)) pool += 32;
  if (/\s/.test(pw)) pool += 1;
  if (/[^\x00-\x7f]/.test(pw)) pool += 33; // Cyrillic etc.

  // Count only the "surprising" part: drop years, digit/symbol tails and repeated runs.
  const lower = pw.toLowerCase();
  const core = lower.replace(/(19|20)\d\d/g, '').replace(/[\p{N}\p{P}\p{S}\s]+$/u, '').replace(/(.)\1+/gu, '$1');
  const len = Math.max(core.length, Math.min(pw.length, 4));
  let bits = Math.log2(Math.max(pool, 2)) * len;

  // Dictionary words (also in leetspeak) only count a little.
  const deleet = lower.replace(/[@483610!|$572]/g, (c) => LEET[c]);
  const words = [...COMMON, ...extra.map((w) => String(w || '').toLowerCase()).filter((w) => w.length >= 3)];
  for (const w of words) {
    for (const s of [lower, deleet]) {
      if (s.includes(w)) {
        bits -= Math.log2(Math.max(pool, 2)) * Math.max(0, w.length - 2);
        break;
      }
    }
  }
  // A short unit repeated (Aa1!Aa1!Aa1!) is only as strong as the unit.
  const rep = /^(.{1,7}?)\1+(.{0,7})$/.exec(pw);
  if (rep && rep[1].length * 2 <= pw.length) bits = Math.min(bits, Math.log2(Math.max(pool, 2)) * (rep[1].length + rep[2].length) + 4);
  if (/(0123|1234|2345|3456|4567|5678|6789|7890|abcd|bcde|qwer|wert|asdf|zxcv|йцук)/i.test(pw)) bits -= 15;
  return Math.max(0, Math.round(bits));
}

export const passwordOk = (pw, extra) => pw.length >= MIN_PASSWORD_LENGTH && passwordStrength(pw, extra) >= MIN_PASSWORD_BITS;
