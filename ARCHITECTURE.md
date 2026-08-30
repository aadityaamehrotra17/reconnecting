# Architecture — "You Are Not Reconnected"

This document is the technical reference for anyone continuing work on the
extension. It covers the current implementation as built, the data model,
the control flow, known edge cases/limitations, and where the natural
extension points are for future work (levels, CAPTCHA gauntlet, etc.).

For the user-facing explanation of what this does and why, see `README.md`.

## Stack

- Chrome Extension, **Manifest V3**
- No build step, no framework, no dependencies — plain HTML/CSS/JS
- Background logic runs in a **service worker** (`background.js`)
- Game UI is a normal extension page (`game/minesweeper.html`) loaded via
  `chrome-extension://` URLs
- State persistence via `chrome.storage.session` (in-memory, cleared on
  browser restart — this is intentional, see "Why session storage" below)

## File structure

```
extension/
├── manifest.json          # MV3 manifest, permissions, entry points
├── background.js          # Service worker: gate logic, interception, connectivity polling
├── popup.html             # Toolbar icon popup — read-only status dashboard
├── popup.js               # Fetches state from background, renders it
└── game/
    ├── minesweeper.html   # The gate game itself
    ├── minesweeper.css
    └── minesweeper.js     # Board generation, win/loss handling, messaging to background
```

## Core concept: two independent notions of "online"

This is the single most important thing to understand about the codebase.
There are **two completely separate signals**, and the extension's entire
premise rests on keeping them decoupled:

1. **Real connectivity** — whether the machine actually has internet.
   Checked two ways in the code:
   - Passively: the service worker's native `online`/`offline` events
     (`self.addEventListener("offline", ...)`), used only as the *trigger*
     to kick off a run.
   - Actively: `checkRealConnectivity()` in `background.js`, which does a
     `fetch` against `https://www.gstatic.com/generate_204` (a standard
     captive-portal-style connectivity check endpoint — cheap, tiny,
     reliable). Used purely for the on-screen "Real connection: ONLINE"
     readout. **This value is never used to make any access decision.**

2. **Gate state** — a boolean (`state.gateOpen`) that is the *only* thing
   that determines whether navigation is allowed. It is set to `true` in
   exactly one place in the code: the `GAME_WON` message handler in
   `background.js`. Nothing else touches it. In particular, **there is no
   listener on the `online` event that opens the gate.** This is by design
   and should stay that way — the moment `online` opens the gate, the bit
   is dead.

Keep this separation explicit in any future changes. If you add new
signals (e.g. "user has been offline for 10 real minutes, auto-open"),
that's a legitimate design decision to make deliberately — just don't let
real connectivity leak into the gate logic by accident (e.g. via a
convenience helper that "just checks if we're online" and gets reused in
the wrong place).

## State model

Everything lives under a single key, `state`, in `chrome.storage.session`:

```js
{
  gateOpen: boolean,       // does navigation get allowed through?
                           // starts false — but online navigation always
                           // bypasses this check entirely
  solvedOnce: boolean,     // has the user EVER won a board this session?
  lives: number,           // lives remaining in current run (starts at 3)
  pendingUrl: {            // tabId -> URL the user was trying to reach
    [tabId: number]: string
  }
}
```

Defined as `DEFAULT_STATE` in `background.js`. Read via `getState()`,
written via `updateState(fn)` (atomic read-modify-write), and
fully reset via `resetRun()`.

### Why session storage, not local storage

`chrome.storage.session` is cleared when the browser restarts. This is
deliberate: it ensures all game state — `gateOpen`, `solvedOnce`, `lives`,
`pendingUrl` — starts fresh each session. If you switch to
`chrome.storage.local` for persistence across restarts, that's a real
behavior change, not a refactor — call it out.

### `pendingUrl` is keyed by tabId, not globally

Each tab that gets swept into the game keeps its own pending destination.
This means:
- Multiple tabs can each be running their own Minesweeper board
  simultaneously, each gating its own original URL independently.
- Winning a board in **any** tab releases **all** gated tabs — the
  `GAME_WON` handler opens the gate globally and redirects every entry in
  `pendingUrl` back to its original URL, then clears the map. This is
  intentional: beating it once frees the entire browser session.

## Control flow

### 1. Going offline → sweeping all tabs into the game

```
self.addEventListener("offline", async () => {
  resetRun()                     // gateOpen=false, lives=3, solvedOnce=false
  query all tabs
  for each tab with an http(s) URL:
    store pendingUrl[tab.id] = tab.url
    chrome.tabs.update(tab.id, { url: GAME_URL })
})
```

Tabs on internal pages (`chrome://`, `chrome-extension://`, etc.) are
skipped via the `/^https?:\/\//` check — you cannot navigate those away
programmatically in most cases anyway, and there's nothing to "protect"
about a settings page.

### 2. Any subsequent navigation attempt while gate is closed

```
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if not top-level frame: return
  if url is our own extension: return
  if url is not http(s): return
  if state.gateOpen: return         // already earned access
  else:
    pendingUrl[details.tabId] = details.url
    redirect tab to GAME_URL
})
```

This catches everything the `offline` sweep might miss — new tabs opened
after the initial sweep, links clicked, address bar entries, etc. — as
long as the gate is still closed.

### 3. Playing the game (`game/minesweeper.js`)

- Standard 9x9 / 10-mine Minesweeper. Flood-fill reveal on zero-adjacency
  cells, standard flagging via right-click.
- Win condition: `revealedCount === ROWS*COLS - MINES` → `handleWin()` →
  posts `{ type: "GAME_WON" }` to the background worker and disables board
  interaction while waiting for the redirect.
- Loss condition: clicking a mine or timing out (45s) → reveals all mines,
  posts `{ type: "GAME_LOST_LIFE" }`, background decrements `lives` and
  returns the new count. If lives > 0, a new board is built after a short delay.
  If lives hit 0, the background service worker deletes the last 24 hours of
  browsing history via `chrome.browsingData.removeHistory({ since })`, the UI
  shows a confirmation popup, and after 2 seconds closes the window.
- The on-screen "Real connection" chip polls
  `{ type: "CHECK_REAL_CONNECTIVITY" }` every 4 seconds and just renders
  the result. Display-only.

### 4. Winning → release

`GAME_WON` handler in `background.js`:
```
setState({ gateOpen: true, solvedOnce: true })
for each entry in pendingUrl:
  chrome.tabs.update(tabId, { url: pendingUrl[tabId] })
clear pendingUrl
```

## Message protocol (game/popup ↔ background)

All messages go through `chrome.runtime.sendMessage` /
`chrome.runtime.onMessage`. Handlers in `background.js` return `true` to
keep the response channel open for async work.

| type                            | sent by      | payload            | response                        |
|----------------------------------|--------------|---------------------|----------------------------------|
| `GET_STATE`                     | game, popup  | —                   | full state object                |
| `CHECK_REAL_CONNECTIVITY`       | game         | —                   | `{ isOnline: boolean }`          |
| `GAME_WON`                      | game         | —                   | `{ ok: true }`, triggers redirect|
| `GAME_LOST_LIFE`                | game         | —                   | `{ livesRemaining: number }`     |
| `CLOSE_WINDOW`                  | game         | —                   | `{ ok: true }`, closes window   |

If you add new message types, add them to this table.

## Manifest / permissions

```json
{
  "permissions": ["webNavigation", "tabs", "storage", "browsingData"],
  "host_permissions": ["<all_urls>"]
}
```

- `webNavigation` — for `onBeforeNavigate`
- `tabs` — for `chrome.tabs.query` / `chrome.tabs.update`
- `storage` — for `chrome.storage.session`
- `browsingData` — for deleting 24 hours of history when 3 lives are lost
- `<all_urls>` host permission — required because interception has to work
  on every site, not a fixed list. This is the permission that makes this
  extension unpublishable as-is, intentionally (see README).

`web_accessible_resources` exposes `game/*` so redirected tabs (which are
arbitrary origins) are allowed to load the extension's game page.

## Known limitations / things to watch

1. **Service worker lifecycle.** MV3 service workers are ephemeral — they
   unload after ~30s of inactivity and wake on events. All persistent
   state must round-trip through `chrome.storage.session` (it does,
   currently). The module-level `_stateQueue` promise chain used by
   `updateState()` is intentionally ephemeral — it only needs to
   serialise concurrent handlers within a single wake cycle; if the
   worker unloads, all pending handlers are gone too.
2. **`offline`/`online` events on service workers** are supported but can
   be inconsistent across OS/network-stack combinations (e.g. some
   captive-portal or VPN transitions don't fire them reliably). The
   `webNavigation` interception is the true backstop; the `offline` sweep
   is a nice-to-have for immediate feedback, not the sole trigger.
3. **Multiple windows**: `chrome.tabs.query({})` queries all tabs across
   all windows, so the offline sweep already covers multi-window setups
   correctly. Verify this stays true if the query gets scoped down later
   for performance reasons.

## Extension points for future work

These were discussed as next steps and slot in cleanly:

- **Levels beyond plain Minesweeper**: the game win condition currently
  posts `GAME_WON` directly after one board. To add a level ladder (e.g.
  "win 3 boards in a row" or escalating difficulty), intercept before that
  post — track a `levelsCleared` counter in the same `state` object, only
  fire `GAME_WON` once a `levelsRequiredToWin` threshold is hit, and reset
  the counter (not just the board) on loss.
- **CAPTCHA gauntlet / harder obstacle sets**: would live as an additional
  page or mode alongside `minesweeper.html`, selected based on current
  level, following the same `GAME_WON`/`GAME_LOST_LIFE` message contract
  so `background.js` doesn't need to change.
- **Popup enhancements**: `popup.js` already reads full state; a "times
  this has ruined your day" counter just needs a new incrementing field in
  `state`, bumped once per `offline` trigger.

## Explicit non-goals

Documented here so nobody "fixes" these by accident:

- **No listener that opens the gate on real reconnection.** This is the
  entire premise; guard it in code review.
- **Not intended for the Chrome Web Store.** No need to optimize for
  review guidelines, minimal permissions, or production polish beyond
  "works reliably when loaded unpacked for a demo."
