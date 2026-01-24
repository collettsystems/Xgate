const MIN_REFLECTION_CHARS = 12;

export function ensureOverlay(id) {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'xc-overlay';
  document.body.appendChild(el);
  return el;
}

export function renderCooldownOverlay({ cooldownUntil, onClose, onUnlock }) {
  const modal = document.createElement('div');
  modal.className = 'xc-modal';

  const title = document.createElement('h2');
  title.textContent = 'Cooldown active';

  const message = document.createElement('p');
  const remainStrong = document.createElement('strong');
  const remain = document.createElement('span');
  remain.id = 'xc-remain';
  const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  remain.textContent = `${seconds}s`;
  remainStrong.appendChild(remain);
  message.append('You can engage in ', remainStrong);

  const row = document.createElement('div');
  row.className = 'xc-row';

  const closeButton = document.createElement('button');
  closeButton.className = 'xc-btn xc-btn-secondary';
  closeButton.id = 'xc-close';
  closeButton.textContent = 'Close';

  const handleClose = () => {
    onClose?.();
  };

  closeButton.addEventListener('click', handleClose);

  row.appendChild(closeButton);
  modal.append(title, message, row);

  return {
    root: modal,
    cleanup: () => {
      closeButton.removeEventListener('click', handleClose);
    }
  };
}

export function showCooldownOverlay(cooldownUntil, { onComplete, onUnlock, onClose } = {}) {
  const overlay = ensureOverlay('xc-cooldown-overlay');
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
    const s = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const remain = overlay.querySelector('#xc-remain');
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

export function renderPendingCooldownOverlay({ pending, onCancel, onCommitted }) {
  const modal = document.createElement('div');
  modal.className = 'xc-modal';

  const title = document.createElement('h2');
  title.textContent = 'Cooldown started';

  const message = document.createElement('p');
  message.textContent = 'If you wait this out, engagement will unlock.';

  const remaining = document.createElement('p');
  const remainStrong = document.createElement('strong');
  const remain = document.createElement('span');
  remain.id = 'xc-remain';
  const seconds = Math.max(0, Math.ceil((pending.cooldownUntil - Date.now()) / 1000));
  remain.textContent = `${seconds}s`;
  remainStrong.appendChild(remain);
  remaining.appendChild(remainStrong);

  const row = document.createElement('div');
  row.className = 'xc-row';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'xc-btn xc-btn-secondary';
  cancelButton.id = 'xc-cancel';
  cancelButton.textContent = 'Never mind';

  const handleCancel = () => {
    onCancel?.();
  };

  cancelButton.addEventListener('click', handleCancel);

  row.appendChild(cancelButton);
  modal.append(title, message, remaining, row);

  return {
    root: modal,
    cleanup: () => {
      cancelButton.removeEventListener('click', handleCancel);
    }
  };
}

export function showPendingCooldownOverlay({
  pending,
  isPendingActive,
  onCancel,
  onComplete,
  onCommitted
}) {
  const overlay = ensureOverlay('xc-cooldown-overlay');
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

    const s = Math.max(0, Math.ceil((pending.cooldownUntil - Date.now()) / 1000));
    const remain = overlay.querySelector('#xc-remain');
    if (remain) remain.textContent = `${s}s`;

    if (s <= 0) {
      await handleCommitted();
      return false;
    }
    return true;
  };

  // Run once immediately
  tick().catch(() => {});

  // Hardened interval: cannot silently stall
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

export function renderConfirmOverlay({ actionLabel, onConfirm, onCancel, minChars }) {
  const modal = document.createElement('div');
  modal.className = 'xc-modal';

  const title = document.createElement('h2');
  title.textContent = 'Are you sure?';

  const message = document.createElement('p');
  const action = document.createElement('strong');
  action.textContent = actionLabel;
  message.append('You’re about to ', action, '.');

  const textarea = document.createElement('textarea');
  textarea.id = 'xc-reflect';
  textarea.className = 'xc-textarea';
  textarea.rows = 3;

  const row = document.createElement('div');
  row.className = 'xc-row';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'xc-btn xc-btn-secondary';
  cancelButton.id = 'xc-cancel';
  cancelButton.textContent = 'Cancel';

  const okButton = document.createElement('button');
  okButton.className = 'xc-btn xc-btn-primary';
  okButton.id = 'xc-ok';
  okButton.textContent = 'Proceed';
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

  textarea.addEventListener('input', handleInput);
  cancelButton.addEventListener('click', handleCancel);
  okButton.addEventListener('click', handleConfirm);

  row.append(cancelButton, okButton);
  modal.append(title, message, textarea, row);

  return {
    root: modal,
    cleanup: () => {
      textarea.removeEventListener('input', handleInput);
      cancelButton.removeEventListener('click', handleCancel);
      okButton.removeEventListener('click', handleConfirm);
    }
  };
}

export function showConfirmOverlay({ actionLabel, onConfirm, onCancel, minChars }) {
  const overlay = ensureOverlay('xc-confirm-overlay');
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

  const ta = overlay.querySelector('#xc-reflect');
  setTimeout(() => ta?.focus(), 0);
}
