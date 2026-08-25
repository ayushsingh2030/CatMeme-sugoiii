// storage.js
// Persists uploaded memes (as image blobs) and their calibration profiles
// in the browser's IndexedDB, so both survive refresh, close, and reopen.

const DB_NAME = "catmeme-sugoiii";
const DB_VERSION = 1;
const MEME_STORE = "memes";
const CALIBRATION_STORE = "calibrations";

let dbPromise = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(MEME_STORE)) {
        db.createObjectStore(MEME_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(CALIBRATION_STORE)) {
        db.createObjectStore(CALIBRATION_STORE, { keyPath: "memeId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getDB() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

// --- Memes -----------------------------------------------------------------

export async function saveMemeRecord(meme, blob) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEME_STORE, "readwrite");
    tx.objectStore(MEME_STORE).put({
      id: meme.id,
      name: meme.name,
      blob,
      createdAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllMemeRecords() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEME_STORE, "readonly");
    const request = tx.objectStore(MEME_STORE).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Calibration profiles ---------------------------------------------------

export async function saveCalibrationRecord(memeId, profile) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CALIBRATION_STORE, "readwrite");
    tx.objectStore(CALIBRATION_STORE).put({
      memeId,
      profile,
      updatedAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllCalibrationRecords() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CALIBRATION_STORE, "readonly");
    const request = tx.objectStore(CALIBRATION_STORE).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}