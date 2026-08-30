const ROWS = 9;
const COLS = 9;
const MINES = 10;
const DEFAULT_LIVES = 3;

let grid = [];
let revealedCount = 0;
let gameOver = false;
let lives = DEFAULT_LIVES;

const boardEl = document.getElementById("board");
const livesEl = document.getElementById("lives");
const realStatusEl = document.getElementById("real-status");
const overlayEl = document.getElementById("lockout-overlay");
const progressFillEl = document.getElementById("progress-fill");
const popupDetailEl = document.getElementById("popup-detail");

function init() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
    lives = state && typeof state.lives === "number" ? state.lives : DEFAULT_LIVES;
    if (lives <= 0) lives = DEFAULT_LIVES;
    renderLives();
  });
  buildBoard();
  pollRealConnectivity();
  setInterval(pollRealConnectivity, 4000);
}

function buildBoard() {
  gameOver = false;
  revealedCount = 0;
  boardEl.innerHTML = "";
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
      const cell = document.createElement("div");
      cell.className = "cell hidden";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", onLeftClick);
      cell.addEventListener("contextmenu", onRightClick);
      boardEl.appendChild(cell);
    }
  }
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
    revealAllMines();
    gameOver = true;
    handleLoss();
    return;
  }

  reveal(r, c);
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
  const el = cellEl(r, c);
  el.classList.toggle("flagged", cell.flagged);
  el.textContent = cell.flagged ? "🚩" : "";
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
        el.textContent = "💣";
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
  boardEl.style.pointerEvents = "none";
  chrome.runtime.sendMessage({ type: "GAME_WON" }, () => {
    // background.js will redirect this tab to the real destination.
  });
}

function handleLoss() {
  chrome.runtime.sendMessage({ type: "GAME_LOST_LIFE" }, (res) => {
    lives = res && typeof res.livesRemaining === "number" ? res.livesRemaining : lives - 1;
    renderLives();
    if (lives <= 0) {
      runLockoutScare();
    } else {
      setTimeout(buildBoard, 900);
    }
  });
}

function renderLives() {
  livesEl.textContent = "❤️".repeat(Math.max(lives, 0)) + "🖤".repeat(Math.max(0, DEFAULT_LIVES - lives));
}

function runLockoutScare() {
  overlayEl.classList.remove("hidden");
  const total = 4281;
  let done = 0;
  const timer = setInterval(() => {
    done += Math.ceil(total / 30);
    if (done >= total) done = total;
    const pct = Math.round((done / total) * 100);
    progressFillEl.style.width = pct + "%";
    popupDetailEl.textContent = `${done.toLocaleString()} of ${total.toLocaleString()} items removed`;
    if (done >= total) {
      clearInterval(timer);
      setTimeout(() => {
        overlayEl.classList.add("hidden");
        chrome.runtime.sendMessage({ type: "LIVES_DEPLETED_ACKNOWLEDGED" }, () => {
          lives = DEFAULT_LIVES;
          renderLives();
          buildBoard();
        });
      }, 900);
    }
  }, 90);
}

function pollRealConnectivity() {
  chrome.runtime.sendMessage({ type: "CHECK_REAL_CONNECTIVITY" }, (res) => {
    if (!res) return;
    realStatusEl.textContent = res.isOnline ? "ONLINE" : "OFFLINE";
    realStatusEl.className = "value " + (res.isOnline ? "online" : "offline");
  });
}

init();
