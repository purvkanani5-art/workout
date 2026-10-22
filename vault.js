'use strict';

/* Bhimlekha photo vault: progress photos encrypted on this phone, never uploaded anywhere.

   - Key: PBKDF2-SHA-256 (600,000 rounds, random 16-byte salt) from the owner's passcode → AES-256-GCM key.
     The key lives in memory only while unlocked; the passcode is never stored.
   - Storage: IndexedDB "bhimlekha-vault". Each photo record holds three separately encrypted parts (each with its
     own random 12-byte IV): meta (date, pose, size), a small thumbnail and the full image. Only the record id is
     in the clear.
   - A "verifier" (a known string encrypted with the key) tells a wrong passcode from a right one.
   - Backup: one binary file (.bhimvault) holding the salt, verifier and every encrypted record exactly as stored,
     so the file is as unreadable as the vault itself without the passcode. Restoring merges by record id.
   - Face ID (optional): a passkey on this phone with the WebAuthn PRF extension. Face ID releases a secret from
     the passkey; that secret (via HKDF) encrypts a copy of the 32-byte vault key, stored in meta.faceId. So Face ID
     really holds the key; it is not a screen in front of it. Needs iOS 18+ (PRF on iCloud Keychain passkeys). */

const Vault = (() => {
  const DB_NAME = 'bhimlekha-vault';
  const ITERATIONS = 600000;
  const VERIFY_TEXT = 'bhimlekha-vault-ok';
  const MAGIC = 'BHIMVLT1';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let key = null; // CryptoKey while unlocked
  let raw = null; // the same key's 32 bytes while unlocked, needed to set up Face ID; dropped on lock

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

  // PBKDF2 bits imported as AES-256: the same key deriveKey() would give, but the bytes can be wrapped for Face ID.
  async function deriveRaw(passcode, salt, iterations = ITERATIONS) {
    const base = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, 256));
  }

  const importAes = (bytes) => crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

  async function deriveKey(passcode, salt, iterations = ITERATIONS) {
    return importAes(await deriveRaw(passcode, salt, iterations));
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
    const r = await deriveRaw(passcode, salt);
    const k = await importAes(r);
    const verifier = await encrypt(k, enc.encode(VERIFY_TEXT));
    await putMeta({ v: 1, salt, iterations: ITERATIONS, verifier, createdAt: new Date().toISOString() });
    key = k;
    raw = r;
    try {
      await navigator.storage?.persist?.(); // ask the browser not to evict the vault under storage pressure
    } catch {}
  }

  async function unlock(passcode) {
    const cfg = await getMeta();
    if (!cfg) throw new Error('No vault yet');
    const r = await deriveRaw(passcode, cfg.salt, cfg.iterations);
    const k = await importAes(r);
    if (!(await checkKey(k, cfg))) return false;
    key = k;
    raw = r;
    return true;
  }

  function lock() {
    key = null;
    if (raw) raw.fill(0);
    raw = null;
  }

  /* ------------------------------------------------------------ Face ID */

  const FACE_INFO = enc.encode('bhimlekha-vault-faceid');

  /** Is Face ID set up for this vault? */
  async function faceIdEnabled() {
    const cfg = await getMeta();
    return Boolean(cfg && cfg.faceId);
  }

  /** False when this browser surely cannot do it (no WebAuthn, or it says PRF is unsupported). */
  async function faceIdPossible() {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) return false;
    try {
      if (PublicKeyCredential.getClientCapabilities) {
        const caps = await PublicKeyCredential.getClientCapabilities();
        if (caps && caps['extension:prf'] === false) return false;
      }
      if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      }
    } catch {}
    return true;
  }

  const prfFirst = (cred) => {
    const r = cred.getClientExtensionResults?.().prf?.results?.first;
    return r ? new Uint8Array(r) : null;
  };

  async function wrapKeyFrom(secret) {
    const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: FACE_INFO },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  function faceGet(credId, prfSalt) {
    return navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: credId }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
  }

  /**
   * Step 1 of turning Face ID on (vault must be unlocked). Call straight from a tap: iOS shows the passkey sheet.
   * Returns 'done', or 'confirm' when the phone made the passkey but gave no secret yet: then call
   * faceIdConfirm() from a second tap. Throws Error('unsupported') when the phone cannot do PRF.
   */
  let pendingFace = null;
  async function faceIdSetup() {
    if (!raw) throw new Error('Unlock the vault with the passcode first');
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Bhimlekha', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Bhimlekha photo vault', displayName: 'Bhimlekha photo vault' },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
        timeout: 60000,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
    const ext = cred.getClientExtensionResults?.() || {};
    if (!ext.prf || ext.prf.enabled === false) throw new Error('unsupported');
    const credId = new Uint8Array(cred.rawId);
    const secret = prfFirst(cred);
    if (secret) {
      await saveFace(credId, prfSalt, secret);
      return 'done';
    }
    pendingFace = { credId, prfSalt };
    return 'confirm';
  }

  /** Step 2 (only when step 1 returned 'confirm'): one Face ID scan to fetch the secret. */
  async function faceIdConfirm() {
    if (!pendingFace) throw new Error('Start again: tap Turn on Face ID');
    const { credId, prfSalt } = pendingFace;
    const secret = prfFirst(await faceGet(credId, prfSalt));
    if (!secret) throw new Error('unsupported');
    pendingFace = null;
    await saveFace(credId, prfSalt, secret);
    return 'done';
  }

  async function saveFace(credId, prfSalt, secret) {
    if (!raw) throw new Error('Vault is locked');
    const wrapped = await encrypt(await wrapKeyFrom(secret), raw);
    const cfg = await getMeta();
    await putMeta({ ...cfg, faceId: { credId, prfSalt, wrapped, addedAt: new Date().toISOString() } });
  }

  /** Unlock with Face ID. Call straight from a tap. Returns true, or false when the key did not open the vault. */
  async function unlockWithFaceId() {
    const cfg = await getMeta();
    if (!cfg?.faceId) throw new Error('Face ID is not set up');
    const secret = prfFirst(await faceGet(cfg.faceId.credId, cfg.faceId.prfSalt));
    if (!secret) return false;
    let r;
    try {
      r = await decrypt(await wrapKeyFrom(secret), cfg.faceId.wrapped);
    } catch {
      return false;
    }
    const k = await importAes(r);
    if (!(await checkKey(k, cfg))) return false;
    key = k;
    raw = r;
    return true;
  }

  async function faceIdOff() {
    pendingFace = null;
    const cfg = await getMeta();
    if (!cfg?.faceId) return;
    const { faceId, ...rest } = cfg;
    await putMeta(rest);
  }

  /** Re-encrypt every record under a new passcode (new salt). */
  async function changePasscode(oldPass, newPass) {
    const cfg = await getMeta();
    const oldKey = await deriveKey(oldPass, cfg.salt, cfg.iterations);
    if (!(await checkKey(oldKey, cfg))) return false;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const newRaw = await deriveRaw(newPass, salt);
    const k = await importAes(newRaw);
    const records = await allRecords();
    const fresh = [];
    for (const r of records) fresh.push(await reencrypt(r, oldKey, k));
    for (const r of fresh) await putRecord(r);
    // The Face ID copy holds the old key, so Face ID is switched off and has to be turned on again.
    const { faceId, ...rest } = cfg;
    await putMeta({ ...rest, salt, iterations: ITERATIONS, verifier: await encrypt(k, enc.encode(VERIFY_TEXT)) });
    key = k;
    raw = newRaw;
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
    const fileRaw = await deriveRaw(passcode, b.salt, b.iterations);
    const fileKey = await importAes(fileRaw);
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
      raw = fileRaw;
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

  /* ------------------------------------------------ week folder (Files) */

  // A week's photos as readable JPEGs in a .zip holding one folder, e.g.
  // "Week 3 - 13 Oct to 19 Oct 2026/Week-3 Back.jpg". Tapping the .zip in the Files app unpacks that folder.
  // This is the one place photos leave the vault decrypted, and only when the owner taps Save to Files.

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Uncompressed ("stored") zip of { name, bytes, date } entries; names are UTF-8. */
  function zip(entries) {
    const parts = [];
    const central = [];
    let off = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const crc = crc32(e.bytes);
      const d = e.date || new Date();
      const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(8, 0, true); // stored
      local.setUint16(10, time, true);
      local.setUint16(12, day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, e.bytes.length, true);
      local.setUint32(22, e.bytes.length, true);
      local.setUint16(26, name.length, true);
      parts.push(new Uint8Array(local.buffer), name, e.bytes);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, day, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, e.bytes.length, true);
      cen.setUint32(24, e.bytes.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(38, e.name.endsWith('/') ? 0x10 : 0, true); // directory attribute
      cen.setUint32(42, off, true);
      central.push(new Uint8Array(cen.buffer), name);
      off += 30 + name.length + e.bytes.length;
    }
    const cenSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, off, true);
    return [...parts, ...central, new Uint8Array(end.buffer)];
  }

  /**
   * The week's folder as a .zip File. `photos` = [{ id, fileName }] (fileName without .jpg; duplicates get " (2)").
   */
  async function exportWeek(folder, photos) {
    const k = need();
    const used = new Set();
    const entries = [{ name: `${folder}/`, bytes: new Uint8Array(0) }];
    for (const p of photos) {
      const r = await getRecord(p.id);
      if (!r) continue;
      let name = p.fileName;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${p.fileName} (${n})`;
      used.add(name.toLowerCase());
      entries.push({ name: `${folder}/${name}.jpg`, bytes: await decrypt(k, r.image), date: p.date ? new Date(`${p.date}T12:00:00`) : undefined });
    }
    return new File(zip(entries), `${folder}.zip`, { type: 'application/zip' });
  }

  /** Wipe the vault from this phone (used when the passcode is forgotten). */
  async function destroy() {
    lock();
    pendingFace = null;
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
    exportWeek,
    destroy,
    faceIdEnabled,
    faceIdPossible,
    faceIdSetup,
    faceIdConfirm,
    unlockWithFaceId,
    faceIdOff,
  };
})();
