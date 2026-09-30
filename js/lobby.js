firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let selectedAvatar = null;
let waitingRef     = null;
let currentCode    = null;

// Remember name + character on this device (so nobody has to retype it every game)
function remember(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
function recall(key)        { try { return localStorage.getItem(key); } catch (e) { return null; } }

// ─ Avatar picker ──────────────────────────────────────────────
const grid = document.getElementById('avatarGrid');

function buildAvatarGrid() {
  grid.innerHTML = '';
  selectedAvatar = null;
  getSkin().characters.forEach(ch => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'avatar-opt';
    el.dataset.id = ch.id;
    const img = document.createElement('img');
    img.alt = ch.name;
    // Try JPG (custom art), then PNG, then SVG placeholder
    img.src = `images/avatars/${ch.id}.jpg`;
    img.onerror = () => {
      img.onerror = () => { img.onerror = null; img.src = `images/avatars/${ch.id}.svg`; };
      img.src = `images/avatars/${ch.id}.png`;
    };
    const span = document.createElement('span');
    span.textContent = ch.name;
    el.append(img, span);
    el.addEventListener('click', () => selectAvatar(ch.id));
    grid.appendChild(el);
  });
}

buildAvatarGrid();

function selectAvatar(id) {
  document.querySelectorAll('.avatar-opt').forEach(a => a.classList.toggle('sel', a.dataset.id === id));
  selectedAvatar = id;
  checkReady();
}

const nameInput = document.getElementById('playerName');
const roomInput = document.getElementById('roomInput');
const createBtn = document.getElementById('createBtn');
const joinBtn   = document.getElementById('joinBtn');

nameInput.addEventListener('input', checkReady);
roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  checkReady();
});

function checkReady() {
  const ok = nameInput.value.trim().length > 0 && !!selectedAvatar;
  createBtn.disabled = !ok;
  joinBtn.disabled   = !(ok && roomInput.value.trim().length === 4);
}

// Prefill from last time, and from an invite link (?join=ABCD)
const savedName   = recall('pu_name');
const savedAvatar = recall('pu_avatar');
if (savedName) nameInput.value = savedName;
if (savedAvatar && getSkin().characters.some(c => c.id === savedAvatar)) selectAvatar(savedAvatar);
const inviteCode = new URLSearchParams(location.search).get('join');
if (inviteCode) roomInput.value = inviteCode.toUpperCase().slice(0, 4);
checkReady();

// ─ Skin switch ────────────────────────────────────────────────
// Rebuilding the grid clears the selection, since the new skin has its own cast.
document.getElementById('skinToggle').addEventListener('click', () => {
  setSkin(nextSkinId());
  buildAvatarGrid();
  const saved = recall('pu_avatar');
  if (saved && getSkin().characters.some(c => c.id === saved)) selectAvatar(saved);
  checkReady();
});

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─ Players ────────────────────────────────────────────────────
// Each device gets its own random seat id, so two people joining at the same
// moment can never grab the same seat. Turn order = the order people joined.
const MAX_PLAYERS = 4;
let mySeat  = null;
let isHost  = false;

function seatId() {
  return 'p' + Math.random().toString(36).slice(2, 8);
}

function avatarImg(avatar) {
  const img = document.createElement('img');
  img.src = `images/avatars/${avatar}.jpg`;
  img.onerror = () => {
    img.onerror = () => { img.onerror = null; img.src = `images/avatars/${avatar}.svg`; };
    img.src = `images/avatars/${avatar}.png`;
  };
  return img;
}

function sortedSeats(players) {
  return Object.keys(players || {}).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
}

// ─ Waiting room ───────────────────────────────────────────────
function showWaiting(code) {
  currentCode = code;
  sessionStorage.setItem('playerSlot', mySeat);
  sessionStorage.setItem('roomCode',   code);
  document.getElementById('setupPanel').classList.add('hidden');
  document.getElementById('waitingPanel').classList.remove('hidden');
  document.getElementById('displayCode').textContent = code;
  document.getElementById('startBtn').classList.toggle('hidden', !isHost);

  waitingRef = db.ref(`games/${code}`);
  waitingRef.on('value', snap => {
    if (!snap.exists()) {            // host cancelled
      waitingRef.off(); resetToSetup();
      alert('The game was cancelled.');
      return;
    }
    const g = snap.val();
    if (g.state === 'playing') {
      waitingRef.off();
      window.location.href = `game.html?room=${code}`;
      return;
    }
    renderWaiting(g);
  });
}

function renderWaiting(g) {
  const players = g.players || {};
  const seats   = sortedSeats(players);
  const list    = document.getElementById('playerList');
  list.innerHTML = '';
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const el = document.createElement('div');
    if (seats[i]) {
      const p = players[seats[i]];
      el.className = seats[i] === mySeat ? 'player-slot me' : 'player-slot';
      const span = document.createElement('span');
      span.textContent = p.name;
      el.append(avatarImg(p.avatar), span);
    } else {
      el.className = 'player-slot empty';
      el.innerHTML = '<div class="empty-dot">?</div><span>Open</span>';
    }
    list.appendChild(el);
  }

  const n   = seats.length;
  const msg = document.getElementById('waitingMsg');
  const btn = document.getElementById('startBtn');
  const hostName = players[g.host] ? players[g.host].name : 'the host';
  if (isHost) {
    btn.disabled    = n < 2;
    btn.textContent = n < 2 ? 'Need 1 more player' : `${getSkin().emoji} Start game (${n} players)`;
    msg.textContent = n < MAX_PLAYERS ? 'Send the invite, then tap Start when everyone is in.' : 'The table is full!';
  } else {
    msg.textContent = `Waiting for ${hostName} to start…`;
  }
}

function resetToSetup() {
  currentCode = null; mySeat = null; isHost = false;
  document.getElementById('waitingPanel').classList.add('hidden');
  document.getElementById('setupPanel').classList.remove('hidden');
  createBtn.disabled = false;
  checkReady();
}

// ─ Create ─────────────────────────────────────────────────────
createBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  remember('pu_name', name);
  remember('pu_avatar', selectedAvatar);
  createBtn.disabled = true;

  // Make sure the code isn't already in use
  let code = genCode();
  for (let i = 0; i < 5 && (await db.ref(`games/${code}`).get()).exists(); i++) code = genCode();

  mySeat = seatId();
  isHost = true;
  await db.ref(`games/${code}`).set({
    state:     'waiting',
    host:      mySeat,
    players:   { [mySeat]: { name, avatar: selectedAvatar, joinedAt: Date.now() } },
    createdAt: Date.now()
  });
  showWaiting(code);
});

// ─ Start (host only): deal everyone in ────────────────────────
document.getElementById('startBtn').addEventListener('click', async () => {
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  const snap = await db.ref(`games/${currentCode}`).get();
  if (!snap.exists()) return;
  const g     = snap.val();
  const order = sortedSeats(g.players).slice(0, MAX_PLAYERS);
  if (order.length < 2) { btn.disabled = false; return; }

  const deck  = createDeck();
  const hands = {};
  order.forEach(seat => { hands[seat] = deck.splice(0, 7); });

  // First discard must be a number card to avoid start-of-game complexity
  const startIdx  = deck.findIndex(c => c.type === 'number');
  const startCard = deck.splice(startIdx, 1)[0];

  await db.ref(`games/${currentCode}`).update({
    hands,
    order,
    direction:     1,
    drawPile:      deck,
    discardPile:   [startCard],
    currentColor:  startCard.color,
    currentPlayer: order[0],
    winner:        null,
    lastAction:    getSkin().started(g.players[g.host].name),
    state:         'playing'
  });
});

// ─ Share invite ───────────────────────────────────────────────
document.getElementById('shareBtn').addEventListener('click', async () => {
  const url  = `${location.origin}${location.pathname}?join=${currentCode}`;
  const text = getSkin().shareText(currentCode);
  const btn  = document.getElementById('shareBtn');
  if (navigator.share) {
    try { await navigator.share({ title: getSkin().appName, text, url }); } catch (e) { /* user cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    btn.textContent = '✅ Invite copied!';
    setTimeout(() => { btn.textContent = '📲 Send invite'; }, 2000);
  } catch (e) {
    btn.textContent = `Code: ${currentCode}`;
  }
});

// ─ Leave waiting room ─────────────────────────────────────────
// Host leaving cancels the whole game; anyone else just gives up their seat.
document.getElementById('cancelBtn').addEventListener('click', async () => {
  if (waitingRef) waitingRef.off();
  if (currentCode) {
    try {
      if (isHost) await db.ref(`games/${currentCode}`).remove();
      else        await db.ref(`games/${currentCode}/players/${mySeat}`).remove();
    } catch (e) {}
  }
  resetToSetup();
});

// ─ Join ───────────────────────────────────────────────────────
joinBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();
  remember('pu_name', name);
  remember('pu_avatar', selectedAvatar);

  const snap = await db.ref(`games/${code}`).get();
  if (!snap.exists()) {
    alert(getSkin().noGame);
    return;
  }
  const game = snap.val();
  if (game.state !== 'waiting') {
    alert('That game has already started.');
    return;
  }
  if (Object.keys(game.players || {}).length >= MAX_PLAYERS) {
    alert(`That game is full (${MAX_PLAYERS} players max).`);
    return;
  }

  mySeat = seatId();
  isHost = false;
  await db.ref(`games/${code}/players/${mySeat}`).set({ name, avatar: selectedAvatar, joinedAt: Date.now() });
  showWaiting(code);
});
