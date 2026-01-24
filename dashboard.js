const extensionApi = globalThis.extensionApi;
const fallbackApi = globalThis.chrome ?? globalThis.browser;
const storageLocal = extensionApi?.storageLocal ?? fallbackApi?.storage?.local;

function getLocal(keys) {
  if (!storageLocal?.get) return Promise.resolve({});
  return new Promise(resolve => storageLocal.get(keys, resolve));
}

function setLocal(obj) {
  if (!storageLocal?.set) return Promise.resolve();
  return new Promise(resolve => storageLocal.set(obj, resolve));
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}

function fmtRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function el(id) {
  return document.getElementById(id);
}

async function render() {
  const key = todayKey();
  el('todayKey').textContent = key;

  const {
    cooldownUntil = 0,
    unlockedUntil = 0,
    escalationCount = 0,
    lastCooldownSeconds = 0,
    totals = {},
    statsByDay = {},
    reflections = []
  } = await getLocal([
    'cooldownUntil',
    'unlockedUntil',
    'escalationCount',
    'lastCooldownSeconds',
    'totals',
    'statsByDay',
    'reflections'
  ]);

  const now = Date.now();

  // Status
  let status = 'Ready (no cooldown)';
  if (typeof cooldownUntil === 'number' && cooldownUntil > now) {
    status = `Cooldown: ${fmtRemaining(cooldownUntil - now)} remaining (level ${Math.max(1, escalationCount)})`;
  } else if (unlockedUntil && now < unlockedUntil) {
    status = `Unlocked: ${fmtRemaining(unlockedUntil - now)} remaining`;
  }
  el('status').textContent = status;

  // Global totals
  el('attempts').textContent = totals.attempts || 0;
  el('confirmed').textContent = totals.confirmed || 0;
  el('canceled').textContent = totals.canceled || 0;
  el('allowed').textContent = totals.engagementsAllowed || 0;

  el('cooldownsCommitted').textContent = totals.cooldownsCommitted || 0;
  el('cooldownsCanceled').textContent = totals.cooldownsCanceled || 0;

  const lastCd = totals.lastCooldownAt
    ? `${lastCooldownSeconds || '—'}s @ ${fmtTime(totals.lastCooldownAt)}`
    : '—';
  el('lastCooldown').textContent = lastCd;

  // Today
  const day = statsByDay[key] || {};
  el('d_attempts').textContent = day.attempts || 0;
  el('d_confirmed').textContent = day.confirmed || 0;
  el('d_canceled').textContent = day.canceled || 0;
  el('d_allowed').textContent = day.engagementsAllowed || 0;

  el('d_committed').textContent = day.cooldownsCommitted || 0;
  el('d_canceledCooldowns').textContent = day.cooldownsCanceled || 0;

  // Reflections (latest 10)
  const list = el('reflections');
  list.innerHTML = '';

  const top10 = (reflections || []).slice(0, 10);
  if (!top10.length) {
    const empty = document.createElement('div');
    empty.className = 'subtle';
    empty.style.fontSize = '12px';
    empty.textContent = 'No reflections yet.';
    list.appendChild(empty);
    return;
  }

  for (const r of top10) {
    const item = document.createElement('div');
    item.className = 'item';

    const top = document.createElement('div');
    top.className = 'top';

    const left = document.createElement('div');
    left.className = 'badge';
    left.textContent = `${r.actionType || 'engage'} • ${r.cooldownSeconds || '?'}s`;

    const right = document.createElement('div');
    right.className = 'badge';
    right.textContent = fmtTime(r.ts);

    top.appendChild(left);
    top.appendChild(right);

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = r.reflection || '';

    item.appendChild(top);
    item.appendChild(text);

    list.appendChild(item);
  }
}

async function resetAll() {
  await setLocal({
    cooldownUntil: 0,
    unlockedUntil: 0,
    escalationCount: 0,
    lastAttemptAt: 0,
    lastCooldownSeconds: 0,
    totals: {},
    statsByDay: {},
    reflections: []
  });
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  el('refresh').addEventListener('click', render);
  el('reset').addEventListener('click', resetAll);
  render();
});
