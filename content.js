(() => {
  // extensionApi.js
  var api = globalThis.chrome ?? globalThis.browser;
  globalThis.extensionApi = {
    api,
    storageLocal: api?.storage?.local,
    runtimeId: api?.runtime?.id
  };

  // state/storage.js
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
  var KEYS = {
    cooldownUntil: "cooldownUntil",
    unlockedUntil: "unlockedUntil",
    escalationCount: "escalationCount",
    lastAttemptAt: "lastAttemptAt",
    lastCooldownSeconds: "lastCooldownSeconds",
    totals: "totals",
    statsByDay: "statsByDay",
    reflections: "reflections"
  };
  var loadState = (keys) => new Promise((resolve) => {
    const storage = getStorage();
    return storage?.get ? storage.get(keys, resolve) : resolve({});
  });
  var saveState = (obj) => new Promise((resolve) => {
    const storage = getStorage();
    return storage?.set ? storage.set(obj, resolve) : resolve();
  });
  function safeGet(keys) {
    try {
      if (!getRuntimeId()) return Promise.resolve({});
      return loadState(keys);
    } catch {
      return Promise.resolve({});
    }
  }
  function safeSet(obj) {
    try {
      if (!getRuntimeId()) return Promise.resolve();
      return saveState(obj);
    } catch {
      return Promise.resolve();
    }
  }

  // ui/overlays.js
  var MIN_REFLECTION_CHARS = 12;
  function ensureOverlay(id) {
    document.getElementById(id)?.remove();
    const el = document.createElement("div");
    el.id = id;
    el.className = "xc-overlay";
    document.body.appendChild(el);
    return el;
  }
  function renderCooldownOverlay({ cooldownUntil, onClose, onUnlock }) {
    const modal = document.createElement("div");
    modal.className = "xc-modal";
    const title = document.createElement("h2");
    title.textContent = "Cooldown active";
    const message = document.createElement("p");
    const remainStrong = document.createElement("strong");
    const remain = document.createElement("span");
    remain.id = "xc-remain";
    const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1e3));
    remain.textContent = `${seconds}s`;
    remainStrong.appendChild(remain);
    message.append("You can engage in ", remainStrong);
    const row = document.createElement("div");
    row.className = "xc-row";
    const closeButton = document.createElement("button");
    closeButton.className = "xc-btn xc-btn-secondary";
    closeButton.id = "xc-close";
    closeButton.textContent = "Close";
    const handleClose = () => {
      onClose?.();
    };
    closeButton.addEventListener("click", handleClose);
    row.appendChild(closeButton);
    modal.append(title, message, row);
    return {
      root: modal,
      cleanup: () => {
        closeButton.removeEventListener("click", handleClose);
      }
    };
  }
  function showCooldownOverlay(cooldownUntil, { onComplete, onUnlock, onClose } = {}) {
    const overlay = ensureOverlay("xc-cooldown-overlay");
    let intervalId;
    const removeOverlay = () => {
      if (intervalId) clearInterval(intervalId);
      cleanup?.();
      overlay.remove();
    };
    const handleUnlock = () => {
      onUnlock?.();
      onComplete?.();
    };
    const handleClose = () => {
      removeOverlay();
      onClose?.();
    };
    const { root, cleanup } = renderCooldownOverlay({
      cooldownUntil,
      onClose: handleClose,
      onUnlock: handleUnlock
    });
    overlay.appendChild(root);
    const tick = () => {
      const s = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1e3));
      const remain = overlay.querySelector("#xc-remain");
      if (remain) remain.textContent = `${s}s`;
      if (s <= 0) {
        removeOverlay();
        handleUnlock();
        return false;
      }
      return true;
    };
    tick();
    intervalId = setInterval(() => {
      try {
        if (!document.body.contains(overlay)) {
          clearInterval(intervalId);
          return;
        }
        if (!tick()) clearInterval(intervalId);
      } catch {
        clearInterval(intervalId);
      }
    }, 500);
  }
  function renderPendingCooldownOverlay({ pending, onCancel, onCommitted }) {
    const modal = document.createElement("div");
    modal.className = "xc-modal";
    const title = document.createElement("h2");
    title.textContent = "Cooldown started";
    const message = document.createElement("p");
    message.textContent = "If you wait this out, engagement will unlock.";
    const remaining = document.createElement("p");
    const remainStrong = document.createElement("strong");
    const remain = document.createElement("span");
    remain.id = "xc-remain";
    const seconds = Math.max(0, Math.ceil((pending.cooldownUntil - Date.now()) / 1e3));
    remain.textContent = `${seconds}s`;
    remainStrong.appendChild(remain);
    remaining.appendChild(remainStrong);
    const row = document.createElement("div");
    row.className = "xc-row";
    const cancelButton = document.createElement("button");
    cancelButton.className = "xc-btn xc-btn-secondary";
    cancelButton.id = "xc-cancel";
    cancelButton.textContent = "Never mind";
    const handleCancel = () => {
      onCancel?.();
    };
    cancelButton.addEventListener("click", handleCancel);
    row.appendChild(cancelButton);
    modal.append(title, message, remaining, row);
    return {
      root: modal,
      cleanup: () => {
        cancelButton.removeEventListener("click", handleCancel);
      }
    };
  }
  function showPendingCooldownOverlay({
    pending,
    isPendingActive,
    onCancel,
    onComplete,
    onCommitted
  }) {
    const overlay = ensureOverlay("xc-cooldown-overlay");
    let intervalId;
    const handleCancel = async () => {
      if (intervalId) clearInterval(intervalId);
      cleanup?.();
      overlay.remove();
      await onCancel?.();
    };
    const handleCommitted = async () => {
      if (intervalId) clearInterval(intervalId);
      cleanup?.();
      overlay.remove();
      await onCommitted?.();
      await onComplete?.();
    };
    const { root, cleanup } = renderPendingCooldownOverlay({
      pending,
      onCancel: handleCancel,
      onCommitted: handleCommitted
    });
    overlay.appendChild(root);
    const tick = async () => {
      if (!isPendingActive()) return false;
      const s = Math.max(0, Math.ceil((pending.cooldownUntil - Date.now()) / 1e3));
      const remain = overlay.querySelector("#xc-remain");
      if (remain) remain.textContent = `${s}s`;
      if (s <= 0) {
        await handleCommitted();
        return false;
      }
      return true;
    };
    tick().catch(() => {
    });
    intervalId = setInterval(async () => {
      try {
        if (!document.body.contains(overlay)) {
          clearInterval(intervalId);
          return;
        }
        const keep = await tick();
        if (!keep) clearInterval(intervalId);
      } catch {
        clearInterval(intervalId);
      }
    }, 500);
  }
  function renderConfirmOverlay({ actionLabel, onConfirm, onCancel, minChars }) {
    const modal = document.createElement("div");
    modal.className = "xc-modal";
    const title = document.createElement("h2");
    title.textContent = "Are you sure?";
    const message = document.createElement("p");
    const action = document.createElement("strong");
    action.textContent = actionLabel;
    message.append("You\u2019re about to ", action, ".");
    const textarea = document.createElement("textarea");
    textarea.id = "xc-reflect";
    textarea.className = "xc-textarea";
    textarea.rows = 3;
    const row = document.createElement("div");
    row.className = "xc-row";
    const cancelButton = document.createElement("button");
    cancelButton.className = "xc-btn xc-btn-secondary";
    cancelButton.id = "xc-cancel";
    cancelButton.textContent = "Cancel";
    const okButton = document.createElement("button");
    okButton.className = "xc-btn xc-btn-primary";
    okButton.id = "xc-ok";
    okButton.textContent = "Proceed";
    okButton.disabled = true;
    const minRequired = minChars ?? MIN_REFLECTION_CHARS;
    const handleInput = () => {
      okButton.disabled = textarea.value.trim().length < minRequired;
    };
    const handleCancel = () => {
      onCancel?.();
    };
    const handleConfirm = () => {
      onConfirm?.(textarea.value.trim());
    };
    textarea.addEventListener("input", handleInput);
    cancelButton.addEventListener("click", handleCancel);
    okButton.addEventListener("click", handleConfirm);
    row.append(cancelButton, okButton);
    modal.append(title, message, textarea, row);
    return {
      root: modal,
      cleanup: () => {
        textarea.removeEventListener("input", handleInput);
        cancelButton.removeEventListener("click", handleCancel);
        okButton.removeEventListener("click", handleConfirm);
      }
    };
  }
  function showConfirmOverlay({ actionLabel, onConfirm, onCancel, minChars }) {
    const overlay = ensureOverlay("xc-confirm-overlay");
    const { root, cleanup } = renderConfirmOverlay({
      actionLabel,
      onConfirm: (value) => {
        cleanup?.();
        overlay.remove();
        onConfirm?.(value);
      },
      onCancel: () => {
        cleanup?.();
        overlay.remove();
        onCancel?.();
      },
      minChars
    });
    overlay.appendChild(root);
    const ta = overlay.querySelector("#xc-reflect");
    setTimeout(() => ta?.focus(), 0);
  }

  // state/stats.js
  function todayKey() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  async function bumpDailyCounter(field, inc = 1) {
    const key = todayKey();
    const { statsByDay = {} } = await safeGet([KEYS.statsByDay]);
    statsByDay[key] = statsByDay[key] || {};
    statsByDay[key][field] = (statsByDay[key][field] || 0) + inc;
    await safeSet({ [KEYS.statsByDay]: statsByDay });
  }
  async function appendReflection(entry) {
    const { reflections = [] } = await safeGet([KEYS.reflections]);
    reflections.unshift(entry);
    reflections.splice(50);
    await safeSet({ [KEYS.reflections]: reflections });
  }

  // state/cooldownEngine.js
  var pendingCooldown = null;
  var pendingActionElement = null;
  var triggerNativeClick = null;
  var selectors = [];
  var COOLDOWN_LADDER_SECONDS = [60, 300, 900, 1800];
  var ESCALATION_RESET_WINDOW_MS = 30 * 60 * 1e3;
  var UNLOCK_WINDOW_MS = 15 * 1e3;
  function setCooldownDependencies({ triggerNativeClick: trigger, selectors: nextSelectors }) {
    triggerNativeClick = trigger;
    selectors = Array.isArray(nextSelectors) ? nextSelectors : [];
  }
  async function computeNextCooldownPreview() {
    const now = Date.now();
    const { escalationCount = 0, lastAttemptAt = 0 } = await safeGet([KEYS.escalationCount, KEYS.lastAttemptAt]);
    const reset = !lastAttemptAt || now - lastAttemptAt > ESCALATION_RESET_WINDOW_MS;
    const nextCount = reset ? 1 : escalationCount + 1;
    const idx = Math.min(nextCount - 1, COOLDOWN_LADDER_SECONDS.length - 1);
    return {
      ms: COOLDOWN_LADDER_SECONDS[idx] * 1e3,
      nextCount,
      now
    };
  }
  async function startCooldown({ reflection, actionType, actionElement }) {
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
  async function commitPendingCooldown() {
    if (!pendingCooldown) return;
    const { cooldownUntil, cooldownMs, reflection, actionType, startedAt, nextCount } = pendingCooldown;
    pendingCooldown = null;
    await safeSet({
      [KEYS.cooldownUntil]: cooldownUntil,
      [KEYS.unlockedUntil]: 0,
      [KEYS.escalationCount]: nextCount,
      [KEYS.lastAttemptAt]: startedAt,
      [KEYS.lastCooldownSeconds]: Math.round(cooldownMs / 1e3)
    });
    const { totals = {} } = await safeGet([KEYS.totals]);
    totals.cooldownsCommitted = (totals.cooldownsCommitted || 0) + 1;
    totals.confirmed = (totals.confirmed || 0) + 1;
    totals.lastCooldownAt = startedAt;
    await safeSet({ [KEYS.totals]: totals });
    await bumpDailyCounter("cooldownsCommitted", 1);
    await bumpDailyCounter("confirmed", 1);
    await appendReflection({
      ts: startedAt,
      actionType,
      reflection,
      cooldownSeconds: Math.round(cooldownMs / 1e3)
    });
    unlockEngagementTemporarily();
    if (pendingActionElement && document.contains(pendingActionElement)) {
      triggerNativeClick?.(pendingActionElement);
    }
    pendingActionElement = null;
  }
  async function handlePendingCancel() {
    pendingCooldown = null;
    relockEngagement();
    const { totals = {} } = await safeGet([KEYS.totals]);
    totals.cooldownsCanceled = (totals.cooldownsCanceled || 0) + 1;
    await safeSet({ [KEYS.totals]: totals });
    await bumpDailyCounter("cooldownsCanceled", 1);
  }
  async function unlockEngagementTemporarily() {
    const until = Date.now() + UNLOCK_WINDOW_MS;
    await safeSet({ [KEYS.unlockedUntil]: until, [KEYS.cooldownUntil]: 0 });
    const selectorQuery = selectors.length ? selectors.join(",") : "";
    if (selectorQuery) {
      document.querySelectorAll(selectorQuery).forEach(
        (el) => el.classList.add("xc-unlocked")
      );
    }
    setTimeout(() => {
      document.querySelectorAll(".xc-unlocked").forEach(
        (el) => el.classList.remove("xc-unlocked")
      );
    }, UNLOCK_WINDOW_MS + 100);
  }
  function relockEngagement() {
    document.querySelectorAll(".xc-unlocked").forEach(
      (el) => el.classList.remove("xc-unlocked")
    );
  }

  // dom/gating.js
  var SELECTORS = [
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
  var bypassClicks = /* @__PURE__ */ new WeakSet();
  function classifyAction(el) {
    const t = el.getAttribute("data-testid") || "";
    if (t.includes("like")) return "like";
    if (t.includes("retweet")) return "repost";
    if (t.includes("reply")) return "reply";
    if (t.includes("bookmark")) return "bookmark";
    if (t.includes("tweet")) return "post";
    return "engage";
  }
  function triggerNativeClick2(el) {
    bypassClicks.add(el);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }
  async function onEngagementAttempt(el) {
    try {
      const actionType = classifyAction(el);
      {
        const { totals = {} } = await safeGet([KEYS.totals]);
        totals.attempts = (totals.attempts || 0) + 1;
        await safeSet({ [KEYS.totals]: totals });
        await bumpDailyCounter("attempts", 1);
      }
      const { cooldownUntil = 0, unlockedUntil = 0 } = await safeGet([KEYS.cooldownUntil, KEYS.unlockedUntil]);
      const now = Date.now();
      if (unlockedUntil && now < unlockedUntil) {
        await safeSet({ [KEYS.unlockedUntil]: 0 });
        const { totals = {} } = await safeGet([KEYS.totals]);
        totals.engagementsAllowed = (totals.engagementsAllowed || 0) + 1;
        await safeSet({ [KEYS.totals]: totals });
        await bumpDailyCounter("engagementsAllowed", 1);
        triggerNativeClick2(el);
        return;
      }
      if (cooldownUntil && now < cooldownUntil) {
        showCooldownOverlay(cooldownUntil, { onComplete: unlockEngagementTemporarily });
        const { totals = {} } = await safeGet([KEYS.totals]);
        totals.blockedDuringCooldown = (totals.blockedDuringCooldown || 0) + 1;
        await safeSet({ [KEYS.totals]: totals });
        await bumpDailyCounter("blockedDuringCooldown", 1);
        return;
      }
      showConfirmOverlay({
        actionLabel: actionType,
        onConfirm: async (reflection) => {
          await startCooldown({ reflection, actionType, actionElement: el });
        },
        onCancel: async () => {
          const { totals = {} } = await safeGet([KEYS.totals]);
          totals.canceled = (totals.canceled || 0) + 1;
          await safeSet({ [KEYS.totals]: totals });
          await bumpDailyCounter("canceled", 1);
        }
      });
    } catch {
    }
  }
  function bindGate(el) {
    if (el.dataset.xcBound) return;
    el.dataset.xcBound = "true";
    el.classList.add("xc-gated");
    el.addEventListener(
      "click",
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
    document.querySelectorAll(SELECTORS.join(",")).forEach(bindGate);
  }

  // index.js
  setCooldownDependencies({ triggerNativeClick: triggerNativeClick2, selectors: SELECTORS });
  async function resumeIfNeeded() {
    const { cooldownUntil = 0 } = await safeGet([KEYS.cooldownUntil]);
    if (cooldownUntil && Date.now() < cooldownUntil) {
      showCooldownOverlay(cooldownUntil, { onComplete: unlockEngagementTemporarily });
    }
  }
  applyGates();
  resumeIfNeeded();
  new MutationObserver(applyGates).observe(document.body, { childList: true, subtree: true });
})();
