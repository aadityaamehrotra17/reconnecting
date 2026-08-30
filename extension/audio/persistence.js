// Vibe preference lives in chrome.storage.session so every hijacked tab
// agrees on the soundtrack, and a browser restart forgets your taste —
// same contract as lives / gate / solvedOnce.

import { DEFAULT_VIBE_ID, isVibeId } from "./catalog.js";

const STORAGE_KEY = "vibeId";

export async function loadVibeId() {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  return isVibeId(stored) ? stored : DEFAULT_VIBE_ID;
}

export async function saveVibeId(vibeId) {
  const next = isVibeId(vibeId) ? vibeId : DEFAULT_VIBE_ID;
  await chrome.storage.session.set({ [STORAGE_KEY]: next });
  return next;
}

export function subscribeVibeId(onChange) {
  const listener = (changes, area) => {
    if (area !== "session" || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    onChange(isVibeId(next) ? next : DEFAULT_VIBE_ID);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
