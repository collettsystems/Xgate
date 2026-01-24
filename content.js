/**
 * X Cooldown Engagement — GOLD (fixed)
 * -----------------------------------
 * - React-safe click interception
 * - Reflection + confirmation
 * - Cancelable pending cooldown
 * - Escalation on committed cooldowns only
 * - Single-use unlock window
 * - Persistent stats + reflections
 * - Defensive against SPA context teardown
 *
 * Fixes applied:
 *  1) Removed relockEngagement() call from startCooldown() (pending cooldown must not touch storage)
 *  2) relockEngagement() no longer writes to chrome.storage (avoids SPA/context exceptions + state violation)
 *  3) Pending cooldown interval hardened so countdown cannot stall on async/exception
 */

/* =========================
   State
========================= */

let pendingCooldown = null;
let pendingActionElement = null;
const extensionApi = globalThis.extensionApi;
const fallbackApi = globalThis.chrome ?? globalThis.browser;
const storage = extensionApi?.storageLocal ?? fallbackApi?.storage?.local;
const runtimeId = extensionApi?.runtimeId ?? fallbackApi?.runtime?.id;
const bypassClicks = new WeakSet();

/* =========================
   Config
========================= */

const COOLDOWN_LADDER_SECONDS = [60, 300, 900, 1800];
const ESCALATION_RESET_WINDOW_MS = 30 * 60 * 1000;
const UNLOCK_WINDOW_MS = 15 * 1000;
const MIN_REFLECTION_CHARS = 12;

const SELECTORS = [
  '[data-testid="like"]',
  '[data-testid="unlike"]',
  '[data-testid="retweet"]',
  '[data-testid="unretweet"]',
  //'[data-testid="reply"]',
  '[data-testid="bookmark"]',
  '[data-testid="removeBookmark"]',
  '[data-testid="SideNav_NewTweet_Button"]',
  '[data-testid="tweetButtonInline"]',
  '[data-testid="tweetButton"]'
];

/* =========================
   Storage helpers
========================= */

const getLocal = (keys) =>
  new Promise(resolve => (storage?.get ? storage.get(keys, resolve) : resolve({})));

const setLocal = (obj) =>
  new Promise(resolve => (storage?.set ? storage.set(obj, resolve) : resolve()));

// Defensive wrappers (critical on X.com SPA)
function safeGetLocal(keys) {
  try {
    if (!runtimeId) return Promise.resolve({});
    return getLocal(keys);
  } catch {
    return Promise.resolve({});
  }
}

function safeSetLocal(obj) {
  try {
    if (!runtimeId) return Promise.resolve();
    return setLocal(obj);
  } catch {
    return Promise.resolve();
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function bumpDailyCounter(field, inc = 1) {
  const key = todayKey();
  const { statsByDay = {} } = await safeGetLocal(['statsByDay']);
  statsByDay[key] = statsByDay[key] || {};
  statsByDay[key][field] = (statsByDay[key][field] || 0) + inc;
  await safeSetLocal({ statsByDay });
}

async function appendReflection(entry) {
  const { reflections = [] } = await safeGetLocal(['reflections']);
  reflections.unshift(entry);
  reflections.splice(50);
  await safeSetLocal({ reflections });
}

/* =========================
   Overlay helpers
========================= */

function ensureOverlay(id, html) {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'xc-overlay';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

/* =========================
   Cooldown overlays
========================= */

function showCooldownOverlay(cooldownUntil) {
  const overlay = ensureOverlay(
    'xc-cooldown-overlay',
    `
      <div class="xc-modal">
        <h2>Cooldown active</h2>
        <p>You can engage in <strong><span id="xc-remain"></span></strong></p>
        <div class="xc-row">
          <button class="xc-btn xc-btn-secondary" id="xc-close">Close</button>
        </div>
      </div>
    `
  );

  overlay.querySelector('#xc-close').onclick = () => overlay.remove();

  const tick = () => {
    const s = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const remain = overlay.querySelector('#xc-remain');
    if (remain) remain.textContent = `${s}s`;
    if (s <= 0) {
      overlay.remove();
      unlockEngagementTemporarily();
      return false;
    }
    return true;
  };

  tick();
  const i = setInterval(() => {
    try {
      if (!document.body.contains(overlay)) {
        clearInterval(i);
        return;
      }
      if (!tick()) clearInterval(i);
    } catch {
      clearInterval(i);
    }
  }, 500);
}

function showPendingCooldownOverlay(pending) {
  const overlay = ensureOverlay(
    'xc-cooldown-overlay',
    `
      <div class="xc-modal">
        <h2>Cooldown started</h2>
        <p>If you wait this out, engagement will unlock.</p>
        <p><strong><span id="xc-remain"></span></strong></p>
        <div class="xc-row">
          <button class="xc-btn xc-btn-secondary" id="xc-cancel">Never mind</button>
        </div>
      </div>
    `
  );

  overlay.querySelector('#xc-cancel').onclick = async () => {
    pendingCooldown = null;
    overlay.remove();
    relockEngagement(); // UI only

    const { totals = {} } = await safeGetLocal(['totals']);
    totals.cooldownsCanceled = (totals.cooldownsCanceled || 0) + 1;
    await safeSetLocal({ totals });
    await bumpDailyCounter('cooldownsCanceled', 1);
  };

  const tick = async () => {
    if (!pendingCooldown) return false;

    const s = Math.max(0, Math.ceil((pending.cooldownUntil - Date.now()) / 1000));
    const remain = overlay.querySelector('#xc-remain');
    if (remain) remain.textContent = `${s}s`;

    if (s <= 0) {
      overlay.remove();
      await commitPendingCooldown();
      return false;
    }
    return true;
  };

  // Run once immediately
  tick().catch(() => {});

  // Hardened interval: cannot silently stall
  const i = setInterval(async () => {
    try {
      if (!document.body.contains(overlay)) {
        clearInterval(i);
        return;
      }
      const keep = await tick();
      if (!keep) clearInterval(i);
    } catch {
      clearInterval(i);
    }
  }, 500);
}

/* =========================
   Confirmation
========================= */

function showConfirmOverlay({ actionLabel, onConfirm, onCancel }) {
  const overlay = ensureOverlay(
    'xc-confirm-overlay',
    `
      <div class="xc-modal">
        <h2>Are you sure?</h2>
        <p>You’re about to <strong>${escapeHtml(actionLabel)}</strong>.</p>
        <textarea id="xc-reflect" class="xc-textarea" rows="3"></textarea>
        <div class="xc-row">
          <button class="xc-btn xc-btn-secondary" id="xc-cancel">Cancel</button>
          <button class="xc-btn xc-btn-primary" id="xc-ok" disabled>Proceed</button>
        </div>
      </div>
    `
  );

  const ta = overlay.querySelector('#xc-reflect');
  const ok = overlay.querySelector('#xc-ok');

  ta.oninput = () => {
    ok.disabled = ta.value.trim().length < MIN_REFLECTION_CHARS;
  };

  overlay.querySelector('#xc-cancel').onclick = () => {
    overlay.remove();
    onCancel?.();
  };

  ok.onclick = () => {
    overlay.remove();
    onConfirm(ta.value.trim());
  };

  setTimeout(() => ta.focus(), 0);
}

/* =========================
   Escalation
========================= */

async function computeNextCooldownPreview() {
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

async function startCooldown(reflection, actionType) {
  // FIX: Do NOT relock or touch storage here; pending cooldown is in-memory only.
  const { ms, nextCount, now } = await computeNextCooldownPreview();

  pendingCooldown = {
    cooldownUntil: now + ms,
    cooldownMs: ms,
    reflection,
    actionType,
    startedAt: now,
    nextCount
  };

  showPendingCooldownOverlay(pendingCooldown);
}

async function commitPendingCooldown() {
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
  triggerNativeClick(pendingActionElement);
  }

  pendingActionElement = null;
}

/* =========================
   Unlock + relock
========================= */

function triggerNativeClick(el) {
  bypassClicks.add(el);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function unlockEngagementTemporarily() {
  const until = Date.now() + UNLOCK_WINDOW_MS;
  await safeSetLocal({ unlockedUntil: until, cooldownUntil: 0 });

  document.querySelectorAll(SELECTORS.join(',')).forEach(el =>
    el.classList.add('xc-unlocked')
  );

  setTimeout(() => {
    document.querySelectorAll('.xc-unlocked').forEach(el =>
      el.classList.remove('xc-unlocked')
    );
  }, UNLOCK_WINDOW_MS + 100);
}

function relockEngagement() {
  // FIX: UI only — do not write to storage here (avoids SPA/context exceptions + state violation).
  document.querySelectorAll('.xc-unlocked').forEach(el =>
    el.classList.remove('xc-unlocked')
  );
}

/* =========================
   Click gating
========================= */

function classifyAction(el) {
  const t = el.getAttribute('data-testid') || '';
  if (t.includes('like')) return 'like';
  if (t.includes('retweet')) return 'repost';
  if (t.includes('reply')) return 'reply';
  if (t.includes('bookmark')) return 'bookmark';
  if (t.includes('tweet')) return 'post';
  return 'engage';
}

async function onEngagementAttempt(el) {
  try {
    const actionType = classifyAction(el);

    {
      const { totals = {} } = await safeGetLocal(['totals']);
      totals.attempts = (totals.attempts || 0) + 1;
      await safeSetLocal({ totals });
      await bumpDailyCounter('attempts', 1);
    }

    const { cooldownUntil = 0, unlockedUntil = 0 } =
      await safeGetLocal(['cooldownUntil', 'unlockedUntil']);

    const now = Date.now();

    if (unlockedUntil && now < unlockedUntil) {
      await safeSetLocal({ unlockedUntil: 0 });

      const { totals = {} } = await safeGetLocal(['totals']);
      totals.engagementsAllowed = (totals.engagementsAllowed || 0) + 1;
      await safeSetLocal({ totals });
      await bumpDailyCounter('engagementsAllowed', 1);

      triggerNativeClick(el);
      return;
    }

    if (cooldownUntil && now < cooldownUntil) {
      showCooldownOverlay(cooldownUntil);

      // Optional stats for "blocked during cooldown"
      const { totals = {} } = await safeGetLocal(['totals']);
      totals.blockedDuringCooldown = (totals.blockedDuringCooldown || 0) + 1;
      await safeSetLocal({ totals });
      await bumpDailyCounter('blockedDuringCooldown', 1);

      return;
    }

    showConfirmOverlay({
      actionLabel: actionType,
      onConfirm: async (reflection) => {
        pendingActionElement = el;
        await startCooldown(reflection, actionType);
      },
      onCancel: async () => {
        const { totals = {} } = await safeGetLocal(['totals']);
        totals.canceled = (totals.canceled || 0) + 1;
        await safeSetLocal({ totals });
        await bumpDailyCounter('canceled', 1);
      }
    });
  } catch {
    // Context invalidated — fail open
  }
}

function bindGate(el) {
  if (el.dataset.xcBound) return;
  el.dataset.xcBound = 'true';
  el.classList.add('xc-gated');

  el.addEventListener(
    'click',
    (e) => {
      if (bypassClicks.has(el)) {
        bypassClicks.delete(el);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onEngagementAttempt(el);
    },
    true
  );
}

function applyGates() {
  document.querySelectorAll(SELECTORS.join(',')).forEach(bindGate);
}

/* =========================
   Startup
========================= */

async function resumeIfNeeded() {
  const { cooldownUntil = 0 } = await safeGetLocal(['cooldownUntil']);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    showCooldownOverlay(cooldownUntil);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

applyGates();
resumeIfNeeded();
new MutationObserver(applyGates).observe(document.body, { childList: true, subtree: true });
