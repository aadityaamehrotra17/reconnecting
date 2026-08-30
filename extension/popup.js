const VIBE_LABELS = { rock: "Rock", doom: "Doom", lofi: "Lofi" };

chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
  if (!state) return;
  const gateEl = document.getElementById("gate");
  const solvedEl = document.getElementById("solved");
  const livesEl = document.getElementById("lives");

  gateEl.textContent = state.gateOpen ? "Yes" : "No";
  gateEl.className = "value " + (state.gateOpen ? "yes" : "no");

  solvedEl.textContent = state.solvedOnce ? "Yes" : "No";
  solvedEl.className = "value " + (state.solvedOnce ? "yes" : "no");

  livesEl.textContent = String(state.lives ?? "?");
});

chrome.storage.session.get("vibeId", (result) => {
  const vibeEl = document.getElementById("vibe");
  if (!vibeEl) return;
  const vibeId = result.vibeId;
  vibeEl.textContent = VIBE_LABELS[vibeId] || "Rock (default)";
});
