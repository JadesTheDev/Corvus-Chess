import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const moveListEl = $('moveList');
const statusText = $('statusText');
const turnPill = $('turnPill');
const corvusSays = $('corvusSays');
const moveCount = $('moveCount');
const humanColorLabel = $('humanColor');
const aiColorLabel = $('aiColor');
const humanRatingLabel = $('humanRating');
const aiRatingLabel = $('aiRating');
const ratingBadge = $('ratingBadge');
const ratingText = $('ratingText');
const ratingRange = $('ratingRange');
const placementProgress = $('placementProgress');
const placementFill = $('placementFill');
const placementBtn = $('placementBtn');
const promotionDialog = $('promotionDialog');
const undoBtn = $('undoBtn');
const swapBtn = $('swapBtn');
const newGameBtn = $('newGameBtn');
const retryBtn = $('retryBtn');
const fileCoords = $('fileCoords');
const statusDot = $('statusDot');
const thinkingIndicator = $('thinkingIndicator');

const pieces = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
};

const PLACEMENT_GAMES = 5;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round100 = (n) => Math.round(n / 100) * 100;

let game = new Chess();
let humanColor = 'w';
let selected = null;
let legalTargets = [];
let thinking = false;
let lastQuip = 'Your move, bird.';
let lastMove = null;
let retryAvailable = false;
let resultRecorded = false;
let placement = loadPlacement();

function loadPlacement() {
  try {
    const saved = JSON.parse(localStorage.getItem('corvusEloPlacement') || 'null');
    if (saved && Number.isFinite(saved.rating) && Number.isFinite(saved.games)) return saved;
  } catch {}
  return { active: false, rating: 1000, games: 0, wins: 0, draws: 0, losses: 0, complete: false };
}

function savePlacement() {
  localStorage.setItem('corvusEloPlacement', JSON.stringify(placement));
}

function currentOpponentRating() {
  if (!placement.active && !placement.complete) return 1000;
  return clamp(round100(placement.rating), 600, 2400);
}

function eloExpected(player, opponent) {
  return 1 / (1 + Math.pow(10, (opponent - player) / 400));
}

function eloLabel(rating) {
  if (rating < 800) return 'Beginner';
  if (rating < 1000) return 'Developing';
  if (rating < 1200) return 'Casual';
  if (rating < 1400) return 'Club';
  if (rating < 1600) return 'Intermediate';
  if (rating < 1800) return 'Strong club';
  if (rating < 2000) return 'Advanced';
  if (rating < 2200) return 'Expert';
  if (rating < 2400) return 'Master-level';
  return 'Very strong';
}

function recordPlacementResult() {
  if (resultRecorded || !placement.active || !game.isGameOver()) return;
  resultRecorded = true;

  let score = 0.5;
  if (game.isCheckmate()) {
    const loser = game.turn();
    score = loser === humanColor ? 0 : 1;
  }

  const opponent = currentOpponentRating();
  const expected = eloExpected(placement.rating, opponent);
  const k = 160;
  placement.rating = clamp(Math.round(placement.rating + k * (score - expected)), 400, 2600);
  placement.games += 1;
  if (score === 1) placement.wins += 1;
  else if (score === 0) placement.losses += 1;
  else placement.draws += 1;

  if (placement.games >= PLACEMENT_GAMES) {
    placement.active = false;
    placement.complete = true;
    lastQuip = `Placement complete. I make you about ${placement.rating} Elo. For now.`;
  } else {
    lastQuip = `Placement game ${placement.games} recorded. Next opponent: roughly ${currentOpponentRating()} Elo.`;
  }
  savePlacement();
}

function squareOrder() {
  const ranks = humanColor === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const files = humanColor === 'w' ? ['a','b','c','d','e','f','g','h'] : ['h','g','f','e','d','c','b','a'];
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

function render() {
  recordPlacementResult();
  boardEl.innerHTML = '';

  for (const square of squareOrder()) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `square ${(file + rank) % 2 ? 'light' : 'dark'}`;
    el.setAttribute('aria-label', square);

    if (selected === square) el.classList.add('selected');
    if (lastMove?.from === square) el.classList.add('last-from');
    if (lastMove?.to === square) el.classList.add('last-to');

    const target = legalTargets.find((move) => move.to === square);
    if (target) el.classList.add(target.captured ? 'capture' : 'legal');

    const piece = game.get(square);
    if (piece) {
      const span = document.createElement('span');
      span.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
      span.textContent = pieces[piece.color + piece.type];
      el.appendChild(span);
    }

    el.addEventListener('click', () => onSquareClick(square));
    boardEl.appendChild(el);
  }

  const files = humanColor === 'w' ? 'abcdefgh' : 'hgfedcba';
  fileCoords.innerHTML = [...files].map((file) => `<span>${file}</span>`).join('');
  renderHistory();
  renderStatus();
  renderRating();
}

function renderRating() {
  const opponent = currentOpponentRating();
  aiRatingLabel.textContent = `${opponent} Elo`;
  placementProgress.textContent = `${placement.games} / ${PLACEMENT_GAMES} games`;
  placementFill.style.width = `${Math.min(100, placement.games / PLACEMENT_GAMES * 100)}%`;

  if (placement.complete) {
    const spread = 100;
    ratingBadge.textContent = `${placement.rating}`;
    humanRatingLabel.textContent = `~${placement.rating} Elo`;
    ratingText.textContent = `Estimated Elo: ${placement.rating} · ${eloLabel(placement.rating)}. Record: ${placement.wins}-${placement.draws}-${placement.losses}.`;
    ratingRange.textContent = `~${clamp(placement.rating - spread, 100, 3000)}–${placement.rating + spread}`;
    placementBtn.textContent = 'Retake placement';
  } else if (placement.active) {
    const spread = Math.max(150, 350 - placement.games * 45);
    ratingBadge.textContent = 'Provisional';
    humanRatingLabel.textContent = `~${placement.rating} provisional`;
    ratingText.textContent = `Current estimate: about ${placement.rating} Elo. Corvus adapts after every completed game.`;
    ratingRange.textContent = `~${clamp(placement.rating - spread, 100, 3000)}–${placement.rating + spread}`;
    placementBtn.textContent = 'Reset placement';
  } else {
    ratingBadge.textContent = 'Unrated';
    humanRatingLabel.textContent = 'Unrated';
    ratingText.textContent = 'Play a 5-game placement set and Corvus will estimate your rating.';
    ratingRange.textContent = '—';
    placementBtn.textContent = 'Start placement';
  }
}

function renderHistory() {
  const history = game.history();
  moveCount.textContent = `${history.length} ${history.length === 1 ? 'move' : 'moves'}`;
  if (!history.length) {
    moveListEl.innerHTML = '<p class="empty">No bloodshed yet.</p>';
    return;
  }
  let html = '';
  for (let i = 0; i < history.length; i += 2) {
    html += `<div class="move-row"><span>${i / 2 + 1}.</span><span>${history[i] || ''}</span><span>${history[i + 1] || ''}</span></div>`;
  }
  moveListEl.innerHTML = html;
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function renderStatus() {
  const humanTurn = game.turn() === humanColor;
  humanColorLabel.textContent = humanColor === 'w' ? 'White' : 'Black';
  aiColorLabel.textContent = humanColor === 'w' ? 'Black' : 'White';
  undoBtn.disabled = thinking || game.history().length < 2 || placement.active;
  swapBtn.disabled = thinking;
  newGameBtn.disabled = thinking;
  retryBtn.hidden = !retryAvailable;
  retryBtn.disabled = thinking;
  thinkingIndicator.classList.toggle('on', thinking);

  let status;
  if (game.isCheckmate()) status = `${game.turn() === 'w' ? 'White' : 'Black'} is checkmated.`;
  else if (game.isDraw()) status = 'Draw.';
  else if (game.isCheck()) status = `${game.turn() === 'w' ? 'White' : 'Black'} is in check.`;
  else status = `${game.turn() === 'w' ? 'White' : 'Black'} to move.`;

  statusText.textContent = status;
  turnPill.textContent = game.isGameOver() ? 'Game over' : thinking ? 'Corvus is thinking…' : humanTurn ? 'Your move' : 'Corvus to move';
  statusDot.classList.toggle('danger', game.isCheck());
  corvusSays.textContent = `Corvus: “${lastQuip}”`;
}

function clearSelection() { selected = null; legalTargets = []; }

async function choosePromotion() {
  return new Promise((resolve) => {
    promotionDialog.showModal();
    const handler = () => {
      promotionDialog.removeEventListener('close', handler);
      resolve(promotionDialog.returnValue || 'q');
    };
    promotionDialog.addEventListener('close', handler);
  });
}

async function onSquareClick(square) {
  if (thinking || game.isGameOver() || game.turn() !== humanColor) return;
  const piece = game.get(square);
  if (!selected) {
    if (piece?.color !== humanColor) return;
    selected = square;
    legalTargets = game.moves({ square, verbose: true });
    render();
    return;
  }
  if (piece?.color === humanColor) {
    selected = square;
    legalTargets = game.moves({ square, verbose: true });
    render();
    return;
  }
  const candidates = legalTargets.filter((move) => move.to === square);
  if (!candidates.length) { clearSelection(); render(); return; }
  let promotion;
  if (candidates.some((move) => move.promotion)) promotion = await choosePromotion();
  const from = selected;
  try {
    game.move({ from, to: square, promotion });
    lastMove = { from, to: square };
  } catch { clearSelection(); render(); return; }
  clearSelection();
  retryAvailable = false;
  lastQuip = 'Hm. Okay. I see what you’re doing.';
  render();
  if (!game.isGameOver()) await corvusMove();
}

async function corvusMove() {
  if (game.isGameOver() || game.turn() === humanColor) return;
  thinking = true;
  retryAvailable = false;
  render();
  try {
    const response = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: game.fen(),
        history: game.history(),
        humanName: 'Lastivka',
        targetElo: currentOpponentRating()
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Corvus could not move.');
    const from = data.move.slice(0, 2);
    const to = data.move.slice(2, 4);
    game.move({ from, to, promotion: data.move[4] });
    lastMove = { from, to };
    lastQuip = data.quip || `I played ${data.san}.`;
  } catch (error) {
    retryAvailable = true;
    lastQuip = `Tiny server gremlin: ${error.message}`;
  } finally {
    thinking = false;
    render();
  }
}

function resetGame() {
  game = new Chess();
  clearSelection();
  thinking = false;
  retryAvailable = false;
  resultRecorded = false;
  lastMove = null;
  lastQuip = humanColor === 'w' ? 'Your move, bird.' : 'I get first blood this time.';
  render();
  if (humanColor === 'b') corvusMove();
}

placementBtn.addEventListener('click', () => {
  placement = { active: true, rating: 1000, games: 0, wins: 0, draws: 0, losses: 0, complete: false };
  savePlacement();
  lastQuip = 'Five games. No take-backs. Let’s find out what you’re made of.';
  resetGame();
});

newGameBtn.addEventListener('click', resetGame);
swapBtn.addEventListener('click', () => { humanColor = humanColor === 'w' ? 'b' : 'w'; resetGame(); });
undoBtn.addEventListener('click', () => {
  if (thinking || placement.active) return;
  game.undo(); game.undo(); clearSelection(); retryAvailable = false; lastMove = null;
  lastQuip = 'Fine. We pretend those two moves never happened.';
  render();
});
retryBtn.addEventListener('click', corvusMove);

render();
