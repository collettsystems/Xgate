import { KEYS, safeGet, safeSet } from '../state/storage.js';
import { bumpDailyCounter } from '../state/stats.js';
import { showConfirmOverlay, showCooldownOverlay } from '../ui/overlays.js';
import { startCooldown, unlockEngagementTemporarily } from '../state/cooldownEngine.js';

export const SELECTORS = [
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

const bypassClicks = new WeakSet();

export function classifyAction(el) {
  const t = el.getAttribute('data-testid') || '';
  if (t.includes('like')) return 'like';
  if (t.includes('retweet')) return 'repost';
  if (t.includes('reply')) return 'reply';
  if (t.includes('bookmark')) return 'bookmark';
  if (t.includes('tweet')) return 'post';
  return 'engage';
}

export function triggerNativeClick(el) {
  bypassClicks.add(el);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

export async function onEngagementAttempt(el) {
  try {
    const actionType = classifyAction(el);

    {
      const { totals = {} } = await safeGet([KEYS.totals]);
      totals.attempts = (totals.attempts || 0) + 1;
      await safeSet({ [KEYS.totals]: totals });
      await bumpDailyCounter('attempts', 1);
    }

    const { cooldownUntil = 0, unlockedUntil = 0 } =
      await safeGet([KEYS.cooldownUntil, KEYS.unlockedUntil]);

    const now = Date.now();

    if (unlockedUntil && now < unlockedUntil) {
      await safeSet({ [KEYS.unlockedUntil]: 0 });

      const { totals = {} } = await safeGet([KEYS.totals]);
      totals.engagementsAllowed = (totals.engagementsAllowed || 0) + 1;
      await safeSet({ [KEYS.totals]: totals });
      await bumpDailyCounter('engagementsAllowed', 1);

      triggerNativeClick(el);
      return;
    }

    if (cooldownUntil && now < cooldownUntil) {
      showCooldownOverlay(cooldownUntil, { onComplete: unlockEngagementTemporarily });

      // Optional stats for "blocked during cooldown"
      const { totals = {} } = await safeGet([KEYS.totals]);
      totals.blockedDuringCooldown = (totals.blockedDuringCooldown || 0) + 1;
      await safeSet({ [KEYS.totals]: totals });
      await bumpDailyCounter('blockedDuringCooldown', 1);

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
        await bumpDailyCounter('canceled', 1);
      }
    });
  } catch {
    // Context invalidated — fail open
  }
}

export function bindGate(el) {
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

export function applyGates() {
  document.querySelectorAll(SELECTORS.join(',')).forEach(bindGate);
}
