firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const params   = new URLSearchParams(window.location.search);
const roomCode = params.get('room') || sessionStorage.getItem('roomCode');
const mySlot   = sessionStorage.getItem('playerSlot') || 'p1';

if (!roomCode) { window.location.href = 'index.html'; }

const gameRef   = db.ref(`games/${roomCode}`);
let   gameState = null;
let   pendingWild = null;
let   busy        = false;   // blocks double-taps while a move is saving
let   lastTopId   = null;
let   winShown    = false;

// ─ Helpers ────────────────────────────────────────────────────

// Firebase deletes empty lists and can turn lists into objects.
// This always hands back a real list so the game never crashes on an empty pile.
function arr(x) {
  if (Array.isArray(x)) return x.filter(Boolean);
  if (x && typeof x === 'object') return Object.values(x).filter(Boolean);
  return [];
}

function sym(card) {
  switch (card.type) {
    case 'number':         return String(card.value);
    case 'skip':           return '⊘';
    case 'reverse':        return '⇄';
    case 'draw_two':       return '+2';
    case 'wild':           return '★';
    case 'wild_draw_four': return '+4';
    default:               return '?';
  }
}

function label(card) {
  const s = sym(card);
  const names = { skip: 'Skip', reverse: 'Reverse', draw_two: 'Draw 2', wild: 'Wild', wild_draw_four: 'Wild +4' };
  if (card.color === 'wild') return names[card.type];
  const what = card.type === 'number' ? s : names[card.type];
  return `${card.color} ${what}`;
}

function canPlay(card, top, color) {
  if (!top) return true;
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

// ─ Turn order ─────────────────────────────────────────────────
// order = seats in the order they joined; direction = 1 or -1 (Reverse flips it).
// Older 2-player games have no order saved, so fall back to their seats.
function seatOrder(s) {
  const o = arr(s.order);
  return o.length ? o : Object.keys(s.players || {}).sort();
}
function seatAfter(s, seat, steps = 1, dir = s.direction || 1) {
  const o = seatOrder(s);
  const n = o.length;
  const i = o.indexOf(seat);
  return o[(((i + dir * steps) % n) + n) % n];
}

function countText(n) {
  if (n === 1) return 'UNO!';
  return `${n} cards`;
}

// ─ Card DOM ───────────────────────────────────────────────────

function cardInner(card) {
  const s = sym(card);
  return `
    <span class="card-oval"></span>
    <span class="card-value">${s}</span>
    <span class="card-corner tl">${s}</span>
    <span class="card-corner br">${s}</span>
  `;
}

function buildCard(card, { clickable = false, dimmed = false } = {}) {
  const el = document.createElement('div');
  el.className = `card card-${card.color}${dimmed ? ' dimmed' : ''}`;
  el.innerHTML = cardInner(card);
  if (clickable) {
    el.setAttribute('role', 'button');
    el.addEventListener('click', () => onCardClick(card));
  }
  return el;
}

function buildFaceDown() {
  const el = document.createElement('div');
  el.className = 'card-fd';
  return el;
}

function setAvatar(imgEl, avatar) {
  if (imgEl.dataset.avatar === avatar) return;   // don't reload the image every update
  imgEl.dataset.avatar = avatar;
  imgEl.src = `images/avatars/${avatar}.jpg`;
  imgEl.onerror = () => {
    imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = `images/avatars/${avatar}.svg`; };
    imgEl.src = `images/avatars/${avatar}.png`;
  };
}

// Size my cards so the whole hand fits on screen in at most 3 rows — no sideways scrolling
function sizeHand(n) {
  const handEl = document.getElementById('myHand');
  const availW = Math.min(handEl.clientWidth || window.innerWidth - 20, 560);
  const gap    = 6;
  const rows   = n <= 5 ? 1 : n <= 12 ? 2 : 3;
  const perRow = Math.max(1, Math.ceil(n / rows));
  const w      = Math.floor((availW - (perRow - 1) * gap) / perRow);
  handEl.style.setProperty('--card-w', `${Math.max(40, Math.min(w, 84))}px`);
}

// Everyone else, listed in the order their turns come after mine.
// One opponent: the big strip with a fan of cards. Two or more: a row of tiles.
function renderOpponents(state, playing) {
  const hands  = state.hands || {};
  const o      = seatOrder(state);
  const others = [];
  for (let k = 1; k < o.length; k++) others.push(seatAfter(state, mySlot, k, 1));
  const box = document.getElementById('opponents');
  box.innerHTML = '';
  box.className = others.length > 1 ? 'opponents many' : 'opponents';

  others.forEach(seat => {
    const p = state.players[seat];
    if (!p) return;
    const n      = arr(hands[seat]).length;
    const active = playing && state.currentPlayer === seat;

    if (others.length === 1) {
      const info = document.createElement('div');
      info.className = `player-info${active ? ' active' : ''}`;
      info.innerHTML = '<img class="player-avatar" alt=""><span class="player-name"></span><span class="card-count"></span>';
      setAvatar(info.querySelector('img'), p.avatar);
      info.querySelector('.player-name').textContent = p.name;
      const c = info.querySelector('.card-count');
      c.textContent = countText(n); c.classList.toggle('uno', n === 1);
      const fan = document.createElement('div');
      fan.className = 'opp-hand';
      for (let i = 0; i < n; i++) fan.appendChild(buildFaceDown());
      box.append(info, fan);
    } else {
      const tile = document.createElement('div');
      tile.className = `opp-tile${active ? ' active' : ''}`;
      tile.innerHTML = '<img class="player-avatar" alt=""><span class="opp-name"></span><span class="card-count"></span>';
      setAvatar(tile.querySelector('img'), p.avatar);
      tile.querySelector('.opp-name').textContent = p.name;
      const c = tile.querySelector('.card-count');
      c.textContent = countText(n); c.classList.toggle('uno', n === 1);
      box.appendChild(tile);
    }
  });

  // Which way turns are going (only matters with 3+ players)
  const dirEl = document.getElementById('turnDir');
  if (dirEl) {
    dirEl.classList.toggle('hidden', o.length < 3);
    dirEl.textContent = (state.direction || 1) === 1 ? 'Turns go ➜' : '⬅ Turns go';
  }
}

// ─ Render ─────────────────────────────────────────────────────

function renderGame(state) {
  gameState = state;
  if (!state || !state.players || !state.players[mySlot]) return;

  const playing  = state.state === 'playing';
  const isMyTurn = state.currentPlayer === mySlot && playing;
  const me       = state.players[mySlot];
  const hands    = state.hands || {};
  const myHand   = arr(hands[mySlot]);
  const discard  = arr(state.discardPile);
  const top      = discard[discard.length - 1];
  const color    = state.currentColor;

  // Player strips
  document.getElementById('myName').textContent = me.name;
  setAvatar(document.getElementById('myAvatar'), me.avatar);
  const myCount = document.getElementById('myCount');
  myCount.textContent = countText(myHand.length);
  myCount.classList.toggle('uno', myHand.length === 1);
  document.getElementById('myInfo').classList.toggle('active', isMyTurn);

  renderOpponents(state, playing);

  // Top of the muddy puddle
  const topEl = document.getElementById('topCard');
  if (top) {
    const chosen = top.color === 'wild' && color ? ` chosen-${color}` : '';
    topEl.className = `card card-${top.color}${chosen}`;
    topEl.innerHTML = cardInner(top);
    if (lastTopId !== null && lastTopId !== top.id) {
      topEl.classList.add('just-played');
    }
    lastTopId = top.id;
  }

  // My hand
  sizeHand(myHand.length);
  const myHandEl = document.getElementById('myHand');
  myHandEl.innerHTML = '';
  let anyPlayable = false;
  myHand.forEach(card => {
    const playable = isMyTurn && canPlay(card, top, color);
    if (playable) anyPlayable = true;
    const el = buildCard(card, { clickable: playable, dimmed: isMyTurn && !playable });
    if (playable) el.classList.add('playable');
    myHandEl.appendChild(el);
  });

  // Turn banner — always says whose turn it is; the last move goes underneath
  const bar  = document.getElementById('statusBar');
  const main = document.getElementById('statusMain');
  const sub  = document.getElementById('statusSub');
  bar.classList.toggle('my-turn', isMyTurn);
  if (state.state === 'waiting') {
    main.textContent = 'Waiting for the other player…';
    sub.textContent  = '';
  } else if (state.state === 'finished') {
    main.textContent = 'Game over!';
    sub.textContent  = state.lastAction || '';
  } else if (isMyTurn) {
    main.textContent = getSkin().yourTurn(me.name);
    sub.textContent  = anyPlayable
      ? 'Tap a shiny card to play it'
      : 'No match — tap the Draw pile!';
  } else {
    const cur = state.players[state.currentPlayer];
    main.textContent = `${cur ? cur.name : 'Other player'}'s turn…`;
    sub.textContent  = state.lastAction || '';
  }
  if (isMyTurn && state.lastAction && anyPlayable) {
    sub.textContent = state.lastAction;
  }

  // Draw pile
  const drawEl = document.getElementById('drawPile');
  drawEl.classList.toggle('clickable-pile', isMyTurn);
  drawEl.classList.toggle('pulse', isMyTurn && !anyPlayable);
  drawEl.onclick = isMyTurn ? onDrawClick : null;

  // Win check
  if (state.winner && !winShown) showWin(state.winner, state.players);
}

window.addEventListener('resize', () => { if (gameState) renderGame(gameState); });

// ─ Play card ──────────────────────────────────────────────────

function onCardClick(card) {
  if (busy || !gameState || gameState.currentPlayer !== mySlot || gameState.state !== 'playing') return;
  const discard = arr(gameState.discardPile);
  const top     = discard[discard.length - 1];
  if (!canPlay(card, top, gameState.currentColor)) return;

  if (card.type === 'wild' || card.type === 'wild_draw_four') {
    pendingWild = card;
    document.getElementById('colorOverlay').classList.remove('hidden');
  } else {
    doPlay(card, null);
  }
}

async function doPlay(card, chosenColor) {
  busy = true;
  try {
    const s        = gameState;
    const hands    = s.hands || {};
    const myHand   = arr(hands[mySlot]).filter(c => c.id !== card.id);
    let drawPile   = arr(s.drawPile);
    let discard    = [...arr(s.discardPile), card];
    const newColor = card.color === 'wild' ? chosenColor : card.color;
    const myName   = s.players[mySlot].name;
    const players  = seatOrder(s).length;
    let   dir      = s.direction || 1;

    let nextPlayer = seatAfter(s, mySlot, 1, dir);
    let action     = `${myName} played ${label(card)}`;
    const upd      = {};

    // Skip: jump over the next player (with 2 players, that means I go again)
    if (card.type === 'skip') {
      const skipped = s.players[seatAfter(s, mySlot, 1, dir)].name;
      nextPlayer = seatAfter(s, mySlot, 2, dir);
      action    += nextPlayer === mySlot ? ` — ${myName} goes again!` : ` — ${skipped} is skipped!`;
    }

    // Reverse: flip direction. With 2 players it works like Skip.
    if (card.type === 'reverse') {
      if (players === 2) {
        nextPlayer = mySlot;
        action    += ` — ${myName} goes again!`;
      } else {
        dir        = -dir;
        upd.direction = dir;
        nextPlayer = seatAfter(s, mySlot, 1, dir);
        action    += ' — turns switch direction!';
      }
    }

    // Draw Two / Wild Draw Four: next player draws and loses their turn
    const give = card.type === 'draw_two' ? 2 : card.type === 'wild_draw_four' ? 4 : 0;
    if (give) {
      const victim     = seatAfter(s, mySlot, 1, dir);
      const victimHand = arr(hands[victim]);
      for (let i = 0; i < give; i++) {
        const r = refill(drawPile, discard);
        drawPile = r.drawPile; discard = r.discardPile;
        if (drawPile.length) victimHand.push(drawPile.shift());
      }
      upd[`hands/${victim}`] = victimHand;
      nextPlayer = seatAfter(s, mySlot, 2, dir);
      action    += ` — ${s.players[victim].name} draws ${give}!`;
    }

    if (card.color === 'wild') action += ` Color is ${newColor}.`;

    upd[`hands/${mySlot}`] = myHand;
    upd.discardPile        = discard;
    upd.drawPile           = drawPile;
    upd.currentColor       = newColor;
    upd.lastAction         = action;

    if (myHand.length === 0) {
      upd.winner        = mySlot;
      upd.state         = 'finished';
      upd.currentPlayer = mySlot;
    } else {
      upd.currentPlayer = nextPlayer;
    }

    await gameRef.update(upd);
  } finally {
    busy = false;
  }
}

async function onDrawClick() {
  const s = gameState;
  if (busy || !s || s.currentPlayer !== mySlot || s.state !== 'playing') return;
  busy = true;
  try {
    const r = refill(arr(s.drawPile), arr(s.discardPile));
    const drawPile = r.drawPile;
    const discard  = r.discardPile;
    const myHand   = arr((s.hands || {})[mySlot]);
    const myName   = s.players[mySlot].name;

    // No cards left anywhere: just pass the turn so the game can't get stuck
    if (!drawPile.length) {
      await gameRef.update({ currentPlayer: seatAfter(s, mySlot), lastAction: `${myName} passed — no cards left to draw` });
      return;
    }

    myHand.push(drawPile.shift());
    await gameRef.update({
      [`hands/${mySlot}`]: myHand,
      drawPile,
      discardPile:   discard,
      currentPlayer: seatAfter(s, mySlot),
      lastAction:    `${myName} drew a card`
    });
  } finally {
    busy = false;
  }
}

// ─ Color picker ───────────────────────────────────────────────

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('colorOverlay').classList.add('hidden');
    if (pendingWild) { const c = pendingWild; pendingWild = null; doPlay(c, btn.dataset.color); }
  });
});

// ─ Win screen ─────────────────────────────────────────────────

function confetti() {
  const colors = ['#F2464B', '#FFC928', '#3FB950', '#3B8BEB', '#FF7EB6'];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    c.style.animationDelay = `${Math.random() * .8}s`;
    c.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5500);
  }
}

function showWin(winSlot, players) {
  winShown = true;
  const isMe   = winSlot === mySlot;
  const winner = players[winSlot] || { name: 'Other player', avatar: 'peppa' };
  setAvatar(document.getElementById('winAvatar'), winner.avatar);
  document.getElementById('winMsg').textContent = isMe ? 'You win! 🎉' : `${winner.name} wins!`;
  document.getElementById('winSub').textContent = isMe ? getSkin().winSub : getSkin().loseSub;
  document.getElementById('winOverlay').classList.remove('hidden');
  confetti();
}

document.getElementById('playAgainBtn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

// ─ Firebase listener ──────────────────────────────────────────

gameRef.on('value', snap => {
  if (!snap.exists()) { window.location.href = 'index.html'; return; }
  renderGame(snap.val());
});
