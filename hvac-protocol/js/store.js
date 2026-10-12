// Local storage: one IndexedDB object store, one record per protocol.
//   record = { id, protocol, savedAt, backedUpAt }
// Writes use strict durability: the promise resolves only after the browser
// has committed the data to disk, so a browser/app crash or a reboot can't
// lose a value that was reported as saved.

const DB_NAME = 'hvac-protocols';
const STORE = 'protocols';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => { dbPromise = null; reject(new Error('database blocked by another tab')); };
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = mode === 'readwrite'
      ? db.transaction(STORE, mode, { durability: 'strict' })
      : db.transaction(STORE, mode);
    let result;
    const req = fn(tx.objectStore(STORE));
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

export const getAll = () => run('readonly', (s) => s.getAll());
export const remove = (id) => run('readwrite', (s) => s.delete(id));
export const putMany = (records) => run('readwrite', (s) => { for (const r of records) s.put(r); });

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 'persistent' | 'best-effort' | 'unsupported'. Asks for persistence when not yet granted. */
export async function ensurePersistentStorage() {
  if (!navigator.storage?.persisted) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}
