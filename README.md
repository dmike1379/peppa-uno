# Peppa UNO 🐷

A Peppa Pig themed UNO game for Mike and Linnea — each on their own phone.

## First-time setup (~10 minutes)

### 1. Firebase Realtime Database

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in
2. Click **Add project** → name it `peppa-uno` → click through (disable Analytics is fine)
3. In the left sidebar: **Build → Realtime Database → Create Database**
4. Choose **Start in test mode** → Next → Done
5. Click the ⚙️ gear next to "Project Overview" → **Project settings**
6. Scroll to **Your apps** → click the **</>** (Web) icon
7. Give the app a nickname (anything) → **Register app**
8. Copy the `firebaseConfig` block shown
9. Open `js/config.js` in this repo and replace all the placeholder values

### 2. GitHub Pages

1. In this repo on GitHub: **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: **main** / **/ (root)** → **Save**
3. Wait about 1 minute → you’ll get a URL like `https://dmike1379.github.io/peppa-uno/`

### 3. Play

1. Both players open that URL on their phones
2. One player enters their name, picks a character, taps **Create Game**
3. Share the 4-letter code with the other player
4. Other player enters name, picks character, types the code, taps **Join**
5. Game starts automatically!

## Swapping in your AI art

- Generate 200×200 images (Google Photos → Create → "You → chibi sticker" or Remix)
- Save as PNG named exactly: `peppa.png`, `daddy-pig.png`, `george.png`, etc.
- Upload to `images/avatars/` folder in this repo (drag and drop on GitHub works)
- The game auto-prefers `.png` and falls back to the `.svg` placeholder

## AI art prompts

| File | Prompt |
|------|--------|
| `peppa.png` | Use a photo of Linnea → Google Photos “You → chibi sticker” |
| `daddy-pig.png` | Use a photo of Mike → Google Photos “You → chibi sticker” |
| `george.png` | `George Pig from Peppa Pig cartoon, small blue pig boy, flat 2D animation style` |
| `suzy-sheep.png` | `Suzy Sheep from Peppa Pig, white sheep, purple dress, flat cartoon style` |
| `rebecca-rabbit.png` | `Rebecca Rabbit from Peppa Pig, orange rabbit, flat cartoon style` |
| `danny-dog.png` | `Danny Dog from Peppa Pig, grey-blue dog, flat cartoon style` |
| `pedro-pony.png` | `Pedro Pony from Peppa Pig, golden pony, flat cartoon style` |

## Rules

Standard UNO — match by color or number/symbol. Wilds pick a new color. In 2-player, Reverse acts as Skip. Draw Two and Wild Draw Four auto-apply to the opponent — no stacking.
