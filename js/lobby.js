firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let selectedAvatar = null;
let waitingRef     = null;
let currentCode    = null;

// Remember name + character on this device (so Linnea doesn't retype every game)
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

// ─ Create ─────────────────────────────────────────────────────
createBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  remember('pu_name', name);
  remember('pu_avatar', selectedAvatar);
  createBtn.disabled = true;

  const code = genCode();
  const deck = createDeck();

  // Deal 7 cards each
  const p1Hand = deck.splice(0, 7);
  const p2Hand = deck.splice(0, 7);

  // First discard must be a number card to avoid start-of-game complexity
  const startIdx  = deck.findIndex(c => c.type === 'number');
  const startCard = deck.splice(startIdx, 1)[0];

  const state = {
    state:         'waiting',
    players:       { p1: { name, avatar: selectedAvatar } },
    hands:         { p1: p1Hand, p2: p2Hand },
    drawPile:      deck,
    discardPile:   [startCard],
    currentColor:  startCard.color,
    currentPlayer: 'p1',
    winner:        null,
    lastAction:    getSkin().started(name),
    createdAt:     Date.now()
  };

  await db.ref(`games/${code}`).set(state);
  sessionStorage.setItem('playerSlot', 'p1');
  sessionStorage.setItem('roomCode',   code);
  currentCode = code;

  document.getElementById('setupPanel').classList.add('hidden');
  document.getElementById('waitingPanel').classList.remove('hidden');
  document.getElementById('displayCode').textContent = code;

  // Wait for p2 to join, then start
  waitingRef = db.ref(`games/${code}/players/p2`);
  waitingRef.on('value', snap => {
    if (snap.exists()) {
      waitingRef.off();
      db.ref(`games/${code}/state`).set('playing').then(() => {
        window.location.href = `game.html?room=${code}`;
      });
    }
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

// ─ Cancel waiting ─────────────────────────────────────────────
document.getElementById('cancelBtn').addEventListener('click', async () => {
  if (waitingRef) waitingRef.off();
  if (currentCode) { try { await db.ref(`games/${currentCode}`).remove(); } catch (e) {} }
  currentCode = null;
  document.getElementById('waitingPanel').classList.add('hidden');
  document.getElementById('setupPanel').classList.remove('hidden');
  checkReady();
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

  await db.ref(`games/${code}/players/p2`).set({ name, avatar: selectedAvatar });
  sessionStorage.setItem('playerSlot', 'p2');
  sessionStorage.setItem('roomCode',   code);
  window.location.href = `game.html?room=${code}`;
});
