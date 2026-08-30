# You Are Not Reconnected

*A Chrome extension that has decided your internet coming back is none of its business.*

## What is this

The moment your internet drops, this extension takes over every open tab
and replaces whatever you were looking at with a game of Minesweeper.

That part's normal enough. Here's the part that isn't: your internet can
come back — fully, actually, verifiably back — and it won't matter. This
extension does not care what your router is doing. It cares whether you've
beaten a Minesweeper board. Until you have, you're not going anywhere.

## What actually happens, step by step

1. You install the extension.
2. Your internet drops (or you simulate it — see Testing below).
3. Instantly, every tab you have open gets redirected to a Minesweeper
   board. Doesn't matter what you were doing. Doesn't ask.
4. The screen shows you two numbers, side by side, updated every few
   seconds:
   - **Real connection status** — this is always accurate. It's actively
     pinging a server right now to check.
   - **Extension verdict** — this is the one that decides whether you get
     to browse, and it will say **NOPE** regardless of what the first
     number says.
5. You play Minesweeper on the Fun UI Forge board: huge italic display
   type, a four-cell stats strip, Rock / Doom / Lofi as hard-edged
   buttons, a % SYNC bar, diamond lives, and a Lights On/Off switch.
   Standard rules still apply — left-click to reveal, right-click to
   flag, avoid the 10 mines. Chrome will not start the music until you
   click something. Those vibe buttons play the real tracks, not a
   caption. Hit a mine and FAHH plays, whether or not you have the
   soundtrack lease.
6. **You have 3 lives.** Hit a mine or run out of time (45s per board),
   lose a life, get a brand new board.
7. **Lose all 3 lives** and the extension actually deletes your last 24 hours
   of browsing history via `chrome.browsingData`, shows a popup confirmation,
   and closes the window after 2 seconds.
8. **Win a single board — any board, on any attempt** — and the extension
   immediately lets you go. Your tab reloads the exact page you were
   originally trying to reach, as if nothing happened.
9. If your internet comes back while you're still playing, just navigate
   normally — the extension sees you're online and steps aside. The game
   only blocks you while you're actually disconnected.

## What this is not

- It is not a real network diagnostic tool. It does not fix, throttle, or
  interact with your actual connection in any way. Your internet was
  probably fine the whole time.
- It is not going to be published to the Chrome Web Store. It asks for
  permission to intercept every page you try to visit on every tab, which
  is an unreasonable amount of trust to hand over for a game with no
  purpose.

## Why does this exist

Built for a hackathon whose only rule was that whatever you build has to
be genuinely useless — no real user, no real problem. This qualifies: it
invents a problem that doesn't exist (you are connected but not "allowed"
to browse) and solves it with real, working engineering — live navigation
interception across every tab, session-persisted game state, real-time
connectivity polling used only to mock you, a lives system, a fake data-
loss sequence — all in service of a situation that is strictly worse than
just doing nothing.

If you find yourself with an actual use for this, that's a sign it
shouldn't have been built.

## How it works (for the curious)

- `background.js` is a Manifest V3 service worker. It intercepts every
  navigation attempt (`webNavigation.onBeforeNavigate`) and checks two
  things: is the browser online, and has the user already beaten a board?
  If online, navigation is always allowed. If offline and the user hasn't
  won yet, the tab is redirected to the Minesweeper page.
- It also listens for the browser going offline and immediately redirects
  every open tab to the Minesweeper page, storing each tab's original
  destination.
- The gate only opens on a `GAME_WON` message from the game page, which
  happens when a board is fully cleared.
- Real connectivity is checked independently via a lightweight ping, purely
  to feed the "Real connection: ONLINE, Extension verdict: NOPE" readout on
  screen.
- Lives, gate state, and "solved at least once" status live in
  `chrome.storage.session`, so they reset automatically on browser
  restart.

## Soundtrack (deliberately overbuilt)

The game page can play audio. The service worker cannot. That one
Manifest V3 fact is the entire architecture.

- `background.js` is still a service worker. Service workers have no
  media pipeline, no `AudioContext`, and no legal way to go "beep".
  `audio/soundtrack-authority.js` only runs a **soundtrack lease**:
  exactly one Minesweeper tab is allowed to play music at a time. If
  every hijacked tab pressed play, you would get N copies of BFG
  Division, which is a war crime even by this extension's standards.
- Music and the FAHH mine sting live in the game page, behind
  `audio/director.js`. A dual-deck Web Audio mixer streams the MP3s
  through `<audio>` elements so a 14MB track is never decoded into a
  giant PCM buffer. Switching Rock / Doom / Lofi crossfades decks.
- Chrome's autoplay policy will not let a freshly hijacked tab start
  music by itself. The first click or keypress on the page unlocks
  the graph. Hitting a mine is a gesture, so FAHH always has a legal
  window to play.
- FAHH does not need the lease. The tab that detonated the mine always
  yells. The music bus ducks for the duration so the sting is audible.
- The selected vibe is stored in `chrome.storage.session` under
  `vibeId`, same lifetime as lives and the gate. Restart the browser,
  forget your taste, earn it back.
- Assets live at `extension/audio/assets/` with boring filenames.
  Extension pages load them via `chrome.runtime.getURL`. They are not
  injected into other sites and do not need `web_accessible_resources`.
- The board chrome is the Fun UI Forge drop: bundled Bebas Neue / Inter /
  JetBrains Mono so the page still looks like itself when the internet
  is actually gone. Rock / Doom / Lofi in that UI call `AudioDirector.setVibe`.

None of this opens the gate. The soundtrack is as useless as the rest
of the product, just louder.

## Installation

1. Download and unzip the extension folder.
2. Go to `chrome://extensions`.
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked** and select the `extension` folder.

## Testing it without waiting for your wifi to actually fail

Chrome DevTools can simulate the browser's offline event, which is what
this extension listens for:

1. Open DevTools (`F12` or `Cmd+Opt+I`).
2. Go to the **Network** tab.
3. Set the throttling dropdown to **Offline**.
4. Every open tab should immediately jump to the Minesweeper screen.

You can also just turn your wifi off and back on — the "back on" part is
irrelevant to the extension, but it's a good way to confirm that's true.

## Uninstalling

`chrome://extensions` → find "You Are Not Reconnected" → **Remove**. This
is, notably, the one action in this entire experience that works exactly
as expected on the first try.
