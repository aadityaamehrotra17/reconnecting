// background.js
// The brain. Tracks a "gate" that has nothing to do with real connectivity,
// intercepts navigation while the gate is closed, and only opens it once
// the user has beaten Minesweeper at least once.
//
// Audio is not this file's job. Service workers cannot play sound.
// soundtrack-authority.js only decides which Minesweeper tab is allowed to.

importScripts("audio/soundtrack-authority.js");

const GAME_URL = chrome.runtime.getURL("game/minesweeper.html");
const DEFAULT_LIVES = 3;

const DEFAULT_STATE = {
  gateOpen: false,      // does the user get to browse?
  solvedOnce: false,    // have they EVER beaten a board this session?
  lives: DEFAULT_LIVES, // lives left in the current run
  pendingUrl: {}         // tabId -> url the user was actually trying to reach
};

// --- State management ---
let _stateQueue = Promise.resolve();

async function getState() {
  const result = await chrome.storage.session.get("state");
  return result.state || structuredClone(DEFAULT_STATE);
}

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

async function resetRun() {
  return updateState(() => ({
    gateOpen: false, solvedOnce: false, lives: DEFAULT_LIVES, pendingUrl: {}
  }));
}

// Gate closed on every browser session start.
chrome.runtime.onInstalled.addListener(resetRun);
chrome.runtime.onStartup.addListener(resetRun);

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
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;

  if (url.startsWith(chrome.runtime.getURL(""))) return;
  if (!/^https?:\/\//.test(url)) return;

  let shouldRedirect = false;
  await updateState((current) => {
    if (current.gateOpen) return null;
    shouldRedirect = true;
    return { pendingUrl: { ...current.pendingUrl, [details.tabId]: url } };
  });

  if (shouldRedirect) {
    chrome.tabs.update(details.tabId, { url: GAME_URL });
  }
});

// --- Also sweep all tabs on offline event ---
self.addEventListener("offline", async () => {
  await resetRun();
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
    return true;
  }

  if (message.type === "GAME_WON") {
    (async () => {
      const state = await updateState(() => ({ gateOpen: true, solvedOnce: true }));

      for (const [tabIdStr, url] of Object.entries(state.pendingUrl)) {
        try {
          chrome.tabs.update(Number(tabIdStr), { url });
        } catch (_) {}
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
