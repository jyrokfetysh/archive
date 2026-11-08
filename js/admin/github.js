// Minimal GitHub REST client for the admin page. All writes are normal commits: nothing is ever
// force-pushed, and every change can be reviewed or reverted in the repository history.
import { toB64, fromB64 } from './crypto.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const te = new TextEncoder();
const td = new TextDecoder();
export const textToB64 = (s) => toB64(te.encode(s));
export const b64ToText = (s) => td.decode(fromB64(s.replace(/\s/g, '')));

export function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export const validRepo = (s) => /^[\w.-]+\/[\w.-]+$/.test(s || '');

export class GitHub {
  constructor(token, repo, branch = 'main') {
    if (!validRepo(repo)) throw new Error('Repository must look like owner/name');
    this.token = token;
    this.repo = repo;
    this.branch = branch;
  }

  async req(method, path, body, attempt = 0) {
    const res = await fetch(`${API}/repos/${this.repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    // Secondary rate limit (many uploads in a row): wait as GitHub asks, then try again.
    const limited = res.status === 429 || (res.status === 403 && /rate limit/i.test(data?.message || ''));
    if (limited && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) || 2 ** attempt * 15;
      this.onWait?.(wait);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return this.req(method, path, body, attempt + 1);
    }
    if (!res.ok) throw new GitHubError(limited ? 429 : res.status, data?.message || res.statusText);
    return data;
  }

  /** Checks the token can see the repo and the user may push to it. */
  async verify() {
    const info = await this.req('GET', '');
    if (!info.permissions?.push) throw new GitHubError(403, 'This token cannot write to the repository');
    await this.req('GET', `/branches/${encodeURIComponent(this.branch)}`);
    return info;
  }

  /** { sha, text } or null when the file doesn't exist. Works for files above the 1 MB contents limit. */
  async getFile(path) {
    try {
      const meta = await this.req('GET', `/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
      return { sha: meta.sha, text: meta.content ? b64ToText(meta.content) : await this.blobText(meta.sha) };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  /** Text of any version of a file that was ever committed, by its blob sha. */
  async blobText(sha) {
    if (!/^[0-9a-f]{40,64}$/.test(sha || '')) throw new Error('Bad blob sha');
    return b64ToText((await this.req('GET', `/git/blobs/${sha}`)).content);
  }

  /** Create/update one text file. `sha` must be the version you read (null for a new file). */
  putFile(path, text, message, sha) {
    return this.req('PUT', `/contents/${path}`, { message, content: textToB64(text), branch: this.branch, ...(sha ? { sha } : {}) });
  }

  async head() {
    const ref = await this.req('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`);
    const commit = await this.req('GET', `/git/commits/${ref.object.sha}`);
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }

  async blobShaAt(treeSha, path) {
    const parts = path.split('/');
    let tree = treeSha;
    for (let i = 0; i < parts.length; i++) {
      const t = await this.req('GET', `/git/trees/${tree}`);
      const entry = t.tree.find((e) => e.path === parts[i]);
      if (!entry) return null;
      if (i === parts.length - 1) return entry.sha;
      tree = entry.sha;
    }
    return null;
  }

  /**
   * One commit with several files. files: [{ path, text } | { path, file }] — image files are read
   * one at a time, right before upload, so big chapters don't fill the phone's memory.
   * guard: { path, sha } — abort with 409 if that file changed on the branch since it was loaded.
   * onProgress(done, total) reports uploaded blobs. Returns { commit, shas: { path: blobSha } }.
   */
  async commit({ files, message, guard, onProgress }) {
    const uploaded = new Map(); // path -> blob sha, reused if the final step has to be retried
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await this.head();
      if (guard) {
        const current = await this.blobShaAt(head.tree, guard.path);
        if (current !== guard.sha) throw new GitHubError(409, 'conflict');
      }
      const queue = files.filter((f) => !uploaded.has(f.path));
      const worker = async () => {
        while (queue.length) {
          const f = queue.shift();
          const body = f.file
            ? { content: await fileToB64(f.file), encoding: 'base64' }
            : { content: f.text, encoding: 'utf-8' };
          uploaded.set(f.path, (await this.req('POST', '/git/blobs', body)).sha);
          onProgress?.(uploaded.size, files.length);
        }
      };
      // Two at a time keeps well below GitHub's limits on content-creating requests.
      await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
      const entries = files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: uploaded.get(f.path) }));
      const tree = await this.req('POST', '/git/trees', { base_tree: head.tree, tree: entries });
      const commit = await this.req('POST', '/git/commits', { message, tree: tree.sha, parents: [head.commit] });
      try {
        // force: false — fails instead of overwriting if someone pushed in the meantime; then retry.
        await this.req('PATCH', `/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: commit.sha, force: false });
        return { commit: commit.sha, shas: Object.fromEntries(uploaded) };
      } catch (e) {
        if (e.status !== 422 || attempt === 2) throw e;
      }
    }
    throw new GitHubError(409, 'conflict');
  }
}
