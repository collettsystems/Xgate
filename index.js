import './extensionApi.js';
import { KEYS, safeGet } from './state/storage.js';
import { showCooldownOverlay } from './ui/overlays.js';
import { applyGates, SELECTORS, triggerNativeClick } from './dom/gating.js';
import { setCooldownDependencies, unlockEngagementTemporarily } from './state/cooldownEngine.js';

setCooldownDependencies({ triggerNativeClick, selectors: SELECTORS });

async function resumeIfNeeded() {
  const { cooldownUntil = 0 } = await safeGet([KEYS.cooldownUntil]);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    showCooldownOverlay(cooldownUntil, { onComplete: unlockEngagementTemporarily });
  }
}

applyGates();
resumeIfNeeded();
new MutationObserver(applyGates).observe(document.body, { childList: true, subtree: true });
