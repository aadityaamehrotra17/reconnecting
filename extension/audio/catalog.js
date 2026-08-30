// Frozen registry of everything that is allowed to make noise.
// Paths are relative to the extension root so chrome.runtime.getURL stays honest.

export const DEFAULT_VIBE_ID = "rock";

export const VIBE_IDS = Object.freeze(["rock", "doom", "lofi"]);

export const VIBE_CATALOG = Object.freeze({
  rock: Object.freeze({
    id: "rock",
    label: "Rock",
    tagline: "Stepz — Rock (Instrumental)",
    asset: "audio/assets/rock.mp3",
    loop: true,
    musicGain: 0.55
  }),
  doom: Object.freeze({
    id: "doom",
    label: "Doom",
    tagline: "Mick Gordon — BFG Division",
    asset: "audio/assets/doom.mp3",
    loop: true,
    musicGain: 0.42
  }),
  lofi: Object.freeze({
    id: "lofi",
    label: "Lofi",
    tagline: "3 Minute Spring Timer",
    asset: "audio/assets/lofi.mp3",
    loop: true,
    musicGain: 0.62
  })
});

export const SFX_CATALOG = Object.freeze({
  fahh: Object.freeze({
    id: "fahh",
    label: "FAHHH",
    asset: "audio/assets/fahh.mp3",
    gain: 1,
    maxDurationSec: 2,
    duckRatio: 0.18,
    duckAttackMs: 40,
    duckHoldMs: 1400,
    duckReleaseMs: 400
  }),
  lawde: Object.freeze({
    id: "lawde",
    label: "Lawde",
    asset: "audio/assets/lawde.mp3",
    gain: 1,
    maxDurationSec: 2,
    duckRatio: 0.12,
    duckAttackMs: 30,
    duckHoldMs: 1400,
    duckReleaseMs: 300
  })
});

export function isVibeId(value) {
  return Object.prototype.hasOwnProperty.call(VIBE_CATALOG, value);
}

export function resolveVibe(id) {
  return VIBE_CATALOG[isVibeId(id) ? id : DEFAULT_VIBE_ID];
}

export function assetUrl(relativePath) {
  return chrome.runtime.getURL(relativePath);
}
