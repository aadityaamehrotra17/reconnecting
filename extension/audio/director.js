// High-level owner of "what should be audible right now".
// Playback only happens when: policy unlocked AND this tab holds the lease.

import { DEFAULT_VIBE_ID, resolveVibe } from "./catalog.js";
import { SoundtrackLease } from "./lease.js";
import { SoundtrackMixer } from "./mixer.js";
import { loadVibeId, saveVibeId, subscribeVibeId } from "./persistence.js";
import { AutoplayPolicy } from "./policy.js";

let singleton = null;

export function getAudioDirector() {
  if (!singleton) singleton = new AudioDirector();
  return singleton;
}

export class AudioDirector {
  constructor() {
    this.mixer = new SoundtrackMixer();
    this.lease = new SoundtrackLease();
    this.policy = new AutoplayPolicy();
    this.vibeId = DEFAULT_VIBE_ID;
    this._listeners = new Set();
    this._attached = false;
  }

  async attach() {
    if (this._attached) return;
    this._attached = true;

    this.vibeId = await saveVibeId(await loadVibeId());
    this.policy.arm();
    this.lease.connect();
    this.lease.onChange(() => this._syncPlayback());
    subscribeVibeId((vibeId) => {
      if (vibeId === this.vibeId) return;
      this.vibeId = vibeId;
      this._syncPlayback();
      this._emit();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.lease.claim();
      else this.lease.yield();
    });

    this.policy.whenUnlocked().then(() => this._syncPlayback());
    this._emit();
  }

  snapshot() {
    return {
      vibeId: this.vibeId,
      vibe: resolveVibe(this.vibeId),
      unlocked: this.policy.unlocked,
      leaseHeld: this.lease.held
    };
  }

  subscribe(fn) {
    this._listeners.add(fn);
    fn(this.snapshot());
    return () => this._listeners.delete(fn);
  }

  async setVibe(vibeId) {
    this.policy.markUnlocked();
    this.vibeId = (await saveVibeId(vibeId));
    await this.mixer.resume();
    await this._syncPlayback();
    this._emit();
  }

  async unlockFromGesture() {
    this.policy.markUnlocked();
    await this.mixer.resume();
    await this._syncPlayback();
    this._emit();
  }

  async detonateMine() {
    this.policy.markUnlocked();
    await this.mixer.resume();
    await this.mixer.playSfx("fahh");
    this._emit();
  }

  async fireBossKey() {
    this.policy.markUnlocked();
    await this.mixer.resume();
    await this.mixer.playSfx("lawde");
    this._emit();
  }

  async _syncPlayback() {
    if (!this.policy.unlocked || !this.lease.held) {
      this.mixer.pauseMusic();
      return;
    }
    await this.mixer.resume();
    await this.mixer.ensureVibe(this.vibeId);
  }

  _emit() {
    const snap = this.snapshot();
    for (const fn of this._listeners) fn(snap);
  }
}
