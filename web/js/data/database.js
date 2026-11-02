import { DB_NAME, DB_VERSION, STORE_NAME } from '../core/config.js';

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local folder storage.'));
  });
}

function request(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const resultRequest = operation(transaction.objectStore(STORE_NAME));
    let result;

    resultRequest.onsuccess = () => { result = resultRequest.result; };
    resultRequest.onerror = () => reject(resultRequest.error || new Error('Local folder storage failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Local folder storage failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local folder storage transaction was aborted.'));
  });
}

export async function loadSources(db) {
  const sources = (await request(db, 'readonly', (store) => store.getAll())) || [];
  return sources.sort((a, b) => a.label.localeCompare(b.label));
}

export function saveSource(db, source) {
  return request(db, 'readwrite', (store) => store.put(source));
}

export function deleteSource(db, id) {
  return request(db, 'readwrite', (store) => store.delete(id));
}
