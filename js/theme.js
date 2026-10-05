// Skins are a local visual preference stored per device. They are never written
// to Firebase, so each player can run a different skin — avatars resolve by id,
// so a Bluey-skinned phone still renders the other player's Peppa character.

const SKINS = {
  peppa: {
    id:    'peppa',
    name:  'Peppa',
    emoji: '🐷',
    logo:  'peppa',
    appName: 'Peppa UNO',
    themeColor: '#5EC4F5',
    discardLabel: 'Muddy puddle',
    startBtn:  '🐷 Start a new game',
    playAgain: '🐷 Play again',
    yourTurn:  name => `Your turn, ${name}! 🐷`,
    started:   name => `${name} started the game 🐷`,
    shareText: code => `Come play Peppa UNO with me! 🐷 Code: ${code}`,
    winSub:  'Oink oink! Hooray! 🐷',
    loseSub: 'Great game! Play again? 🐷',
    noGame:  'Oops! No game with that code. Check it and try again. 🐷',
    characters: [
      { id: 'peppa',          name: 'Peppa'   },
      { id: 'daddy-pig',      name: 'Daddy'   },
      { id: 'george',         name: 'George'  },
      { id: 'suzy-sheep',     name: 'Suzy'    },
      { id: 'rebecca-rabbit', name: 'Rebecca' },
      { id: 'danny-dog',      name: 'Danny'   },
      { id: 'pedro-pony',     name: 'Pedro'   },
    ]
  },
  bluey: {
    id:    'bluey',
    name:  'Bluey',
    emoji: '🐶',
    logo:  'bluey',
    appName: 'Bluey UNO',
    themeColor: '#6BC9EE',
    discardLabel: 'Sandpit',
    startBtn:  '🐶 Start a new game',
    playAgain: '🐶 Play again',
    yourTurn:  name => `Your turn, ${name}! 🐶`,
    started:   name => `${name} started the game 🐶`,
    shareText: code => `Come play Bluey UNO with me! 🐶 Code: ${code}`,
    winSub:  'For real life! Hooray! 🐶',
    loseSub: 'Good game, mate! Play again? 🐶',
    noGame:  'Oops! No game with that code. Check it and try again. 🐶',
    characters: [
      { id: 'bluey',  name: 'Bluey'  },
      { id: 'bandit', name: 'Bandit' },
      { id: 'bingo',  name: 'Bingo'  },
      { id: 'muffin', name: 'Muffin' },
      { id: 'socks',  name: 'Socks'  },
      { id: 'chloe',  name: 'Chloe'  },
      { id: 'rusty',  name: 'Rusty'  },
    ]
  }
};

SKINS.spidey = {
  id:    'spidey',
  name:  'Spidey',
  emoji: '🕷️',
  logo:  'spider-man',
  appName: 'Spidey UNO',
  themeColor: '#16235C',
  discardLabel: 'The web',
  startBtn:  '🕷️ Start a new game',
  playAgain: '🕷️ Play again',
  yourTurn:  name => `Your turn, ${name}! 🕸️`,
  started:   name => `${name} started the game 🕷️`,
  shareText: code => `Come play Spidey UNO with me! 🕷️ Code: ${code}`,
  winSub:  'Thwip! You saved the day! 🕸️',
  loseSub: 'Great game, hero! Play again? 🕷️',
  noGame:  'Oops! No game with that code. Check it and try again. 🕷️',
  characters: [
    { id: 'spider-man',      name: 'Spidey'     },
    { id: 'miles-morales',   name: 'Miles'      },
    { id: 'spider-gwen',     name: 'Gwen'       },
    { id: 'iron-man',        name: 'Iron Man'   },
    { id: 'captain-america', name: 'Cap'        },
    { id: 'black-widow',     name: 'Widow'      },
    { id: 'venom',           name: 'Venom'      },
  ]
};

const SKIN_ORDER = ['peppa', 'bluey', 'spidey'];

let currentSkinId = (() => {
  try {
    const v = localStorage.getItem('pu_skin');
    if (v && SKINS[v]) return v;
  } catch (e) { /* storage blocked */ }
  return 'peppa';
})();

function getSkin()   { return SKINS[currentSkinId]; }
function nextSkinId() {
  return SKIN_ORDER[(SKIN_ORDER.indexOf(currentSkinId) + 1) % SKIN_ORDER.length];
}

function setSkin(id) {
  if (!SKINS[id]) return;
  currentSkinId = id;
  try { localStorage.setItem('pu_skin', id); } catch (e) { /* storage blocked */ }
  applySkin();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Repaints skin-dependent chrome. Safe on both pages — missing nodes are skipped.
function applySkin() {
  const skin = getSkin();
  document.documentElement.dataset.skin = skin.id;
  document.title = `${skin.appName} ${skin.emoji}`;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = skin.themeColor;

  setText('skinTitle', skin.name);
  setText('createBtn', skin.startBtn);
  setText('playAgainBtn', skin.playAgain);
  setText('discardLabel', skin.discardLabel);

  document.querySelectorAll('.back-pig, .waiting-pig').forEach(el => {
    el.textContent = skin.emoji;
  });

  const toggle = document.getElementById('skinToggle');
  if (toggle) {
    const other = SKINS[nextSkinId()];
    toggle.textContent = `${other.emoji} Switch to ${other.name}`;
  }

  const logo = document.getElementById('skinLogo');
  if (logo) {
    logo.alt = skin.name;
    logo.onerror = () => {
      logo.onerror = () => { logo.onerror = null; logo.src = `images/avatars/${skin.logo}.svg`; };
      logo.src = `images/avatars/${skin.logo}.jpg`;
    };
    logo.src = `images/avatars/${skin.logo}.png`;
  }
}

applySkin();
