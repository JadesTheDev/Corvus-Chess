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

let game = new Chess();
let humanColor = 'w';
let selected = null;
let legalTargets = [];
let thinking = false;
let lastQuip = 'Your move, bird.';
let lastMove = null;
let retryAvailable = false;

function squareOrder() {
  const ranks = humanColor === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const files = humanColor === 'w' ? ['a','b','c','d','e','f','g','h'] : ['h','g','f','e','d','c','b','a'];
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

function render() {
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

  undoBtn.disabled = thinking || game.history().length < 2;
  swapBtn.disabled = thinking;
  newGameBtn.disabled = thinking;
  retryBtn.hidden = !retryAvailable;
  retryBtn.disabled = thinking;
  thinkingIndicator.classList.toggle('on', thinking);

  let status;
  if (game.isCheckmate()) {
    status = `${game.turn() === 'w' ? 'White' : 'Black'} is checkmated.`;
  } else if (game.isDraw()) {
    status = 'Draw.';
  } else if (game.isCheck()) {
    status = `${game.turn() === 'w' ? 'White' : 'Black'} is in check.`;
  } else {
    status = `${game.turn() === 'w' ? 'White' : 'Black'} to move.`;
  }

  statusText.textContent = status;
  turnPill.textContent = game.isGameOver()
    ? 'Game over'
    : thinking
      ? 'Corvus is thinking…'
      : humanTurn
        ? 'Your move'
        : 'Corvus to move';

  statusDot.classList.toggle('danger', game.isCheck());
  corvusSays.textContent = `Corvus: “${lastQuip}”`;
}

function clearSelection() {
  selected = null;
  legalTargets = [];
}

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
  if (!candidates.length) {
    clearSelection();
    render();
    return;
  }

  let promotion;
  if (candidates.some((move) => move.promotion)) promotion = await choosePromotion();

  const from = selected;
  try {
    game.move({ from, to: square, promotion });
    lastMove = { from, to: square };
  } catch {
    clearSelection();
    render();
    return;
  }

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
        humanName: 'Lastivka'
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
  lastMove = null;
  lastQuip = humanColor === 'w' ? 'Your move, bird.' : 'I get first blood this time.';
  render();
  if (humanColor === 'b') corvusMove();
}

newGameBtn.addEventListener('click', resetGame);
swapBtn.addEventListener('click', () => {
  humanColor = humanColor === 'w' ? 'b' : 'w';
  resetGame();
});
undoBtn.addEventListener('click', () => {
  if (thinking) return;
  game.undo();
  game.undo();
  clearSelection();
  retryAvailable = false;
  lastMove = null;
  lastQuip = 'Fine. We pretend those two moves never happened.';
  render();
});
retryBtn.addEventListener('click', corvusMove);

render();
