/**
 * Cooldown engine invariants:
 * - This module should not access chrome.storage.local directly (only via state/storage.js).
 * - startCooldown stages in-memory state only and must never write to storage.
 * - commitPendingCooldown is the single place that persists cooldowns.
 * - UI-only helpers (like relockEngagement) must never call storage.
 */
import { KEYS, safeGet, safeSet } from './storage.js';
import { bumpDailyCounter, appendReflection } from './stats.js';
import { showPendingCooldownOverlay } from '../ui/overlays.js';

/* =========================
   State
========================= */

let pendingCooldown = null;
let pendingActionElement = null;
let triggerNativeClick = null;
let selectors = [];

/* =========================
   Config
========================= */

const COOLDOWN_LADDER_SECONDS = [60, 300, 900, 1800];
const ESCALATION_RESET_WINDOW_MS = 30 * 60 * 1000;
const UNLOCK_WINDOW_MS = 15 * 1000;

export function setCooldownDependencies({ triggerNativeClick: trigger, selectors: nextSelectors }) {
  triggerNativeClick = trigger;
  selectors = Array.isArray(nextSelectors) ? nextSelectors : [];
}

/* =========================
   Escalation
========================= */

export async function computeNextCooldownPreview() {
  const now = Date.now();
  const { escalationCount = 0, lastAttemptAt = 0 } =
    await safeGet([KEYS.escalationCount, KEYS.lastAttemptAt]);

  const reset = !lastAttemptAt || (now - lastAttemptAt) > ESCALATION_RESET_WINDOW_MS;
  const nextCount = reset ? 1 : escalationCount + 1;
  const idx = Math.min(nextCount - 1, COOLDOWN_LADDER_SECONDS.length - 1);

  return {
    ms: COOLDOWN_LADDER_SECONDS[idx] * 1000,
    nextCount,
    now
  };
}

/**
 * Starts a cooldown preview by staging in-memory state only.
 * This function must never write to storage.
 */
export async function startCooldown({ reflection, actionType, actionElement }) {
  const { ms, nextCount, now } = await computeNextCooldownPreview();

  pendingActionElement = actionElement ?? null;
  pendingCooldown = {
    cooldownUntil: now + ms,
    cooldownMs: ms,
    reflection,
    actionType,
    startedAt: now,
    nextCount
  };

  showPendingCooldownOverlay({
    pending: pendingCooldown,
    isPendingActive: () => Boolean(pendingCooldown),
    onCancel: handlePendingCancel,
    onCommitted: commitPendingCooldown
  });
}

/**
 * Commits the pending cooldown to storage.
 * This is the only place that persists cooldown state.
 */
export async function commitPendingCooldown() {
  if (!pendingCooldown) return;

  const { cooldownUntil, cooldownMs, reflection, actionType, startedAt, nextCount } = pendingCooldown;
  pendingCooldown = null;

  await safeSet({
    [KEYS.cooldownUntil]: cooldownUntil,
    [KEYS.unlockedUntil]: 0,
    [KEYS.escalationCount]: nextCount,
    [KEYS.lastAttemptAt]: startedAt,
    [KEYS.lastCooldownSeconds]: Math.round(cooldownMs / 1000)
  });

  const { totals = {} } = await safeGet([KEYS.totals]);
  totals.cooldownsCommitted = (totals.cooldownsCommitted || 0) + 1;
  totals.confirmed = (totals.confirmed || 0) + 1;
  totals.lastCooldownAt = startedAt;
  await safeSet({ [KEYS.totals]: totals });

  await bumpDailyCounter('cooldownsCommitted', 1);
  await bumpDailyCounter('confirmed', 1);

  await appendReflection({
    ts: startedAt,
    actionType,
    reflection,
    cooldownSeconds: Math.round(cooldownMs / 1000)
  });

  unlockEngagementTemporarily();
  if (pendingActionElement && document.contains(pendingActionElement)) {
    triggerNativeClick?.(pendingActionElement);
  }

  pendingActionElement = null;
}

async function handlePendingCancel() {
  pendingCooldown = null;
  relockEngagement(); // UI only

  const { totals = {} } = await safeGet([KEYS.totals]);
  totals.cooldownsCanceled = (totals.cooldownsCanceled || 0) + 1;
  await safeSet({ [KEYS.totals]: totals });
  await bumpDailyCounter('cooldownsCanceled', 1);
}

/* =========================
   Unlock + relock
========================= */

export async function unlockEngagementTemporarily() {
  const until = Date.now() + UNLOCK_WINDOW_MS;
  await safeSet({ [KEYS.unlockedUntil]: until, [KEYS.cooldownUntil]: 0 });

  const selectorQuery = selectors.length ? selectors.join(',') : '';
  if (selectorQuery) {
    document.querySelectorAll(selectorQuery).forEach(el =>
      el.classList.add('xc-unlocked')
    );
  }

  setTimeout(() => {
    document.querySelectorAll('.xc-unlocked').forEach(el =>
      el.classList.remove('xc-unlocked')
    );
  }, UNLOCK_WINDOW_MS + 100);
}

/**
 * Relocks engagement UI state only.
 * This function must never call storage.
 */
export function relockEngagement() {
  document.querySelectorAll('.xc-unlocked').forEach(el =>
    el.classList.remove('xc-unlocked')
  );
}

export {
  COOLDOWN_LADDER_SECONDS,
  ESCALATION_RESET_WINDOW_MS,
  UNLOCK_WINDOW_MS
};
