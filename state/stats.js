import { KEYS, safeGet, safeSet } from './storage.js';

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function bumpDailyCounter(field, inc = 1) {
  const key = todayKey();
  const { statsByDay = {} } = await safeGet([KEYS.statsByDay]);
  statsByDay[key] = statsByDay[key] || {};
  statsByDay[key][field] = (statsByDay[key][field] || 0) + inc;
  await safeSet({ [KEYS.statsByDay]: statsByDay });
}

export async function appendReflection(entry) {
  const { reflections = [] } = await safeGet([KEYS.reflections]);
  reflections.unshift(entry);
  reflections.splice(50);
  await safeSet({ [KEYS.reflections]: reflections });
}
