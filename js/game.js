firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const params   = new URLSearchParams(window.location.search);
const roomCode = params.get('room') || sessionStorage.getItem('roomCode');
const mySlot   = sessionStorage.getItem('playerSlot') || 'p1';
const oppSlot  = mySlot === 'p1' ? 'p2' : 'p1';

if (!roomCode) { window.location.href = 'index.html'; }

const gameRef   = db.ref(`games/${roomCode}`);
let   gameState = null;
let   pendingWild = null;

// ─ Helpers ────────────────────────────────────────────────────

function sym(card) {
  switch (card.type) {
    case 'number':         return String(card.value);
    case 'skip':           return '⊘';
    case 'reverse':        return '↺';
    case 'draw_two':       return '+2';
    case 'wild':           return '★';
    case 'wild_draw_four': return '+4';
    default:               return '?';
  }
}

function label(card) {
  const s = sym(card);
  return card.color === 'wild' ? `Wild ${s}` : `${card.color} ${s}`;
}

function canPlay(card, top, color) {
  if (card.type === 'wild' || card.type === 'wild_draw_four') return true;
  if (card.color === color)  return true;
  if (card.type === 'number' && top.type === 'number' && card.value === top.value) return true;
  if (card.type !== 'number' && card.type === top.type)  return true;
  return false;
}

// Reshuffle discard into draw when draw pile empties
function refill(drawPile, discardPile) {
  if (drawPile.length > 0 || discardPile.length <= 1) return { drawPile, discardPile };
  const top  = discardPile[discardPile.length - 1];
  const rest = shuffle(discardPile.slice(0, -1));
  return { drawPile: rest, discardPile: [top] };
}

// ─ Card DOM ───────────────────────────────────────────────

function buildCard(card, { clickable = false, dimmed = false } = {}) {
  const el = document.createElement('div');
  const s  = sym(card);
  el.className = `card card-${card.color}${dimmed ? ' dimmed' : ''}`;
  el.innerHTML = `
    <span class="card-corner tl">${s}</span>
    <span class="card-value">${s}</span>
    <span class="card-corner br">${s}</span>
  `;
  if (clickable) el.addEventListener('click', () => onCardClick(card));
  return el;
}

function buildFaceDown() {
  const el = document.createElement('div');
  el.className = 'card-fd';
  return el;
}

function avatarSrc(avatar) {
  // Prefer PNG (AI art) with SVG fallback
  return `images/avatars/${avatar}.png`;
}

function setAvatar(imgEl, avatar) {
  imgEl.src = avatarSrc(avatar);
  imgEl.onerror = () => { imgEl.src = `images/avatars/${avatar}.svg`; imgEl.onerror = null; };
}

// ─ Render ────────────────────────────────────────────────

function renderGame(state) {
  gameState = state;
  if (!state || !state.players || !state.players[mySlot]) return;

  const isMyTurn = state.currentPlayer === mySlot && state.state === 'playing';
  const me       = state.players[mySlot];
  const opp      = state.players[oppSlot];
  const myHand   = (state.hands && state.hands[mySlot])  || [];
  const oppHand  = (state.hands && state.hands[oppSlot]) || [];
  const discard  = state.discardPile || [];
  const top      = discard[discard.length - 1];
  const color    = state.currentColor;

  // Player info
  document.getElementById('myName').textContent  = me.name;
  setAvatar(document.getElementById('myAvatar'), me.avatar);
  document.getElementById('myCount').textContent =
    `🃏 ${myHand.length}${myHand.length === 1 ? ' · UNO!' : ''}`;

  if (opp) {
    document.getElementById('oppName').textContent  = opp.name;
    setAvatar(document.getElementById('oppAvatar'), opp.avatar);
    document.getElementById('oppCount').textContent =
      `🃏 ${oppHand.length}${oppHand.length === 1 ? ' · UNO!' : ''}`;
  }

  // Opponent face-down cards
  const oppHandEl = document.getElementById('oppHand');
  oppHandEl.innerHTML = '';
  oppHand.forEach(() => oppHandEl.appendChild(buildFaceDown()));

  // Top discard card
  const topEl = document.getElementById('topCard');
  if (top) {
    const displayColor = (top.color === 'wild' && color) ? color : top.color;
    const s = sym(top);
    topEl.className = `card pile-card card-${displayColor}`;
    topEl.innerHTML = `
      <span class="card-corner tl">${s}</span>
      <span class="card-value">${s}</span>
      <span class="card-corner br">${s}</span>
    `;
  }

  // My hand
  const myHandEl = document.getElementById('myHand');
  myHandEl.innerHTML = '';
  document.getElementById('myArea').className = `my-area ${isMyTurn ? 'my-turn' : 'not-my-turn'}`;

  myHand.forEach(card => {
    const playable = isMyTurn && canPlay(card, top, color);
    const el = buildCard(card, { clickable: playable, dimmed: isMyTurn && !playable });
    if (playable) el.classList.add('playable');
    myHandEl.appendChild(el);
  });

  // Status bar
  const bar = document.getElementById('statusBar');
  if (state.state === 'waiting') {
    bar.textContent = 'Waiting for the other player…';
  } else if (state.lastAction) {
    bar.textContent = state.lastAction;
  } else {
    bar.textContent = isMyTurn ? 'Your turn! 🐷' : `${opp ? opp.name + "'s" : "Other player's"} turn…`;
  }

  // Draw pile tap
  const drawEl = document.getElementById('drawPile');
  if (isMyTurn) {
    drawEl.classList.add('clickable-pile');
    drawEl.onclick = onDrawClick;
  } else {
    drawEl.classList.remove('clickable-pile');
    drawEl.onclick = null;
  }

  // Win check
  if (state.winner) showWin(state.winner, state.players);
}

// ─ Play card ─────────────────────────────────────────────

function onCardClick(card) {
  if (!gameState || gameState.currentPlayer !== mySlot || gameState.state !== 'playing') return;
  const top   = gameState.discardPile[gameState.discardPile.length - 1];
  if (!canPlay(card, top, gameState.currentColor)) return;

  if (card.type === 'wild' || card.type === 'wild_draw_four') {
    pendingWild = card;
    document.getElementById('colorOverlay').classList.remove('hidden');
  } else {
    doPlay(card, null);
  }
}

async function doPlay(card, chosenColor) {
  const s       = gameState;
  const myHand  = s.hands[mySlot].filter(c => c.id !== card.id);
  let drawPile  = [...s.drawPile];
  let discard   = [...s.discardPile, card];
  const newColor = card.color === 'wild' ? chosenColor : card.color;

  let nextPlayer = oppSlot;
  let action     = `${s.players[mySlot].name} played ${label(card)}`;
  const upd      = {};

  // Skip / Reverse (2-player reverse = skip)
  if (card.type === 'skip' || card.type === 'reverse') {
    nextPlayer = mySlot;
    action    += ' — skip! Go again 🐷';
  }

  // Draw Two: auto-give opponent 2 cards, skip their turn
  if (card.type === 'draw_two') {
    const oppHand = [...s.hands[oppSlot]];
    for (let i = 0; i < 2; i++) {
      const r = refill(drawPile, discard);
      drawPile = r.drawPile; discard = r.discardPile;
      if (drawPile.length) oppHand.push(drawPile.shift());
    }
    upd[`hands/${oppSlot}`] = oppHand;
    nextPlayer = mySlot;
    action    += ` — ${s.players[oppSlot].name} draws 2 & skips!`;
  }

  // Wild Draw Four: auto-give opponent 4 cards, skip their turn
  if (card.type === 'wild_draw_four') {
    const oppHand = [...s.hands[oppSlot]];
    for (let i = 0; i < 4; i++) {
      const r = refill(drawPile, discard);
      drawPile = r.drawPile; discard = r.discardPile;
      if (drawPile.length) oppHand.push(drawPile.shift());
    }
    upd[`hands/${oppSlot}`] = oppHand;
    nextPlayer = mySlot;
    action    += ` — ${s.players[oppSlot].name} draws 4 & skips!`;
  }

  upd[`hands/${mySlot}`] = myHand;
  upd.discardPile        = discard;
  upd.drawPile           = drawPile;
  upd.currentColor       = newColor;
  upd.lastAction         = action;

  if (myHand.length === 0) {
    upd.winner = mySlot;
    upd.state  = 'finished';
    upd.currentPlayer = mySlot;
  } else {
    upd.currentPlayer = nextPlayer;
  }

  await gameRef.update(upd);
}

async function onDrawClick() {
  const s = gameState;
  if (!s || s.currentPlayer !== mySlot || s.state !== 'playing') return;

  const r = refill([...s.drawPile], [...s.discardPile]);
  let drawPile = r.drawPile;
  let discard  = r.discardPile;
  if (!drawPile.length) return;

  const myHand = [...s.hands[mySlot]];
  myHand.push(drawPile.shift());

  await gameRef.update({
    [`hands/${mySlot}`]: myHand,
    drawPile,
    discardPile:   discard,
    currentPlayer: oppSlot,
    lastAction:    `${s.players[mySlot].name} drew a card`
  });
}

// ─ Color picker ─────────────────────────────────────────

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('colorOverlay').classList.add('hidden');
    if (pendingWild) { doPlay(pendingWild, btn.dataset.color); pendingWild = null; }
  });
});

// ─ Win screen ──────────────────────────────────────────

function showWin(winSlot, players) {
  const isMe = winSlot === mySlot;
  const name = players[winSlot] ? players[winSlot].name : 'Other player';
  document.getElementById('winMsg').textContent  = isMe ? '🎉 You Win!' : `${name} Wins!`;
  document.getElementById('winSub').textContent  = isMe ? 'Oink oink! 🐷' : 'Better luck next time 🐷';
  document.getElementById('winOverlay').classList.remove('hidden');
}

document.getElementById('playAgainBtn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

// ─ Firebase listener ────────────────────────────────────

gameRef.on('value', snap => {
  if (!snap.exists()) { window.location.href = 'index.html'; return; }
  renderGame(snap.val());
});
