// Chrome will not let a freshly hijacked tab autoplay anything.
// The first real pointer/keyboard gesture on this document is the unlock.

export class AutoplayPolicy {
  constructor() {
    this.unlocked = false;
    this._waiters = [];
    this._armed = false;
  }

  arm() {
    if (this._armed || this.unlocked) return;
    this._armed = true;
    const unlock = () => {
      this.markUnlocked();
    };
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  markUnlocked() {
    if (this.unlocked) return;
    this.unlocked = true;
    const waiters = this._waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  whenUnlocked() {
    if (this.unlocked) return Promise.resolve();
    return new Promise((resolve) => this._waiters.push(resolve));
  }
}
