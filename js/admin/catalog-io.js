// Reads and writes data/catalog.js without ever executing it.
// The file is parsed as a plain data literal (JSON plus comments, unquoted keys, single quotes and
// trailing commas), so a tampered or broken file can't run code inside the admin page.

class LiteralParser {
  constructor(src, i) {
    this.s = src;
    this.i = i;
  }

  err(msg) {
    const before = this.s.slice(0, this.i);
    const line = before.split('\n').length;
    const col = this.i - before.lastIndexOf('\n');
    return new SyntaxError(`${msg} (line ${line}, column ${col})`);
  }

  ws() {
    const s = this.s;
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
      if (s.startsWith('//', this.i)) {
        const end = s.indexOf('\n', this.i);
        this.i = end < 0 ? s.length : end + 1;
      } else if (s.startsWith('/*', this.i)) {
        const end = s.indexOf('*/', this.i + 2);
        if (end < 0) throw this.err('Unclosed comment');
        this.i = end + 2;
      } else return;
    }
  }

  value() {
    this.ws();
    const c = this.s[this.i];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"' || c === "'" || c === '`') return this.string();
    if (/[-+.\d]/.test(c)) return this.number();
    const word = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i, this.i + 40))?.[0];
    const words = { true: true, false: false, null: null, undefined: null };
    if (word && word in words) {
      this.i += word.length;
      return words[word];
    }
    throw this.err(`Unexpected ${c ? `"${c}"` : 'end of file'} — catalog.js may only contain plain data`);
  }

  object() {
    const out = {};
    this.i++;
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') { this.i++; return out; }
      let key;
      const c = this.s[this.i];
      if (c === '"' || c === "'") key = this.string();
      else {
        key = /^[\p{L}_$][\p{L}\p{N}_$]*|^\d+/u.exec(this.s.slice(this.i, this.i + 200))?.[0];
        if (!key) throw this.err('Expected a property name');
        this.i += key.length;
      }
      this.ws();
      if (this.s[this.i] !== ':') throw this.err('Expected ":"');
      this.i++;
      if (key === '__proto__') throw this.err('Invalid property name');
      out[key] = this.value();
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === '}') { this.i++; return out; }
      throw this.err('Expected "," or "}"');
    }
  }

  array() {
    const out = [];
    this.i++;
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') { this.i++; return out; }
      out.push(this.value());
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === ']') { this.i++; return out; }
      throw this.err('Expected "," or "]"');
    }
  }

  string() {
    const q = this.s[this.i++];
    let out = '';
    const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
    while (this.i < this.s.length) {
      const c = this.s[this.i++];
      if (c === q) return out;
      if (q === '`' && c === '$' && this.s[this.i] === '{') throw this.err('Template expressions are not allowed');
      if (c === '\n' && q !== '`') throw this.err('Unterminated string');
      if (c !== '\\') { out += c; continue; }
      const e = this.s[this.i++];
      if (e in ESC) out += ESC[e];
      else if (e === 'x') { out += String.fromCharCode(parseInt(this.s.substr(this.i, 2), 16)); this.i += 2; }
      else if (e === 'u') {
        if (this.s[this.i] === '{') {
          const end = this.s.indexOf('}', this.i);
          out += String.fromCodePoint(parseInt(this.s.slice(this.i + 1, end), 16));
          this.i = end + 1;
        } else { out += String.fromCharCode(parseInt(this.s.substr(this.i, 4), 16)); this.i += 4; }
      } else if (e === '\r' || e === '\n') {
        if (e === '\r' && this.s[this.i] === '\n') this.i++;
      } else out += e;
    }
    throw this.err('Unterminated string');
  }

  number() {
    const m = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(this.s.slice(this.i, this.i + 40));
    if (!m) throw this.err('Invalid number');
    this.i += m[0].length;
    return Number(m[0]);
  }
}

const ASSIGN = /window\.CATALOG\s*=\s*/;

/** -> { header, catalog } where header is everything before `window.CATALOG =` (the docs comment). */
export function parseCatalogSource(src) {
  const m = ASSIGN.exec(src);
  if (!m) throw new SyntaxError('"window.CATALOG = { … }" was not found in data/catalog.js');
  const p = new LiteralParser(src, m.index + m[0].length);
  const catalog = p.value();
  p.ws();
  if (p.s[p.i] === ';') p.i++;
  p.ws();
  if (p.i < src.length) throw p.err('Unexpected content after the catalogue');
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new SyntaxError('window.CATALOG must be an object');
  catalog.site ||= {};
  catalog.series ||= [];
  return { header: src.slice(0, m.index), catalog };
}

const DEFAULT_HEADER = `/*
 * Catalogue of the site — edited from admin.html (you can also edit it by hand).
 * Field reference: see README.md.
 */
`;

/** Pretty, stable output: JSON with unquoted keys, so it's still pleasant to read and edit by hand. */
export function serializeCatalog(catalog, header = DEFAULT_HEADER) {
  const json = JSON.stringify(catalog, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, '$1$2:');
  return `${(header || DEFAULT_HEADER).trimEnd()}\nwindow.CATALOG = ${json};\n`;
}
