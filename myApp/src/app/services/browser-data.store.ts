const databaseName = 'tali-local-data';
const databaseVersion = 1;
const objectStoreName = 'records';

interface StoredRecord<T> {
  key: string;
  value: T;
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

/** Stores app data in IndexedDB so uploaded media is not constrained by localStorage's small quota. */
export async function loadBrowserData<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
  onLoadError?: (error: unknown) => void,
): Promise<T> {
  let loadError: unknown;
  const database = await openDatabase();
  if (database) {
    try {
      const record = await readRecord<T>(database, key);
      if (record !== undefined && isValid(record)) return record;
      if (record !== undefined) loadError = new Error(`Saved ${key} data has an invalid shape.`);
    } catch (error) {
      console.error(`Could not read saved ${key} from IndexedDB.`, error);
      loadError = error;
    }
  } else if (typeof indexedDB !== 'undefined') {
    loadError = new Error(`Could not open IndexedDB to load ${key}.`);
  }

  // Migrate data saved by earlier versions of the app.
  try {
    const legacy = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    if (legacy !== null) {
      const parsed: unknown = JSON.parse(legacy);
      if (isValid(parsed)) {
        if (database) await writeRecord(database, key, parsed);
        return parsed;
      }
      loadError = new Error(`Saved ${key} data in local storage has an invalid shape.`);
    }
  } catch (error) {
    console.error(`Could not migrate saved ${key}.`, error);
    loadError = error;
  }

  if (loadError !== undefined) onLoadError?.(loadError);
  return fallback;
}

export async function saveBrowserData<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    console.error(`IndexedDB is unavailable; ${key} could not be saved.`);
    return;
  }

  try {
    await writeRecord(database, key, value);
  } catch (error) {
    console.error(`Could not save ${key} to IndexedDB.`, error);
  }
}

export async function deleteBrowserData(key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(objectStoreName, 'readwrite');
    transaction.objectStore(objectStoreName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) {
        database.createObjectStore(objectStoreName, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        void navigator.storage.persist().catch(() => undefined);
      }
      resolve(database);
    };
    request.onerror = () => {
      console.error('Could not open the local app database.', request.error);
      resolve(null);
    };
    request.onblocked = () => {
      console.error('The local app database is blocked by another open version.');
      resolve(null);
    };
  });

  return databasePromise;
}

function readRecord<T>(database: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, 'readonly');
    const request = transaction.objectStore(objectStoreName).get(key) as IDBRequest<StoredRecord<T> | undefined>;
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord<T>(database: IDBDatabase, key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, 'readwrite');
    transaction.objectStore(objectStoreName).put({ key, value } satisfies StoredRecord<T>);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
