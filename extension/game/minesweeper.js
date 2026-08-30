import { getAudioDirector } from "../audio/director.js";
import { mountVibeConsole } from "./vibe-console.js";

const director = getAudioDirector();

const ROWS = 9;
const COLS = 9;
const MINES = 10;
const DEFAULT_LIVES = 3;
const ROUND_SECONDS = 45;

let grid = [];
let revealedCount = 0;
let flaggedCount = 0;
let gameOver = false;
let lives = DEFAULT_LIVES;
let timeLeft = ROUND_SECONDS;
let timerInterval = null;

const boardEl = document.getElementById("board");
const boardFrameEl = document.getElementById("board-frame");
const livesEl = document.getElementById("lives");
const realStatusEl = document.getElementById("real-status");
const minesLeftEl = document.getElementById("mines-left");
const timeLeftEl = document.getElementById("time-left");
const syncFillEl = document.getElementById("sync-fill");
const syncLabelEl = document.getElementById("sync-label");
const overlayEl = document.getElementById("end-overlay");
const endKickerEl = document.getElementById("end-kicker");
const endTitleEl = document.getElementById("end-title");
const endCopyEl = document.getElementById("end-copy");
const endActionEl = document.getElementById("end-action");
const lockoutPhaseEl = document.getElementById("lockout-phase");
const progressFillEl = document.getElementById("progress-fill");
const popupDetailEl = document.getElementById("popup-detail");
const runStatusEl = document.getElementById("run-status");
const statusDotEl = document.getElementById("status-dot");
const confettiLayerEl = document.getElementById("confetti-layer");
const lightsToggleEl = document.getElementById("lights-toggle");
const lightsLabelEl = document.getElementById("lights-label");
const resetDropEl = document.getElementById("reset-drop");

function init() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
    lives = state && typeof state.lives === "number" ? state.lives : DEFAULT_LIVES;
    if (lives <= 0) lives = DEFAULT_LIVES;
    renderLives();
  });
  mountVibeConsole(document.getElementById("vibe-console"), director);
  director.attach();
  document.addEventListener("pointerdown", () => director.unlockFromGesture(), { capture: true });
  lightsToggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    document.body.classList.toggle("light");
    const on = document.body.classList.contains("light");
    lightsLabelEl.textContent = on ? "Lights Out" : "Lights On";
  });
  resetDropEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (gameOver) return;
    buildBoard();
  });
  buildBoard();
  pollRealConnectivity();
  setInterval(pollRealConnectivity, 4000);
}

function buildBoard() {
  stopTimer();
  gameOver = false;
  revealedCount = 0;
  flaggedCount = 0;
  timeLeft = ROUND_SECONDS;
  boardEl.innerHTML = "";
  boardEl.style.pointerEvents = "";
  setRunStatus("Active", false);
  hideEndOverlay();
  renderTimer();
  startTimer();
  grid = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({
      mine: false, revealed: false, flagged: false, adjacent: 0
    }))
  );

  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (!grid[r][c].mine) {
      grid[r][c].mine = true;
      placed++;
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc].mine) count++;
        }
      }
      grid[r][c].adjacent = count;
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell hidden";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.setAttribute("aria-label", "Hidden tile");
      cell.addEventListener("click", onLeftClick);
      cell.addEventListener("contextmenu", onRightClick);
      boardEl.appendChild(cell);
    }
  }
  renderChrome();
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (gameOver) {
      stopTimer();
      return;
    }
    timeLeft--;
    renderTimer();
    if (timeLeft <= 0) {
      stopTimer();
      handleTimeout();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function renderTimer() {
  if (timeLeftEl) {
    timeLeftEl.textContent = String(Math.max(0, timeLeft)).padStart(3, "0");
  }
}

function handleTimeout() {
  if (gameOver) return;
  gameOver = true;
  director.detonateMine();
  shakeBoard();
  revealAllMines();
  handleLoss();
}

function cellEl(r, c) {
  return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function onLeftClick(e) {
  if (gameOver) return;
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const cell = grid[r][c];
  if (cell.flagged || cell.revealed) return;

  if (cell.mine) {
    director.detonateMine();
    shakeBoard();
    revealAllMines();
    gameOver = true;
    handleLoss();
    return;
  }

  director.unlockFromGesture();
  reveal(r, c);
  renderChrome();
  checkWin();
}

function onRightClick(e) {
  e.preventDefault();
  if (gameOver) return;
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const cell = grid[r][c];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  flaggedCount += cell.flagged ? 1 : -1;
  const el = cellEl(r, c);
  el.classList.toggle("flagged", cell.flagged);
  el.innerHTML = cell.flagged ? "<span class=\"flag-mark\">◤</span>" : "";
  el.setAttribute("aria-label", cell.flagged ? "Flagged tile" : "Hidden tile");
  renderChrome();
}

function reveal(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  const cell = grid[r][c];
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;
  revealedCount++;
  const el = cellEl(r, c);
  el.classList.remove("hidden");
  el.classList.add("revealed");
  el.setAttribute("aria-label", "Revealed tile");

  if (cell.adjacent > 0) {
    el.textContent = cell.adjacent;
    el.classList.add("n" + cell.adjacent);
  } else {
    el.textContent = "";
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr !== 0 || dc !== 0) reveal(r + dr, c + dc);
      }
    }
  }
}

function revealAllMines() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].mine) {
        const el = cellEl(r, c);
        el.classList.remove("hidden");
        el.classList.add("revealed", "mine");
        el.innerHTML = "<span class=\"mine-dot\" aria-label=\"mine\"></span>";
      }
    }
  }
}

function checkWin() {
  const totalSafeCells = ROWS * COLS - MINES;
  if (revealedCount === totalSafeCells) {
    gameOver = true;
    handleWin();
  }
}

function handleWin() {
  stopTimer();
  boardEl.style.pointerEvents = "none";
  setRunStatus("Restored", false);
  burstConfetti();
  showEndOverlay({
    kicker: "Drop Secured",
    title: "INTERNET<br />RESTORED",
    copy: "Full bars. Unlimited vibes. Scroll responsibly.",
    action: null
  });
  chrome.runtime.sendMessage({ type: "GAME_WON" }, () => {
    // background.js will redirect this tab to the real destination.
  });
}

function handleLoss() {
  stopTimer();
  chrome.runtime.sendMessage({ type: "GAME_LOST_LIFE" }, (res) => {
    lives = res && typeof res.livesRemaining === "number" ? res.livesRemaining : lives - 1;
    renderLives();
    if (lives <= 0) {
      setRunStatus("Terminated", true);
      showEndOverlay({
        kicker: "Drop Fumbled",
        title: "BROWSING HISTORY<br />DELETED",
        copy: "Past 24 hours of browsing history has been removed. Closing in 2s...",
        action: null
      });
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "CLOSE_WINDOW" }, () => {
          window.close();
        });
      }, 2000);
    } else {
      setTimeout(buildBoard, 900);
    }
  });
}

function renderLives() {
  const bits = [];
  for (let i = 0; i < DEFAULT_LIVES; i++) {
    if (i < lives) bits.push("<span class=\"live\">◆</span>");
    else bits.push("<span class=\"dead\">◇</span>");
  }
  livesEl.innerHTML = bits.join("");
}

function renderChrome() {
  const remaining = Math.max(MINES - flaggedCount, 0);
  minesLeftEl.textContent = String(remaining).padStart(3, "0");
  const totalSafe = ROWS * COLS - MINES;
  const pct = Math.round((revealedCount / totalSafe) * 100);
  syncFillEl.style.width = pct + "%";
  syncLabelEl.textContent = pct + "% SYNC";
}

function setRunStatus(label, lost) {
  if (runStatusEl) runStatusEl.textContent = label;
  if (statusDotEl) statusDotEl.classList.toggle("is-lost", Boolean(lost));
}

function shakeBoard() {
  boardFrameEl.classList.remove("is-shaking");
  void boardFrameEl.offsetWidth;
  boardFrameEl.classList.add("is-shaking");
  setTimeout(() => boardFrameEl.classList.remove("is-shaking"), 500);
}

function burstConfetti() {
  confettiLayerEl.innerHTML = "";
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit c" + (i % 3);
    bit.style.left = Math.random() * 100 + "%";
    bit.style.animationDelay = Math.random() * 0.6 + "s";
    confettiLayerEl.appendChild(bit);
  }
}

function showEndOverlay({ kicker, title, copy, action }) {
  endKickerEl.textContent = kicker;
  endTitleEl.innerHTML = title;
  endCopyEl.textContent = copy;
  if (lockoutPhaseEl) lockoutPhaseEl.classList.add("hidden");
  if (action) {
    endActionEl.textContent = action;
    endActionEl.classList.remove("hidden");
  } else {
    endActionEl.classList.add("hidden");
  }
  overlayEl.classList.remove("hidden");
}

function hideEndOverlay() {
  overlayEl.classList.add("hidden");
  if (lockoutPhaseEl) lockoutPhaseEl.classList.add("hidden");
  endActionEl.classList.add("hidden");
  if (progressFillEl) progressFillEl.style.width = "0%";
  confettiLayerEl.innerHTML = "";
}

function pollRealConnectivity() {
  chrome.runtime.sendMessage({ type: "CHECK_REAL_CONNECTIVITY" }, (res) => {
    if (!res) return;
    realStatusEl.textContent = res.isOnline ? "ONLINE" : "OFFLINE";
    realStatusEl.className = "stat-value " + (res.isOnline ? "online" : "offline");
  });
}

// --- Boss key: type 'modiji' anywhere to skip the game ---
(function () {
  const SEQ = ["m", "o", "d", "i", "j", "i"];
  let pos = 0;
  let timer = null;

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === SEQ[pos]) {
      pos++;
      clearTimeout(timer);
      if (pos === SEQ.length) {
        pos = 0;
        handleWin();
        return;
      }
      // Reset if no key within 2 s
      timer = setTimeout(() => { pos = 0; }, 2000);
    } else {
      pos = 0;
    }
  });
})();

init();
