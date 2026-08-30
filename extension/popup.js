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
