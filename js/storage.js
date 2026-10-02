/**
 * Workly - Storage Abstraction Layer (IndexedDB Foundation)
 */

const DB_NAME = 'WorklyDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

let dbInstance = null;

// Default initial locations (clean empty state for fresh application)
export const DEFAULT_LOCATIONS = [];

export const DEFAULT_SETTINGS = {
  targetHoursPerWfoDay: 6,
  targetHours: 6, // backwards compatibility alias
  wfoRequirementMode: 'percentage', // 'percentage' | 'manual'
  wfoMode: 'percentage', // backwards compatibility alias
  wfoPercentage: 60,
  autoPercentage: 60, // backwards compatibility alias
  manualWfoDays: 12,
  manualDays: 12, // backwards compatibility alias
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  monthlyOverrides: {},
  autoTracking: true,
  manualTracking: true,
  gracePeriod: 10,
  notifyMaster: true,
  notifyEntry: true,
  notifyExit: true,
  notifyTarget: true,
  notifyReminder: true,
  reminderThreshold: 60,
  notifyMonthly: true,
  notifyWfoProgress: true,
  wfoReminderFreq: 'weekly',
  theme: 'system'
};

export const DEFAULT_HOME_STATE = {
  status: 'OUTSIDE OFFICE',
  checkInTime: '--',
  timerSeconds: 0,
  timerRunning: false,
  targetSeconds: 21600, // 06:00:00
  wfoDaysCurrent: 0,
  wfoDaysTarget: 12,
  avgHours: '00h 00m',
  targetHours: '06h 00m'
};

/**
 * Initializes the IndexedDB database connection
 * @returns {Promise<IDBDatabase>}
 */
export function initStorage() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB is not supported in this browser environment.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      console.log('[Storage] IndexedDB initialized successfully.');
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[Storage] IndexedDB initialization error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Saves a key-value pair to IndexedDB
 */
export async function saveData(key, value) {
  const db = await initStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ key, value, timestamp: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Loads a value by key from IndexedDB
 */
export async function loadData(key) {
  const db = await initStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = (event) => {
      const result = event.target.result;
      resolve(result ? result.value : null);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Deletes a key from IndexedDB
 */
export async function deleteData(key) {
  const db = await initStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Clears all data in IndexedDB
 */
export async function clearAllData() {
  const db = await initStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Storage verification test helper
 */
export async function testStorage() {
  const testKey = 'workly_storage_test';
  const testValue = { status: 'ok', timestamp: Date.now() };

  try {
    await saveData(testKey, testValue);
    const retrieved = await loadData(testKey);

    if (retrieved && retrieved.status === 'ok') {
      return {
        success: true,
        message: `IndexedDB test passed cleanly at ${new Date(retrieved.timestamp).toLocaleTimeString()}`
      };
    } else {
      return {
        success: false,
        message: 'IndexedDB test failed: Retrieved value mismatch.'
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `IndexedDB test error: ${err.message}`
    };
  }
}
