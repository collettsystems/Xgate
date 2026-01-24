# Xgate

**Xgate** is a Microsoft Edge (Chromium) browser extension that allows normal viewing and navigation on X (formerly Twitter) while adding intentional friction to engagement actions such as likes, replies, reposts, bookmarks, and posts.

Instead of blocking interaction outright, the extension introduces reflection prompts, timed cooldowns, and escalating delays to reduce impulsive engagement while preserving user autonomy.

---

## Features

### Engagement Gating (Not Blocking)
- Viewing, scrolling, and reading X content is unaffected
- Engagement actions are intercepted before execution
- No changes to X’s servers or APIs (pure client-side behavior)

### Reflection Prompt
- Engagement attempts trigger an **“Are you sure?”** dialog
- Users must enter a short reflection before proceeding
- Minimum reflection length enforced

### Timed Cooldowns
- After confirmation, a countdown must be completed
- Cooldowns unlock engagement temporarily (single-use window)
- Closing the cooldown dialog (“Never mind”) cancels the attempt with no penalty

### Escalating Cooldown Ladder
- Repeated engagement attempts increase cooldown duration
- Escalation resets after a configurable quiet period
- Designed to discourage rapid, repeated interactions

### Persistent State
- Cooldowns, escalation state, and stats persist across:
  - Page reloads
  - Tab changes
  - Browser restarts

### Local Stats Dashboard
- Built-in extension popup dashboard
- Tracks:
  - Engagement attempts
  - Confirmed vs canceled cooldowns
  - Allowed engagements
  - Daily activity
  - Recent reflection entries
- All data stored locally using `chrome.storage.local`

---

## Design Principles

- **Friction over prohibition**  
  The goal is to slow engagement, not prevent it.

- **User agency**  
  Users can always cancel without penalty before a cooldown commits.

- **Local-first & private**  
  No telemetry, no remote servers, no data collection.

- **Resilient to UI changes**  
  Uses DOM observation and event interception to adapt to X’s dynamic interface.

---

## How It Works

1. User attempts an engagement action
2. The action is intercepted before X processes it
3. A confirmation dialog with a reflection prompt appears
4. If confirmed:
   - A **pending cooldown** countdown begins
   - Canceling during the countdown aborts the attempt
5. If the countdown completes:
   - The cooldown is committed
   - Engagement unlocks briefly
6. After one action (or timeout), engagement is gated again

---

## Installation

### Chrome (Chromium)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project directory

### Firefox

#### Temporary load (development)

1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `manifest.json` from the project directory

#### Signed builds (AMO)

1. Add a `browser_specific_settings.gecko.id` value in `manifest.json` (required for signing)
2. Zip the extension directory
3. Submit the zip to AMO for signing, then install the signed build

**Firefox constraints**
- Requires Firefox 109+ for Manifest V3 support (implementation is still evolving)
- Signed builds must include a `gecko` ID in `browser_specific_settings`

The extension activates automatically on:
- `https://x.com/*`
- `https://twitter.com/*`

---

## Project Structure

```
.
├── manifest.json        Extension manifest (MV3)
├── content.js           Bundled content script (generated)
├── index.js             Content script entry (source)
├── extensionApi.js      Browser API wrapper
├── dom/                 DOM gating logic
├── state/               Storage + cooldown state
├── ui/                  Overlay + prompt UI
├── styles.css           In-page overlay and gating styles
├── dashboard.html       Extension popup UI
├── dashboard.js         Dashboard logic and rendering
├── dashboard.css        Dashboard styles
└── README.md
```

---

## Configuration

Key behavior can be adjusted in `state/cooldownEngine.js` and `ui/overlays.js`:

- Cooldown ladder durations
- Escalation reset window
- Unlock window length
- Minimum reflection length

These values are defined as constants near the top of the file.

---

## Building the bundled content script

Edge content script tests load the bundled `content.js`. After modifying any source modules
(`index.js`, `extensionApi.js`, or files under `dom/`, `state/`, `ui/`), regenerate the bundle:

```bash
npx esbuild index.js --bundle --format=iife --platform=browser --outfile=content.js
```

---

## Known Limitations

- Relies on X’s current DOM structure (`data-testid` attributes)
- UI changes on X may require selector updates
- Not designed to be stealthy or tamper-resistant
- Currently tested on Microsoft Edge (Chromium)

---

## Non-Goals

- Content moderation
- Blocking or censoring content
- Cloud synchronization
- Analytics or behavioral tracking
- Productivity scoring or quotas

---

## Security & Privacy

- No network requests
- No external dependencies
- All data stored locally in the browser
- No personally identifiable information is collected

---

## Contributing

Contributions are welcome, particularly for:
- Selector robustness
- Accessibility improvements
- Automated testing
- Firefox compatibility

Please keep changes aligned with the project’s **friction-not-force** philosophy.

---

## License

MIT License
