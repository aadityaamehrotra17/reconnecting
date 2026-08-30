// Soundtrack lease authority — lives in the service worker because the
// service worker is the only process that can see every Minesweeper tab
// at once. It cannot play audio. It can only decide who is allowed to.

const PORT_NAME = "soundtrack-lease";

const ports = new Map(); // tabId -> Port
let holderTabId = null;
let preferredTabId = null;

function post(tabId, message) {
  const port = ports.get(tabId);
  if (port) port.postMessage(message);
}

function assignLease() {
  const next =
    (preferredTabId != null && ports.has(preferredTabId) && preferredTabId) ||
    ports.keys().next().value ||
    null;

  if (next === holderTabId) return;

  const previous = holderTabId;
  holderTabId = next;

  if (previous != null) post(previous, { type: "REVOKED" });
  if (next != null) post(next, { type: "GRANTED" });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const tabId = port.sender?.tab?.id;
  if (tabId == null) {
    port.disconnect();
    return;
  }

  ports.set(tabId, port);
  preferredTabId = tabId;
  assignLease();

  port.onMessage.addListener((message) => {
    if (message.type === "CLAIM") {
      preferredTabId = tabId;
      assignLease();
    }
    if (message.type === "YIELD") {
      if (preferredTabId === tabId) preferredTabId = null;
      if (holderTabId === tabId) {
        holderTabId = null;
        assignLease();
      }
    }
  });

  port.onDisconnect.addListener(() => {
    ports.delete(tabId);
    if (preferredTabId === tabId) preferredTabId = null;
    if (holderTabId === tabId) {
      holderTabId = null;
      assignLease();
    }
  });
});
