const DATABASE = 'netronim-os';
let connection: Promise<IDBDatabase> | undefined;
export function openDB(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      for (const name of ['files', 'kv', 'packages', 'logs']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: name === 'files' ? 'path' : 'key' });
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => reject(new Error('Close other Netronim tabs to upgrade local storage.'));
  });
  return connection;
}
async function tx<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted.'));
  });
}
export const db = {
  async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> { return tx(store, 'readonly', s => s.get(key)); },
  async all<T>(store: string): Promise<T[]> { return tx(store, 'readonly', s => s.getAll()); },
  async put<T>(store: string, value: T): Promise<void> { await tx(store, 'readwrite', s => s.put(value)); },
  async remove(store: string, key: IDBValidKey): Promise<void> { await tx(store, 'readwrite', s => s.delete(key)); },
  async clear(store: string): Promise<void> { await tx(store, 'readwrite', s => s.clear()); },
  async batch(store: string, puts: unknown[] = [], deletes: IDBValidKey[] = []): Promise<void> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      puts.forEach(value => objectStore.put(value)); deletes.forEach(key => objectStore.delete(key));
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  },
};
