import { safeGetLocal, safeSetLocal } from './storage.js';
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
    await safeGetLocal(['escalationCount', 'lastAttemptAt']);

  const reset = !lastAttemptAt || (now - lastAttemptAt) > ESCALATION_RESET_WINDOW_MS;
  const nextCount = reset ? 1 : escalationCount + 1;
  const idx = Math.min(nextCount - 1, COOLDOWN_LADDER_SECONDS.length - 1);

  return {
    ms: COOLDOWN_LADDER_SECONDS[idx] * 1000,
    nextCount,
    now
  };
}

export async function startCooldown({ reflection, actionType, actionElement }) {
  // FIX: Do NOT relock or touch storage here; pending cooldown is in-memory only.
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
    onComplete: commitPendingCooldown
  });
}

export async function commitPendingCooldown() {
  if (!pendingCooldown) return;

  const { cooldownUntil, cooldownMs, reflection, actionType, startedAt, nextCount } = pendingCooldown;
  pendingCooldown = null;

  await safeSetLocal({
    cooldownUntil,
    unlockedUntil: 0,
    escalationCount: nextCount,
    lastAttemptAt: startedAt,
    lastCooldownSeconds: Math.round(cooldownMs / 1000)
  });

  const { totals = {} } = await safeGetLocal(['totals']);
  totals.cooldownsCommitted = (totals.cooldownsCommitted || 0) + 1;
  totals.confirmed = (totals.confirmed || 0) + 1;
  totals.lastCooldownAt = startedAt;
  await safeSetLocal({ totals });

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

  const { totals = {} } = await safeGetLocal(['totals']);
  totals.cooldownsCanceled = (totals.cooldownsCanceled || 0) + 1;
  await safeSetLocal({ totals });
  await bumpDailyCounter('cooldownsCanceled', 1);
}

/* =========================
   Unlock + relock
========================= */

export async function unlockEngagementTemporarily() {
  const until = Date.now() + UNLOCK_WINDOW_MS;
  await safeSetLocal({ unlockedUntil: until, cooldownUntil: 0 });

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

export function relockEngagement() {
  // FIX: UI only — do not write to storage here (avoids SPA/context exceptions + state violation).
  document.querySelectorAll('.xc-unlocked').forEach(el =>
    el.classList.remove('xc-unlocked')
  );
}

export {
  COOLDOWN_LADDER_SECONDS,
  ESCALATION_RESET_WINDOW_MS,
  UNLOCK_WINDOW_MS
};
