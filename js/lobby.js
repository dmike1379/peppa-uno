const CHARACTERS = [
  { id: 'peppa',          name: 'Peppa'   },
  { id: 'daddy-pig',      name: 'Daddy'   },
  { id: 'george',         name: 'George'  },
  { id: 'suzy-sheep',     name: 'Suzy'    },
  { id: 'rebecca-rabbit', name: 'Rebecca' },
  { id: 'danny-dog',      name: 'Danny'   },
  { id: 'pedro-pony',     name: 'Pedro'   },
];

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let selectedAvatar = null;

// Build avatar picker
const grid = document.getElementById('avatarGrid');
CHARACTERS.forEach(ch => {
  const el = document.createElement('div');
  el.className = 'avatar-opt';
  el.dataset.id = ch.id;
  // Try PNG first (AI art), fall back to SVG placeholder
  el.innerHTML = `
    <img src="images/avatars/${ch.id}.png"
         onerror="this.src='images/avatars/${ch.id}.svg'" alt="${ch.name}">
    <span>${ch.name}</span>
  `;
  el.addEventListener('click', () => {
    document.querySelectorAll('.avatar-opt').forEach(a => a.classList.remove('sel'));
    el.classList.add('sel');
    selectedAvatar = ch.id;
    checkReady();
  });
  grid.appendChild(el);
});

const nameInput = document.getElementById('playerName');
const roomInput = document.getElementById('roomInput');
const createBtn = document.getElementById('createBtn');
const joinBtn   = document.getElementById('joinBtn');

nameInput.addEventListener('input', checkReady);
roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase();
  checkReady();
});

function checkReady() {
  const ok = nameInput.value.trim().length > 0 && !!selectedAvatar;
  createBtn.disabled = !ok;
  joinBtn.disabled   = !(ok && roomInput.value.trim().length === 4);
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

createBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
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
    lastAction:    `${name} created the game 🐷`
  };

  await db.ref(`games/${code}`).set(state);
  sessionStorage.setItem('playerSlot', 'p1');
  sessionStorage.setItem('roomCode',   code);

  document.getElementById('setupPanel').classList.add('hidden');
  const wp = document.getElementById('waitingPanel');
  wp.classList.remove('hidden');
  document.getElementById('displayCode').textContent = code;

  // Wait for p2 to join, then start
  db.ref(`games/${code}/players/p2`).on('value', snap => {
    if (snap.exists()) {
      db.ref(`games/${code}/state`).set('playing').then(() => {
        window.location.href = `game.html?room=${code}`;
      });
    }
  });
});

joinBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();

  const snap = await db.ref(`games/${code}`).get();
  if (!snap.exists()) {
    alert('Room not found — check the code and try again.');
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
