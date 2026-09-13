// IndexedDB persistence for offline matches.
// Store: `matches`, key: matchId. Each record: { matchId, savedAt, mode, level, side, history, result }.

const DB_NAME = 'xiangqi3d';
const DB_VERSION = 1;
const STORE = 'matches';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'matchId' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('mode', 'mode', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMatch(record) {
  const store = await tx('readwrite');
  const rec = { ...record, savedAt: record.savedAt || new Date().toISOString() };
  if (!rec.matchId) rec.matchId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await reqP(store.put(rec));
  return rec.matchId;
}

export async function loadMatch(matchId) {
  const store = await tx('readonly');
  return reqP(store.get(matchId));
}

export async function listMatches() {
  const store = await tx('readonly');
  const all = await reqP(store.getAll());
  return (all || []).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export async function deleteMatch(matchId) {
  const store = await tx('readwrite');
  await reqP(store.delete(matchId));
}

export async function clearAll() {
  const store = await tx('readwrite');
  await reqP(store.clear());
}

// Try to POST the match to the mock backend so it also lives in the in-memory server store.
// Falls back silently on network failure — offline games should still save locally.
export async function pushToServer(record) {
  try {
    const res = await fetch('/api/v1/matches/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
