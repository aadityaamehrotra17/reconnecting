// background.js
// The brain. Tracks a "gate" that has nothing to do with real connectivity,
// intercepts navigation while the gate is closed, and only opens it once
// the user has beaten Minesweeper at least once.

const GAME_URL = chrome.runtime.getURL("game/minesweeper.html");
const DEFAULT_LIVES = 3;

const DEFAULT_STATE = {
  gateOpen: true,       // gate starts open — browsing is unrestricted until
                        // an offline event fires and closes it
  solvedOnce: false,    // have they EVER beaten a board this session?
  lives: DEFAULT_LIVES, // lives left in the current run
  pendingUrl: {}         // tabId -> url the user was actually trying to reach
};

// --- State management ---
// All mutations go through updateState() which serialises read-modify-write
// sequences behind a single promise chain. This prevents concurrent async
// handlers (e.g. two near-simultaneous onBeforeNavigate events) from
// interleaving and overwriting each other's pendingUrl entries.
let _stateQueue = Promise.resolve();

async function getState() {
  const result = await chrome.storage.session.get("state");
  return result.state || structuredClone(DEFAULT_STATE);
}

// Atomic read-modify-write. `fn` receives the current state and returns a
// partial object to shallow-merge in, or null/undefined to skip the write.
function updateState(fn) {
  _stateQueue = _stateQueue.then(async () => {
    const current = await getState();
    const partial = await fn(current);
    if (partial == null) return current;
    const next = { ...current, ...partial };
    await chrome.storage.session.set({ state: next });
    return next;
  });
  return _stateQueue;
}

// Called by the offline handler to close the gate and start a fresh run.
async function resetRun() {
  return updateState(() => ({
    gateOpen: false, solvedOnce: false, lives: DEFAULT_LIVES, pendingUrl: {}
  }));
}

// Called on install/startup — gate starts open; only an offline event closes it.
async function initSession() {
  return updateState(() => ({
    gateOpen: true, solvedOnce: false, lives: DEFAULT_LIVES, pendingUrl: {}
  }));
}

chrome.runtime.onInstalled.addListener(initSession);
chrome.runtime.onStartup.addListener(initSession);

// --- Clean up pendingUrl entries when tabs are closed ---
chrome.tabs.onRemoved.addListener((tabId) => {
  updateState((state) => {
    if (!(tabId in state.pendingUrl)) return null;
    const pendingUrl = { ...state.pendingUrl };
    delete pendingUrl[tabId];
    return { pendingUrl };
  });
});

// --- Navigation interception ---
// Fires on every top-level navigation, connected or not.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only top-level frames
  const url = details.url;

  // Never intercept our own extension pages.
  if (url.startsWith(chrome.runtime.getURL(""))) return;
  // Don't try to intercept internal chrome:// pages, extension gallery, etc.
  if (!/^https?:\/\//.test(url)) return;

  // Gate check + pendingUrl update happen inside a single atomic operation
  // so that a concurrent GAME_WON can't slip in between the read and write.
  let shouldRedirect = false;
  await updateState((current) => {
    if (current.gateOpen) return null; // already earned access, let it through
    shouldRedirect = true;
    return { pendingUrl: { ...current.pendingUrl, [details.tabId]: url } };
  });

  if (shouldRedirect) {
    chrome.tabs.update(details.tabId, { url: GAME_URL });
  }
});

// --- Force the game onto every open tab the moment we go offline ---
// Service workers can listen for connectivity changes directly.
self.addEventListener("offline", async () => {
  await resetRun(); // fresh run: gate closed, lives reset
  const tabs = await chrome.tabs.query({});

  const httpTabs = tabs.filter((tab) =>
    tab.id && tab.url &&
    !tab.url.startsWith(chrome.runtime.getURL("")) &&
    /^https?:\/\//.test(tab.url)
  );

  await updateState((state) => {
    const pendingUrl = { ...state.pendingUrl };
    for (const tab of httpTabs) {
      pendingUrl[tab.id] = tab.url;
    }
    return { pendingUrl };
  });

  for (const tab of httpTabs) {
    chrome.tabs.update(tab.id, { url: GAME_URL });
  }
});

// Note: intentionally NO "online" handler that opens the gate.
// Real reconnection is irrelevant. Only beating the game matters.

// --- Live connectivity polling, purely to taunt the user in the UI ---
async function checkRealConnectivity() {
  try {
    const res = await fetch("https://www.gstatic.com/generate_204", { cache: "no-store" });
    return res.ok || res.status === 204;
  } catch (e) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_REAL_CONNECTIVITY") {
    checkRealConnectivity().then((isOnline) => sendResponse({ isOnline }));
    return true; // async response
  }

  if (message.type === "GAME_WON") {
    (async () => {
      const state = await updateState(() => ({ gateOpen: true, solvedOnce: true }));

      // Release ALL pending tabs back to their original URLs.
      // The gate is intentionally global — winning once frees the entire
      // browser session, so every gated tab gets its destination back.
      for (const [tabIdStr, url] of Object.entries(state.pendingUrl)) {
        try {
          chrome.tabs.update(Number(tabIdStr), { url });
        } catch (_) {
          // Tab may have been closed since — ignore.
        }
      }
      await updateState(() => ({ pendingUrl: {} }));
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "GAME_LOST_LIFE") {
    (async () => {
      const state = await updateState((current) => ({
        lives: Math.max(0, current.lives - 1)
      }));
      sendResponse({ livesRemaining: state.lives });
    })();
    return true;
  }

  if (message.type === "LIVES_DEPLETED_ACKNOWLEDGED") {
    // Cosmetic scare has been shown and dismissed. Give them fresh lives
    // and let them keep trying — losing never permanently locks anyone out,
    // it just costs them the scare and another set of boards.
    (async () => {
      await updateState(() => ({ lives: DEFAULT_LIVES }));
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }
});
