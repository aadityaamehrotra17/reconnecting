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

async function getState() {
  const result = await chrome.storage.session.get("state");
  return result.state || structuredClone(DEFAULT_STATE);
}

async function setState(partial) {
  const current = await getState();
  const next = { ...current, ...partial };
  await chrome.storage.session.set({ state: next });
  return next;
}

async function resetRun() {
  return setState({ gateOpen: false, solvedOnce: false, lives: DEFAULT_LIVES, pendingUrl: {} });
}

// Initialize fresh each browser session — you re-earn your internet every time.
chrome.runtime.onInstalled.addListener(resetRun);
chrome.runtime.onStartup.addListener(resetRun);

// --- Navigation interception ---
// Fires on every top-level navigation, connected or not.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only top-level frames
  const url = details.url;

  // Never intercept our own extension pages.
  if (url.startsWith(chrome.runtime.getURL(""))) return;
  // Don't try to intercept internal chrome:// pages, extension gallery, etc.
  if (!/^https?:\/\//.test(url)) return;

  const state = await getState();
  if (state.gateOpen) return; // already earned access, let it through

  const pendingUrl = { ...state.pendingUrl, [details.tabId]: url };
  await setState({ pendingUrl });

  chrome.tabs.update(details.tabId, { url: GAME_URL });
});

// --- Force the game onto every open tab the moment we go offline ---
// Service workers can listen for connectivity changes directly.
self.addEventListener("offline", async () => {
  await resetRun(); // fresh run: gate closed, lives reset
  const tabs = await chrome.tabs.query({});
  const state = await getState();
  const pendingUrl = { ...state.pendingUrl };

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (tab.url.startsWith(chrome.runtime.getURL(""))) continue;
    if (!/^https?:\/\//.test(tab.url)) continue;
    pendingUrl[tab.id] = tab.url;
    chrome.tabs.update(tab.id, { url: GAME_URL });
  }
  await setState({ pendingUrl });
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
      const state = await setState({ gateOpen: true, solvedOnce: true });
      const tabId = sender.tab?.id;
      const url = tabId != null ? state.pendingUrl[tabId] : null;
      if (tabId != null && url) {
        chrome.tabs.update(tabId, { url });
        const pendingUrl = { ...state.pendingUrl };
        delete pendingUrl[tabId];
        await setState({ pendingUrl });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "GAME_LOST_LIFE") {
    (async () => {
      const state = await getState();
      const lives = Math.max(0, state.lives - 1);
      await setState({ lives });
      sendResponse({ livesRemaining: lives });
    })();
    return true;
  }

  if (message.type === "LIVES_DEPLETED_ACKNOWLEDGED") {
    // Cosmetic scare has been shown and dismissed. Give them fresh lives
    // and let them keep trying — losing never permanently locks anyone out,
    // it just costs them the scare and another set of boards.
    (async () => {
      await setState({ lives: DEFAULT_LIVES });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }
});
