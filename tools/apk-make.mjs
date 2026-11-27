/* Robo Apps → a real Android app, made on the kid's own device (no server, no build machine).
   The shell (robo-apps-shell.apk, built once by this repo's GitHub Action) is a full-screen WebView; this file puts the kid's app in it:
     · assets/index.html  ← the app page (apps-run.js appDoc(…, 'file'))
     · the package «com.roboegypt.app.aaaaaaaaaaaa» ← 12 letters of the kid's own, so two apps never replace each other
     · the name (string app_name, a 60-letter placeholder) ← the app's name
     · res/…/ic_launcher.png ← the app's icon
   then signs it with APK Signature Scheme v2 (Android 7+), the key kept in the browser so a new version installs over the old one.
   The same file is in roboegypt.com's legacy/src/lab/apk-make.js: keep them the same. Works in browsers and Node 18+. */
const te = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

/* ---------- bytes ---------- */
const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const u16 = v => new Uint8Array([v & 255, (v >>> 8) & 255]);
const u32 = v => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
const u64 = v => cat(u32(v % 4294967296), u32(Math.floor(v / 4294967296)));
const lp = b => cat(u32(b.length), b);
const r16 = (b, o) => b[o] | (b[o + 1] << 8), r32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
let CRC = null;
function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}
async function inflate(b) {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const sha256 = async b => new Uint8Array(await subtle().digest('SHA-256', b));
function find(hay, needle, from = 0) {
  outer: for (let i = from; i <= hay.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i; }
  return -1;
}
const utf16 = s => { const o = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { o[2 * i] = s.charCodeAt(i) & 255; o[2 * i + 1] = s.charCodeAt(i) >>> 8; } return o; };

/* ---------- zip ---------- */
export function readZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let e = b.length - 22; while (e >= 0 && r32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const n = r16(b, e + 10), cdOff = r32(b, e + 16), out = [];
  for (let i = 0, p = cdOff; i < n; i++) {
    const method = r16(b, p + 10), crc = r32(b, p + 16), csize = r32(b, p + 20), usize = r32(b, p + 24), nl = r16(b, p + 28), xl = r16(b, p + 30), cl = r16(b, p + 32), lo = r32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + r16(b, lo + 26) + r16(b, lo + 28);
    out.push({ name, method, crc, csize, usize, data: b.subarray(ds, ds + csize) });
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function plain(e) { return e.method === 0 ? e.data : inflate(e.data); }
function writeZip(entries) {   // stored entries start on a 4-byte boundary (zipalign), like Android wants for resources.arsc
  const parts = [], cd = []; let off = 0;
  for (const e of entries) {
    const name = te.encode(e.name);
    let pad = 0; if (e.method === 0) { const at = off + 30 + name.length; if (at % 4) pad = 4 + ((4 - ((at + 4) % 4)) % 4); }
    const extra = pad ? cat(u16(0xD935), u16(pad - 4), new Uint8Array(pad - 4)) : new Uint8Array(0);
    const head = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(e.method), u16(0), u16(0x21), u32(e.crc), u32(e.csize), u32(e.usize), u16(name.length), u16(extra.length), name, extra);
    parts.push(head, e.data);
    cd.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(e.method), u16(0), u16(0x21), u32(e.crc), u32(e.csize), u32(e.usize), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), name));
    off += head.length + e.data.length;
  }
  const body = cat(...parts), cdb = cat(...cd);
  const eocd = cat(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cdb.length), u32(body.length), u16(0));
  return { body, cd: cdb, eocd };
}
const stored = (name, data) => ({ name, method: 0, crc: crc32(data), csize: data.length, usize: data.length, data });

/* ---------- the kid's changes ---------- */
function patchPackage(xml, id12) {
  const at = find(xml, utf16('com.roboegypt.app.aaaaaaaaaaaa'));
  if (at < 0) throw new Error('package placeholder not found');
  const o = xml.slice(); o.set(utf16(id12), at + utf16('com.roboegypt.app.').length); return o;
}
const PH = 'ROBOAPPNAME_ROBOAPPNAME_ROBOAPPNAME_ROBOAPPNAME_ROBOAPPNAME_';
function patchName(arsc, name) {
  const o = arsc.slice(); let at = find(o, te.encode(PH));
  if (at >= 0) {   // UTF-8 string pool: [chars][bytes] then the bytes and a 0
    let s = '', b = new Uint8Array(0);
    for (const ch of Array.from(name)) { const nb = te.encode(s + ch); if (nb.length > 60) break; s += ch; b = nb; }
    if (o[at - 2] !== 60 || o[at - 1] !== 60) throw new Error('name placeholder looks different');
    o[at - 2] = s.length; o[at - 1] = b.length; o.fill(0, at, at + 61); o.set(b, at); return o;
  }
  at = find(o, utf16(PH));
  if (at < 0) throw new Error('name placeholder not found');
  const s = Array.from(name).join('').slice(0, 60);
  o[at - 2] = s.length & 255; o[at - 1] = s.length >>> 8; o.fill(0, at, at + 122); o.set(utf16(s), at); return o;
}

/* ---------- signing (APK Signature Scheme v2) ---------- */
function der(tag, body) {
  const n = body.length, len = n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  return cat(new Uint8Array([tag, ...len]), body);
}
const seq = (...a) => der(0x30, cat(...a));
const oid = s => { const p = s.split('.').map(Number), b = [40 * p[0] + p[1]]; for (const v of p.slice(2)) { const t = []; let x = v; do { t.unshift(x & 127); x >>= 7; } while (x); for (let i = 0; i < t.length - 1; i++) t[i] |= 128; b.push(...t); } return der(0x06, new Uint8Array(b)); };
const RSA_SHA256 = () => seq(oid('1.2.840.113549.1.1.11'), new Uint8Array([5, 0]));
const cn = t => seq(der(0x31, seq(oid('2.5.4.3'), der(0x0C, te.encode(t)))));
async function makeCert(keys, spki) {
  const serial = globalThis.crypto.getRandomValues(new Uint8Array(8)); serial[0] = (serial[0] & 0x7f) | 1;
  const tbs = seq(der(0xA0, der(0x02, new Uint8Array([2]))), der(0x02, serial), RSA_SHA256(), cn('Robo Apps'),
    seq(der(0x17, te.encode('260101000000Z')), der(0x18, te.encode('20510101000000Z'))), cn('Robo Apps'), spki);
  const sig = new Uint8Array(await subtle().sign('RSASSA-PKCS1-v1_5', keys.privateKey, tbs));
  return seq(tbs, RSA_SHA256(), der(0x03, cat(new Uint8Array([0]), sig)));
}
/** a signing key for this browser: { pkcs8, spki, cert } as base64; keep it, so updates install over the old app */
export async function newKey() {
  const k = await subtle().generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await subtle().exportKey('spki', k.publicKey)), pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', k.privateKey));
  const cert = await makeCert(k, spki), b64 = u => btoa(String.fromCharCode(...u));
  return { pkcs8: b64(pkcs8), spki: b64(spki), cert: b64(cert) };
}
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function contentDigest(sections) {
  const chunks = [];
  for (const s of sections) for (let i = 0; i < s.length; i += 1048576) { const c = s.subarray(i, Math.min(s.length, i + 1048576)); chunks.push(await sha256(cat(new Uint8Array([0xa5]), u32(c.length), c))); }
  return sha256(cat(new Uint8Array([0x5a]), u32(chunks.length), ...chunks));
}
async function signV2(z, key) {
  const priv = await subtle().importKey('pkcs8', unb64(key.pkcs8), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const spki = unb64(key.spki), cert = unb64(key.cert);
  const eocd = z.eocd.slice(); eocd.set(u32(z.body.length), 16);     // for the digest the central directory starts where the block will be
  const digest = await contentDigest([z.body, z.cd, eocd]);
  const signedData = cat(lp(lp(cat(u32(0x0103), lp(digest)))), lp(lp(cert)), lp(new Uint8Array(0)));
  const sig = new Uint8Array(await subtle().sign('RSASSA-PKCS1-v1_5', priv, signedData));
  const signer = cat(lp(signedData), lp(lp(cat(u32(0x0103), lp(sig)))), lp(spki));
  const value = lp(lp(signer));
  const pair = cat(u64(4 + value.length), u32(0x7109871a), value);
  const size = pair.length + 8 + 16;
  const block = cat(u64(size), pair, u64(size), te.encode('APK Sig Block 42'));
  const end = z.eocd.slice(); end.set(u32(z.body.length + block.length), 16);
  return cat(z.body, block, z.cd, end);
}

/** shell: the shell APK's bytes; o: { name, id12 (12 letters a–z), html, icon (PNG bytes, optional), key (from newKey) } → the APK's bytes */
export async function makeApk(shell, o) {
  if (!/^[a-z]{12}$/.test(o.id12)) throw new Error('id12 must be 12 letters a–z');
  const out = [];
  for (const e of readZip(shell)) {
    if (e.name.startsWith('META-INF/')) continue;
    if (e.name === 'AndroidManifest.xml') out.push(stored(e.name, patchPackage(await plain(e), o.id12)));
    else if (e.name === 'resources.arsc') out.push(stored(e.name, patchName(await plain(e), o.name || 'Robo App')));
    else if (e.name === 'assets/index.html') out.push(stored(e.name, te.encode(o.html)));
    else if (o.icon && /ic_launcher[^/]*\.png$/.test(e.name)) out.push(stored(e.name, o.icon));
    else out.push(e);
  }
  return signV2(writeZip(out), o.key);
}
