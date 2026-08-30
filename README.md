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
5. You play Minesweeper. Standard rules: left-click to reveal, right-click
   to flag, avoid the 10 mines hidden across the 9x9 board.
6. **You have 3 lives.** Hit a mine, lose a life, get a brand new board.
7. **Lose all 3 lives** and you get a popup: *"Deleting browsing
   history…"* with a live progress bar counting up to "4,281 of 4,281
   items removed." Once it hits 100%, your lives reset to 3 and you get a
   new board. Nothing was actually deleted — the whole thing is theater —
   but you don't know that in the moment, which is the point.
8. **Win a single board — any board, on any attempt** — and the extension
   immediately lets you go. Your tab reloads the exact page you were
   originally trying to reach, as if nothing happened.
9. This resets every time your internet drops again. Each disconnection,
   you earn your internet access from scratch.

## What this is not

- It is not a real network diagnostic tool. It does not fix, throttle, or
  interact with your actual connection in any way. Your internet was
  probably fine the whole time.
- It does not delete cookies, history, saved passwords, or any other real
  data, ever, under any outcome. The "deleting history" popup is a
  cosmetic animation with a fake counter. Losing all your lives costs you
  a scare and another few boards, nothing else.
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

- `background.js` is a Manifest V3 service worker. It listens for the
  browser going offline and immediately redirects every open tab to the
  Minesweeper page, storing each tab's original destination.
- It also intercepts every subsequent navigation attempt
  (`webNavigation.onBeforeNavigate`) while its internal "gate" is closed —
  so trying to open a new link doesn't help either.
- The gate only opens on a `GAME_WON` message from the game page, which
  happens when a board is fully cleared. There is deliberately no listener
  tied to the browser's real "online" event — actual connectivity never
  opens the gate on its own.
- Real connectivity is checked independently via a lightweight ping, purely
  to feed the "Real connection: ONLINE, Extension verdict: NOPE" readout on
  screen.
- Lives, gate state, and "solved at least once" status live in
  `chrome.storage.session`, so they reset automatically on browser
  restart. The gate starts open — it only closes when an actual offline
  event fires.

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
