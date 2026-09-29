// Standard 108-card UNO deck
function createDeck() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const cards  = [];
  let id = 0;

  colors.forEach(color => {
    // One 0, two each of 1-9
    cards.push({ id: id++, color, type: 'number', value: 0 });
    for (let n = 1; n <= 9; n++) {
      cards.push({ id: id++, color, type: 'number', value: n });
      cards.push({ id: id++, color, type: 'number', value: n });
    }
    // Two each action card per color
    for (let i = 0; i < 2; i++) {
      cards.push({ id: id++, color, type: 'skip',     value: 'skip'     });
      cards.push({ id: id++, color, type: 'reverse',  value: 'reverse'  });
      cards.push({ id: id++, color, type: 'draw_two', value: 'draw_two' });
    }
  });

  // Four wilds, four wild-draw-fours
  for (let i = 0; i < 4; i++) {
    cards.push({ id: id++, color: 'wild', type: 'wild',           value: 'wild'           });
    cards.push({ id: id++, color: 'wild', type: 'wild_draw_four', value: 'wild_draw_four' });
  }

  return shuffle(cards);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
