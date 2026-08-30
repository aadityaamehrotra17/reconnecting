import { VIBE_IDS, VIBE_CATALOG } from "../audio/catalog.js";

function leaseCopy(snap) {
  if (!snap.unlocked) return "Click anywhere to authorize the vibe.";
  if (!snap.leaseHeld) return "Another tab is holding the soundtrack lease.";
  return "This tab holds the soundtrack lease.";
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
      button.innerHTML = `<span class="vibe-option-label">${vibe.label}</span><span class="vibe-option-tag">${vibe.tagline}</span>`;
      button.addEventListener("click", () => {
        director.setVibe(id);
      });
      switchEl.appendChild(button);
    }
  } else {
    root.querySelectorAll("[data-vibe]").forEach((button) => {
      button.addEventListener("click", () => director.setVibe(button.dataset.vibe));
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
    if (nowPlayingEl) {
      nowPlayingEl.textContent = snap.unlocked
        ? `Now playing: ${snap.vibe.tagline}`
        : "Soundtrack armed. Waiting on a gesture.";
    }
    if (leaseEl) leaseEl.textContent = leaseCopy(snap);
  });
}
