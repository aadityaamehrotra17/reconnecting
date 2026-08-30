import { VIBE_IDS, VIBE_CATALOG } from "../audio/catalog.js";

function leaseCopy(snap) {
  if (!snap.unlocked) return "Soundtrack lease waits on a click. Chrome's rule, not ours.";
  if (!snap.leaseHeld) return "Another tab is holding the soundtrack lease.";
  return "This tab holds the soundtrack lease.";
}

function nowPlayingCopy(snap) {
  if (!snap.unlocked) return "Soundtrack armed. Click anywhere to authorize the vibe.";
  if (!snap.leaseHeld) return `Queued: ${snap.vibe.tagline}`;
  return `Now playing: ${snap.vibe.tagline}`;
}

export function mountVibeConsole(root, director) {
  if (!root) return;

  const switchEl = root.querySelector("[data-vibe-switch]");
  const nowPlayingEl = root.querySelector("[data-vibe-now-playing]");
  const leaseEl = root.querySelector("[data-vibe-lease]");

  if (switchEl && !switchEl.children.length) {
    for (const id of VIBE_IDS) {
      const vibe = VIBE_CATALOG[id];
      const button = document.createElement("button");
      button.type = "button";
      button.role = "radio";
      button.dataset.vibe = id;
      button.className = "vibe-option";
      button.title = vibe.tagline;
      button.textContent = vibe.label;
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        director.setVibe(id);
      });
      switchEl.appendChild(button);
    }
  } else {
    root.querySelectorAll("[data-vibe]").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        director.setVibe(button.dataset.vibe);
      });
    });
  }

  director.subscribe((snap) => {
    document.body.dataset.vibe = snap.vibeId;
    root.dataset.vibe = snap.vibeId;
    root.querySelectorAll("[data-vibe]").forEach((button) => {
      const selected = button.dataset.vibe === snap.vibeId;
      button.setAttribute("aria-checked", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    if (nowPlayingEl) nowPlayingEl.textContent = nowPlayingCopy(snap);
    if (leaseEl) leaseEl.textContent = leaseCopy(snap);
  });
}
