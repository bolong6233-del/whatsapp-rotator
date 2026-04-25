import crypto from 'node:crypto';

const HAIWANG_TOKEN = 'gcG7LnEwlS_7xJCvniqfAw2FfcaV1R230CRK977VD40';
const HAIWANG_SALT = 'haiwang';
const HAIWANG_SEPARATOR = '&&&';
const HAIWANG_BASE_URL = 'https://admin.haiwangweb.com';

/**
 * Custom "compressed MD5" used by haiwangweb.com.
 * Each 64-byte block runs only 16 steps (not the standard 64).
 * Sparse array slots remain `undefined`; arithmetic on them yields NaN,
 * and bitwise ops then treat NaN as 0 — this is intentional.
 * Do NOT replace with a standard MD5 library.
 */
export function haiwangMd5(input: string): string {
  function utf8(n: string): string {
    n = n.replace(/\r\n/g, '\n');
    let e = '';
    for (let a = 0; a < n.length; a++) {
      const t = n.charCodeAt(a);
      if (t < 128) e += String.fromCharCode(t);
      else if (t > 127 && t < 2048) {
        e += String.fromCharCode((t >> 6) | 192);
        e += String.fromCharCode((63 & t) | 128);
      } else {
        e += String.fromCharCode((t >> 12) | 224);
        e += String.fromCharCode(((t >> 6) & 63) | 128);
        e += String.fromCharCode((63 & t) | 128);
      }
    }
    return e;
  }

  function add(n: number, e: number): number {
    const a = 1073741824 & n, t = 1073741824 & e;
    const i = 2147483648 & n, r = 2147483648 & e;
    const o = (1073741823 & n) + (1073741823 & e);
    if (a & t) return 2147483648 ^ o ^ i ^ r;
    if (a | t) return (1073741824 & o) ? (3221225472 ^ o ^ i ^ r) : (1073741824 ^ o ^ i ^ r);
    return o ^ i ^ r;
  }

  function rol(n: number, c: number): number { return (n << c) | (n >>> (32 - c)); }
  function F(x: number, y: number, z: number): number { return (x & y) | (~x & z); }
  function G(x: number, y: number, z: number): number { return (x & z) | (y & ~z); }
  function H(x: number, y: number, z: number): number { return x ^ y ^ z; }
  function I(x: number, y: number, z: number): number { return y ^ (x | ~z); }

  function hex(n: number): string {
    let e: number, a: number, t = '', i = '';
    for (a = 0; a <= 3; a++) {
      e = (n >>> (8 * a)) & 255;
      i = '0' + e.toString(16);
      t += i.substr(i.length - 2, 2);
    }
    return t;
  }

  const n = utf8(input);
  const e = n.length;
  const aL = e + 8;
  const tL = 16 * (((aL - (aL % 64)) / 64) + 1);

  // ⚠️ Sparse array: unassigned slots stay `undefined` at runtime.
  // `f[s] + constant` on a hole → NaN; bitwise ops treat NaN as 0.
  // Do NOT use .fill(0) — it breaks the algorithm.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any[] = new Array(tL - 1);

  let r = 0, o = 0;
  for (; o < e;) {
    r = (o % 4) * 8;
    f[(o - (o % 4)) / 4] = (f[(o - (o % 4)) / 4] || 0) | (n.charCodeAt(o) << r);
    o++;
  }
  r = (o % 4) * 8;
  f[(o - (o % 4)) / 4] = (f[(o - (o % 4)) / 4] || 0) | (128 << r);
  f[tL - 2] = e << 3;
  f[tL - 1] = e >>> 29;

  let s: number, u: number, c: number, p: number, m: number;
  let d = 1732584193, g = 4023233417, h = 2562383102, k = 271733878;

  for (s = 0; s < f.length; s += 16) {
    u = d; c = g; p = h; m = k;

    d = add(d, F(g, h, k) + f[s]      + 3614090360); d = rol(d, 7);  d = add(d, g);
    k = add(k, F(d, g, h) + f[s + 1]  + 3905402710); k = rol(k, 12); k = add(k, d);
    h = add(h, F(k, d, g) + f[s + 2]  + 606105819);  h = rol(h, 17); h = add(h, k);
    g = add(g, F(h, k, d) + f[s + 3]  + 3250441966); g = rol(g, 22); g = add(g, h);

    d = add(d, G(g, h, k) + f[s + 4]  + 4118548399); d = rol(d, 5);  d = add(d, g);
    k = add(k, G(d, g, h) + f[s + 5]  + 1200080426); k = rol(k, 9);  k = add(k, d);
    h = add(h, G(k, d, g) + f[s + 6]  + 2821735955); h = rol(h, 14); h = add(h, k);
    g = add(g, G(h, k, d) + f[s + 7]  + 4249261313); g = rol(g, 20); g = add(g, h);

    d = add(d, H(g, h, k) + f[s + 8]  + 1770035416); d = rol(d, 4);  d = add(d, g);
    k = add(k, H(d, g, h) + f[s + 9]  + 2336552879); k = rol(k, 11); k = add(k, d);
    h = add(h, H(k, d, g) + f[s + 10] + 4294925233); h = rol(h, 16); h = add(h, k);
    g = add(g, H(h, k, d) + f[s + 11] + 2304563134); g = rol(g, 23); g = add(g, h);

    d = add(d, I(g, h, k) + f[s + 12] + 1804603682); d = rol(d, 6);  d = add(d, g);
    k = add(k, I(d, g, h) + f[s + 13] + 4254626195); k = rol(k, 10); k = add(k, d);
    h = add(h, I(k, d, g) + f[s + 14] + 2792965006); h = rol(h, 15); h = add(h, k);
    g = add(g, I(h, k, d) + f[s + 15] + 1236535329); g = rol(g, 21); g = add(g, h);

    d = add(d, u); g = add(g, c); h = add(h, p); k = add(k, m);
  }

  return (hex(d) + hex(g) + hex(h) + hex(k)).toLowerCase();
}

/** Standard SHA-256 hex digest (synchronous, Node.js crypto). */
export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Compute the three signature headers required by admin.haiwangweb.com /webApi/* routes. */
export function signHaiwangRequest(): { 'X-Timestamp': string; 'X-API-Key': string; 'X-Custom-Sign': string } {
  const ts = Math.floor(Date.now() / 1000).toString();
  const apiKey = haiwangMd5(HAIWANG_TOKEN + HAIWANG_SEPARATOR + ts + HAIWANG_SALT);
  const customSign = sha256Hex(apiKey + ts);
  return {
    'X-Timestamp': ts,
    'X-API-Key': apiKey,
    'X-Custom-Sign': customSign,
  };
}

/**
 * Fetch wrapper that automatically injects Haiwang signature headers.
 * @param path - absolute URL or path relative to https://admin.haiwangweb.com
 * @param init - optional fetch options (headers are merged)
 */
export async function fetchHaiwang(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : HAIWANG_BASE_URL + path;
  const sigHeaders = signHaiwangRequest();
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(sigHeaders)) headers.set(k, v);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*');
  if (!headers.has('Lang')) headers.set('Lang', 'CN');
  if (!headers.has('Language')) headers.set('Language', 'zh-CN');
  return fetch(url, { ...init, headers });
}
