// Dual-deck Web Audio mixer.
// Music is streamed through <audio> + MediaElementSource so we never decode
// a 14MB BFG Division into a giant PCM buffer. SFX is a short element.
// Ducking rides the music bus, not the master, so FAHH stays at full yell.

import { SFX_CATALOG, assetUrl, resolveVibe } from "./catalog.js";

const CROSSFADE_SEC = 0.18;

function createContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return new Ctx();
}

function createDeck(ctx, bus) {
  const el = new Audio();
  el.preload = "auto";
  el.loop = true;
  const source = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(bus);
  return { el, gain, vibeId: null };
}

export class SoundtrackMixer {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.decks = null;
    this.activeIndex = 0;
    this.musicBedGain = 0.55;
    this._sfx = new Map();
    this._sfxTimers = new Map();
  }

  async resume() {
    this._ensureGraph();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  _ensureGraph() {
    if (this.ctx) return;
    this.ctx = createContext();
    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.decks = [createDeck(this.ctx, this.musicBus), createDeck(this.ctx, this.musicBus)];
    this._preloadSfx();
  }

  _preloadSfx() {
    for (const sfx of Object.values(SFX_CATALOG)) {
      const el = new Audio(assetUrl(sfx.asset));
      el.preload = "auto";
      const source = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = sfx.gain;
      source.connect(gain);
      gain.connect(this.sfxBus);
      this._sfx.set(sfx.id, { el, gain });
    }
  }

  async ensureVibe(vibeId) {
    this._ensureGraph();
    const vibe = resolveVibe(vibeId);
    const active = this.decks[this.activeIndex];
    this.musicBedGain = vibe.musicGain;
    if (active.vibeId === vibe.id) {
      if (active.el.paused) {
        try {
          await active.el.play();
        } catch {
          return;
        }
      }
      const now = this.ctx.currentTime;
      active.gain.gain.cancelScheduledValues(now);
      active.gain.gain.setValueAtTime(vibe.musicGain, now);
      return;
    }

    const nextIndex = this.activeIndex ^ 1;
    const incoming = this.decks[nextIndex];
    const outgoing = active;

    incoming.el.loop = vibe.loop;
    incoming.el.src = assetUrl(vibe.asset);
    incoming.el.currentTime = 0;
    incoming.vibeId = vibe.id;

    try {
      await incoming.el.play();
    } catch {
      incoming.vibeId = null;
      return;
    }

    const now = this.ctx.currentTime;
    incoming.gain.gain.cancelScheduledValues(now);
    incoming.gain.gain.setValueAtTime(incoming.gain.gain.value, now);
    incoming.gain.gain.linearRampToValueAtTime(vibe.musicGain, now + CROSSFADE_SEC);

    outgoing.gain.gain.cancelScheduledValues(now);
    outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
    outgoing.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);

    window.setTimeout(() => {
      if (outgoing !== this.decks[this.activeIndex]) {
        outgoing.el.pause();
      }
    }, CROSSFADE_SEC * 1000 + 40);

    this.activeIndex = nextIndex;
  }

  pauseMusic() {
    if (!this.decks) return;
    for (const deck of this.decks) {
      deck.el.pause();
    }
  }

  async playSfx(sfxId) {
    this._ensureGraph();
    const spec = SFX_CATALOG[sfxId];
    const voice = this._sfx.get(sfxId);
    if (!spec || !voice) return;

    const prevTimer = this._sfxTimers.get(sfxId);
    if (prevTimer) window.clearTimeout(prevTimer);

    voice.el.currentTime = 0;
    try {
      await voice.el.play();
    } catch {
      return;
    }

    if (spec.maxDurationSec) {
      this._sfxTimers.set(sfxId, window.setTimeout(() => {
        voice.el.pause();
        voice.el.currentTime = 0;
        this._sfxTimers.delete(sfxId);
      }, spec.maxDurationSec * 1000));
    }

    this.duckMusic(spec);
  }

  duckMusic(spec) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const attack = spec.duckAttackMs / 1000;
    const hold = spec.duckHoldMs / 1000;
    const release = spec.duckReleaseMs / 1000;
    const ducked = this.musicBedGain * spec.duckRatio;

    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
    this.musicBus.gain.linearRampToValueAtTime(ducked, now + attack);
    this.musicBus.gain.setValueAtTime(ducked, now + attack + hold);
    this.musicBus.gain.linearRampToValueAtTime(1, now + attack + hold + release);
  }
}
