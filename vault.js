'use strict';

/* Bhimlekha photo vault: progress photos encrypted on this phone, never uploaded anywhere.

   - Key: PBKDF2-SHA-256 (600,000 rounds, random 16-byte salt) from the owner's passcode → AES-256-GCM key.
     The key lives in memory only while unlocked; the passcode is never stored.
   - Storage: IndexedDB "bhimlekha-vault". Each photo record holds three separately encrypted parts (each with its
     own random 12-byte IV): meta (date, pose, size), a small thumbnail and the full image. Only the record id is
     in the clear.
   - A "verifier" (a known string encrypted with the key) tells a wrong passcode from a right one.
   - Backup: one binary file (.bhimvault) holding the salt, verifier and every encrypted record exactly as stored,
     so the file is as unreadable as the vault itself without the passcode. Restoring merges by record id. */

const Vault = (() => {
  const DB_NAME = 'bhimlekha-vault';
  const ITERATIONS = 600000;
  const VERIFY_TEXT = 'bhimlekha-vault-ok';
  const MAGIC = 'BHIMVLT1';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let key = null; // CryptoKey while unlocked

  /* ------------------------------------------------------------ IndexedDB */

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(store, mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    } finally {
      db.close();
    }
  }

  const reqP = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

  const getMeta = () => tx('meta', 'readonly', (s) => reqP(s.get('config')));
  const putMeta = (cfg) => tx('meta', 'readwrite', (s) => reqP(s.put(cfg, 'config')));
  const allRecords = () => tx('photos', 'readonly', (s) => reqP(s.getAll()));
  const getRecord = (id) => tx('photos', 'readonly', (s) => reqP(s.get(id)));
  const putRecord = (rec) => tx('photos', 'readwrite', (s) => reqP(s.put(rec)));
  const deleteRecord = (id) => tx('photos', 'readwrite', (s) => reqP(s.delete(id)));

  /* --------------------------------------------------------------- crypto */

  async function deriveKey(passcode, salt, iterations = ITERATIONS) {
    const base = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  async function encrypt(k, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, bytes);
    return { iv, data: new Uint8Array(data) };
  }

  async function decrypt(k, part) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: part.iv }, k, part.data));
  }

  async function checkKey(k, cfg) {
    try {
      return dec.decode(await decrypt(k, cfg.verifier)) === VERIFY_TEXT;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------- lifecycle */

  async function isSetUp() {
    return Boolean(await getMeta());
  }

  function isUnlocked() {
    return Boolean(key);
  }

  async function create(passcode) {
    if (await getMeta()) throw new Error('A vault already exists on this phone');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(passcode, salt);
    const verifier = await encrypt(k, enc.encode(VERIFY_TEXT));
    await putMeta({ v: 1, salt, iterations: ITERATIONS, verifier, createdAt: new Date().toISOString() });
    key = k;
    try {
      await navigator.storage?.persist?.(); // ask the browser not to evict the vault under storage pressure
    } catch {}
  }

  async function unlock(passcode) {
    const cfg = await getMeta();
    if (!cfg) throw new Error('No vault yet');
    const k = await deriveKey(passcode, cfg.salt, cfg.iterations);
    if (!(await checkKey(k, cfg))) return false;
    key = k;
    return true;
  }

  function lock() {
    key = null;
  }

  /** Re-encrypt every record under a new passcode (new salt). */
  async function changePasscode(oldPass, newPass) {
    const cfg = await getMeta();
    const oldKey = await deriveKey(oldPass, cfg.salt, cfg.iterations);
    if (!(await checkKey(oldKey, cfg))) return false;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(newPass, salt);
    const records = await allRecords();
    const fresh = [];
    for (const r of records) fresh.push(await reencrypt(r, oldKey, k));
    for (const r of fresh) await putRecord(r);
    await putMeta({ ...cfg, salt, iterations: ITERATIONS, verifier: await encrypt(k, enc.encode(VERIFY_TEXT)) });
    key = k;
    return true;
  }

  async function reencrypt(r, from, to) {
    return {
      id: r.id,
      meta: await encrypt(to, await decrypt(from, r.meta)),
      thumb: await encrypt(to, await decrypt(from, r.thumb)),
      image: await encrypt(to, await decrypt(from, r.image)),
    };
  }

  /* ------------------------------------------------------------- photos */

  function need() {
    if (!key) throw new Error('Vault is locked');
    return key;
  }

  /** Downscale a captured image to `max` px on the long side and JPEG-encode it. */
  async function shrink(blobOrCanvas, max, quality) {
    let source = blobOrCanvas;
    let w;
    let h;
    if (blobOrCanvas instanceof Blob) {
      source = await createImageBitmap(blobOrCanvas, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(blobOrCanvas));
    }
    w = source.width;
    h = source.height;
    const scale = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    if (source.close) source.close();
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height };
  }

  /** Add a photo (a Blob from the file picker or a canvas from the in-app camera). Returns its meta. */
  async function addPhoto(source, { date, pose }) {
    const k = need();
    const full = await shrink(source, 1600, 0.85);
    const small = await shrink(source, 360, 0.7);
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const meta = { id, date, pose, width: full.width, height: full.height, bytes: full.bytes.length, addedAt: new Date().toISOString() };
    await putRecord({
      id,
      meta: await encrypt(k, enc.encode(JSON.stringify(meta))),
      thumb: await encrypt(k, small.bytes),
      image: await encrypt(k, full.bytes),
    });
    return meta;
  }

  /** Every photo's meta and thumbnail (as an object URL), newest first. Caller revokes the URLs (see revokeAll). */
  async function list() {
    const k = need();
    const out = [];
    for (const r of await allRecords()) {
      try {
        const meta = JSON.parse(dec.decode(await decrypt(k, r.meta)));
        const thumbUrl = track(URL.createObjectURL(new Blob([await decrypt(k, r.thumb)], { type: 'image/jpeg' })));
        out.push({ ...meta, thumbUrl });
      } catch {
        /* a record from another vault that was not re-encrypted: skip it */
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.addedAt.localeCompare(a.addedAt));
  }

  async function imageUrl(id) {
    const k = need();
    const r = await getRecord(id);
    if (!r) return null;
    return track(URL.createObjectURL(new Blob([await decrypt(k, r.image)], { type: 'image/jpeg' })));
  }

  async function remove(id) {
    need();
    await deleteRecord(id);
  }

  async function count() {
    return (await allRecords()).length;
  }

  // Object URLs of decrypted images, revoked on lock so nothing decrypted outlives the session.
  const urls = new Set();
  function track(u) {
    urls.add(u);
    return u;
  }
  function revokeAll() {
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
  }

  /* ------------------------------------------------------------- backup */

  // Container: MAGIC (8 bytes) | header length (uint32 LE) | header JSON (UTF-8) | blobs...
  // Header: { v, salt, iterations, verifier: {iv, off, len}, records: [{ id, meta, thumb, image }] }, every part
  // given as { iv (base64), off, len } into the blob area. Nothing in the header is readable without the key.

  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function exportBackup() {
    const cfg = await getMeta();
    if (!cfg) throw new Error('No vault yet');
    const records = await allRecords();
    const blobs = [];
    let off = 0;
    const part = (p) => {
      blobs.push(p.data);
      const ref = { iv: b64(p.iv), off, len: p.data.length };
      off += p.data.length;
      return ref;
    };
    const header = {
      v: 1,
      salt: b64(cfg.salt),
      iterations: cfg.iterations,
      verifier: part(cfg.verifier),
      records: records.map((r) => ({ id: r.id, meta: part(r.meta), thumb: part(r.thumb), image: part(r.image) })),
      exportedAt: new Date().toISOString(),
    };
    const head = enc.encode(JSON.stringify(header));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, head.length, true);
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      file: new File([enc.encode(MAGIC), len, head, ...blobs], `bhimlekha-photos-${stamp}.bhimvault`, { type: 'application/octet-stream' }),
      photos: records.length,
    };
  }

  async function readBackup(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (dec.decode(buf.slice(0, 8)) !== MAGIC) throw new Error('Not a Bhimlekha photo backup');
    const len = new DataView(buf.buffer, buf.byteOffset + 8, 4).getUint32(0, true);
    const header = JSON.parse(dec.decode(buf.slice(12, 12 + len)));
    const base = 12 + len;
    const part = (ref) => ({ iv: unb64(ref.iv), data: buf.slice(base + ref.off, base + ref.off + ref.len) });
    return {
      salt: unb64(header.salt),
      iterations: header.iterations,
      verifier: part(header.verifier),
      records: header.records.map((r) => ({ id: r.id, meta: part(r.meta), thumb: part(r.thumb), image: part(r.image) })),
      exportedAt: header.exportedAt,
    };
  }

  /**
   * Restore a backup made with `passcode`. With no vault on this phone the backup becomes the vault (same passcode);
   * otherwise its photos are re-encrypted under the current (unlocked) key and merged by id.
   * Returns { added } or false for a wrong passcode.
   */
  async function importBackup(file, passcode) {
    const b = await readBackup(file);
    const fileKey = await deriveKey(passcode, b.salt, b.iterations);
    if (!(await checkKey(fileKey, b))) return false;
    const cfg = await getMeta();
    const existing = new Set((await allRecords()).map((r) => r.id));
    let added = 0;
    if (!cfg) {
      await putMeta({ v: 1, salt: b.salt, iterations: b.iterations, verifier: b.verifier, createdAt: new Date().toISOString() });
      for (const r of b.records) {
        await putRecord(r);
        added++;
      }
      key = fileKey;
    } else {
      const k = need();
      for (const r of b.records) {
        if (existing.has(r.id)) continue;
        await putRecord(await reencrypt(r, fileKey, k));
        added++;
      }
    }
    return { added, total: b.records.length };
  }

  /** Wipe the vault from this phone (used when the passcode is forgotten). */
  async function destroy() {
    key = null;
    revokeAll();
    await new Promise((res, rej) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = res;
      r.onerror = () => rej(r.error);
      r.onblocked = res;
    });
  }

  return {
    isSetUp,
    isUnlocked,
    create,
    unlock,
    lock,
    changePasscode,
    addPhoto,
    list,
    imageUrl,
    remove,
    count,
    revokeAll,
    exportBackup,
    importBackup,
    destroy,
  };
})();
