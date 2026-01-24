import '../extensionApi.js';

function getExtensionApi() {
  return globalThis.extensionApi ?? null;
}

function getFallbackApi() {
  return globalThis.chrome ?? globalThis.browser ?? null;
}

function getStorage() {
  const extensionApi = getExtensionApi();
  const fallbackApi = getFallbackApi();
  return extensionApi?.storageLocal ?? fallbackApi?.storage?.local ?? null;
}

function getRuntimeId() {
  const extensionApi = getExtensionApi();
  const fallbackApi = getFallbackApi();
  return extensionApi?.runtimeId ?? fallbackApi?.runtime?.id ?? null;
}

export const KEYS = {
  cooldownUntil: 'cooldownUntil',
  unlockedUntil: 'unlockedUntil',
  escalationCount: 'escalationCount',
  lastAttemptAt: 'lastAttemptAt',
  lastCooldownSeconds: 'lastCooldownSeconds',
  totals: 'totals',
  statsByDay: 'statsByDay',
  reflections: 'reflections'
};

export const DEFAULTS = {
  totals: {},
  statsByDay: {},
  reflections: []
};

export const loadState = (keys) =>
  new Promise(resolve => {
    const storage = getStorage();
    return storage?.get ? storage.get(keys, resolve) : resolve({});
  });

export const saveState = (obj) =>
  new Promise(resolve => {
    const storage = getStorage();
    return storage?.set ? storage.set(obj, resolve) : resolve();
  });

// Defensive wrappers (critical on X.com SPA)
export function safeGet(keys) {
  try {
    if (!getRuntimeId()) return Promise.resolve({});
    return loadState(keys);
  } catch {
    return Promise.resolve({});
  }
}

export function safeSet(obj) {
  try {
    if (!getRuntimeId()) return Promise.resolve();
    return saveState(obj);
  } catch {
    return Promise.resolve();
  }
}

function defaultForKey(key) {
  switch (key) {
    case KEYS.totals:
      return { ...DEFAULTS.totals };
    case KEYS.statsByDay:
      return { ...DEFAULTS.statsByDay };
    case KEYS.reflections:
      return [...DEFAULTS.reflections];
    default:
      return 0;
  }
}

function buildDefaults(keys) {
  return keys.reduce((acc, key) => {
    acc[key] = defaultForKey(key);
    return acc;
  }, {});
}

export async function getStateSnapshot(keys = Object.values(KEYS)) {
  const defaults = buildDefaults(keys);
  const state = await safeGet(keys);
  return { ...defaults, ...state };
}
