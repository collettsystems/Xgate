import '../extensionApi.js';

const extensionApi = globalThis.extensionApi;
const fallbackApi = globalThis.chrome ?? globalThis.browser;
const storage = extensionApi?.storageLocal ?? fallbackApi?.storage?.local;
const runtimeId = extensionApi?.runtimeId ?? fallbackApi?.runtime?.id;

export const STORAGE_KEYS = {
  totals: 'totals',
  statsByDay: 'statsByDay',
  reflections: 'reflections',
  cooldownUntil: 'cooldownUntil',
  unlockedUntil: 'unlockedUntil',
  escalationCount: 'escalationCount',
  lastAttemptAt: 'lastAttemptAt',
  lastCooldownSeconds: 'lastCooldownSeconds'
};

export const STORAGE_DEFAULTS = {
  totals: {},
  statsByDay: {},
  reflections: [],
  cooldownUntil: 0,
  unlockedUntil: 0,
  escalationCount: 0,
  lastAttemptAt: 0,
  lastCooldownSeconds: 0
};

export const STORAGE_KEY_LIST = Object.values(STORAGE_KEYS);

export function withStorageDefaults(data = {}) {
  return { ...STORAGE_DEFAULTS, ...data };
}

export const getLocal = (keys) =>
  new Promise(resolve => (storage?.get ? storage.get(keys, resolve) : resolve({})));

export const setLocal = (obj) =>
  new Promise(resolve => (storage?.set ? storage.set(obj, resolve) : resolve()));

// Defensive wrappers (critical on X.com SPA)
export function safeGetLocal(keys) {
  try {
    if (!runtimeId) return Promise.resolve({});
    return getLocal(keys);
  } catch {
    return Promise.resolve({});
  }
}

export function safeSetLocal(obj) {
  try {
    if (!runtimeId) return Promise.resolve();
    return setLocal(obj);
  } catch {
    return Promise.resolve();
  }
}
