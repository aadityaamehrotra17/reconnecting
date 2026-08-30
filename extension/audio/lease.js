// Soundtrack lease client.
// MV3 service workers cannot play audio. Every Minesweeper tab *can*,
// which would mean five copies of BFG Division if we just pressed play.
// The background authority grants exactly one tab the right to make music.
// SFX never needs a lease — the tab that hit the mine always yells.

const PORT_NAME = "soundtrack-lease";

export class SoundtrackLease {
  constructor() {
    this.held = false;
    this._port = null;
    this._listeners = new Set();
  }

  connect() {
    if (this._port) return;
    this._port = chrome.runtime.connect({ name: PORT_NAME });
    this._port.onMessage.addListener((message) => {
      if (message.type === "GRANTED") this._setHeld(true);
      if (message.type === "REVOKED") this._setHeld(false);
    });
    this._port.onDisconnect.addListener(() => {
      this._port = null;
      this._setHeld(false);
    });
    this.claim();
  }

  claim() {
    this._port?.postMessage({ type: "CLAIM" });
  }

  yield() {
    this._port?.postMessage({ type: "YIELD" });
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _setHeld(held) {
    if (this.held === held) return;
    this.held = held;
    for (const fn of this._listeners) fn(held);
  }
}
