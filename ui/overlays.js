const MIN_REFLECTION_CHARS = 12;

export function ensureOverlay(id, html) {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'xc-overlay';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

export function showCooldownOverlay(cooldownUntil, { onComplete } = {}) {
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
      onComplete?.();
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

export function showPendingCooldownOverlay({ pending, isPendingActive, onCancel, onComplete }) {
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
    overlay.remove();
    await onCancel?.();
  };

  const tick = async () => {
    if (!isPendingActive()) return false;

    const s = Math.max(0, Math.ceil((pending.cooldownUntil - Date.now()) / 1000));
    const remain = overlay.querySelector('#xc-remain');
    if (remain) remain.textContent = `${s}s`;

    if (s <= 0) {
      overlay.remove();
      await onComplete?.();
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

export function showConfirmOverlay({ actionLabel, onConfirm, onCancel }) {
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

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
