# ANOMALY — night watch in your own home

A browser anomaly-horror game. You photograph your own rooms, and the game turns them into security cameras.
Something comes in through one of the rooms and moves one room closer to you at a time.
Spot what is wrong, report it, and survive until 06:00 — or for as long as you can in Endless mode.

> ## ⚠️ Private game — never publish it with a key
> AI generation (Mode A) calls the image API **directly from the browser**. A key put in `config.js` can be read
> by anyone who can open that copy of the page. `config.js` is git-ignored on purpose.
> **Never publish the game folder, a fork or a hosted copy (e.g. GitHub Pages, Vercel) with a key inside it.**
> On a hosted copy, paste the key in the game instead (it is kept only until the tab closes).

---

## Running it

No install or build step. It is plain HTML/CSS/JavaScript.

- **Desktop:** serve the folder and open it: `python3 -m http.server 8000` → <http://localhost:8000>.
  (Opening `index.html` straight from disk mostly works in Chrome, but a local server is more reliable.)
- **Phone:** run the same server on your computer and open `http://<computer-ip>:8000` on the phone (same Wi-Fi).
  “Take photo” opens the camera directly (`<input type="file" capture>`).
- **Try it without photos:** press **Load demo house** in the main menu (a drawn 4-room house).
- Debug helpers: add `?debug` to the URL to outline where the current anomaly is, and `?speed=8` to run time faster.
- Pacing check without a browser: `node tools/simulate.js 4` simulates many 4-minute nights and prints how many
  anomalies appear per night, how they spread over the rooms and how often a room repeats.

### Turning on AI anomalies (Mode A)
1. Copy `config.example.js` to `config.js`.
2. Set `provider` to `'gemini'` or `'openai'` and fill in the matching `apiKey` (and model if you like).
   **Or** (recommended for a hosted copy) leave the key out of every file and paste it on the Anomalies tab each time.
   A pasted key is kept in `sessionStorage`: it survives a page reload but is forgotten when the tab closes,
   and it is never written into the code or sent anywhere except the AI provider.
3. In **House setup → Anomalies**, press **Calibrate cameras**.

### Privacy
Photos are stored only in the browser (IndexedDB) on the device. They are sent to an AI service **only** when you
press *Calibrate cameras* with Mode A enabled. Manual uploads (Mode B) and procedural anomalies never leave the device.
The game says this on the setup screen before the first upload.

### Hosting it (e.g. Vercel)
It's a static site, so any static host works. On Vercel, import the repository with no framework preset and
no build command. `config.js` is git-ignored and listed in `.vercelignore`, so a key can't be deployed by accident.
Use the paste-a-key option above on the hosted copy. The site itself contains no secrets, and photos never leave
each player's own browser, so sharing the URL only shares the empty game.

---

## How it plays

1. **Setup (My house).** Add rooms with one photo each, name them, mark **Your room** (the room you're actually
   sitting in). On the Layout tab, connect rooms that open into each other (e.g. hallway — living room — your room).
2. **Main menu.** Pick a game mode: **Night shift** or **Endless** (Challenge and Co-op are planned). Each mode
   has its own start screen; **Add-ons** can be switched on for any mode.
3. **Night.** 00:00 → 06:00 takes ~7 real minutes (adjustable on the Night shift screen). The feed fills the whole
   screen with the camera overlay on top; it enters fullscreen automatically where the browser allows it
   (⛶ button or `F` to toggle). The start of the shift is quiet (30 s by default) so you can learn the rooms.
4. **Anomalies.** How many: about 0.75 per real minute on night 1 (≈ 3 in a 4-minute night), +0.5 per minute each
   night, up to 2–4 at once. Where: every camera room gets a turn before any room repeats, and never the same room
   twice in a row (tick *Anomalies mostly start far from you* on the Layout tab to favour far rooms instead).
   Each one walks the layout graph one room closer; the total time from spawn to your door is about the same
   whatever the distance (≈ 90 s on night 1, less later), so a far room doesn't stall the night and a near room
   still gives you a chance. Nothing is announced, but *sometimes* you hear a low swell when something arrives,
   or when something has been in a room for a long time without you seeing it. **The picture you are looking at
   never changes:** anomalies only appear, move and leave on feeds you are not watching. Watching one camera for
   more than ~25 s saturates its sensor: interference climbs, and at 100 % every feed drops for 12 s — and while
   they are down, things move freely.
5. **Reporting.** Press **Report**, then tap/click the thing that is wrong. After a short “Transmitting report…”:
   - correct → the anomaly is removed and the room goes back to normal;
   - wrong → the console locks for 6 s and **interference** rises; at 100 % every feed drops for 12 s.
6. **Interference.** False reports and staring both raise it; it slowly falls again when you switch cameras.
7. **Losing.** When it reaches your room, the hum stops, there's a few seconds of silence, and then your own
   room appears on the screen with something in it.
8. **Winning.** Reach 06:00. Each new night has more anomalies, faster approach, a larger share of
   *subtle* changes, a worse picture (lower resolution, more grain and glitches, less colour), a shorter
   time before a stared-at camera saturates, and occasional dropped feeds.
9. **Shift review.** After every shift, one card per anomaly that actually appeared — *found*, *missed*, or the
   one that *got you* — with a ring around it. Tap the picture to compare with the normal room; swipe or *Next*
   to move on; *Skip all* leaves at once. Anomalies that never appeared are never shown.

### Endless
One life and no 06:00: the clock keeps running and the shift slowly gets worse. Difficulty **I** starts like
night 1 and gets worse every 3 minutes, **II** starts like night 2 (every 2 minutes), **III** like night 3
(every 90 seconds). Your best time per difficulty is kept on the device.

### Add-ons
Optional rules for any mode, switched on in the main menu. Each one must give the player a new decision.
| Add-on | What it does |
|---|---|
| **Dead cameras** | Now and then a camera loses its signal. Hold *Reboot* (or `B`) for 3 s on that camera to fix it. While it is down you are blind there — and things can still appear and move in that room. |
| **Battery** | Every camera switch costs 2.5 % power; power returns at 0.35 %/s. At 0 % every feed goes dark for 10 s, then the generator restarts at 30 %. Switching often keeps sensors cool but drains you. |
| **Camera filters** | Night vision, worn VHS tape or thermal (fixed, or random each shift). |

New add-ons live in `js/addons.js` and hook into the shift at fixed points (start, tick, camera switch,
"is this feed dead?", stop).

### Where anomalies come from (all three can be mixed)
| Source | How | Click area |
|---|---|---|
| **Mode A — AI** | Room photo + a varied prompt → Gemini or OpenAI image editing, done in advance on a “Calibrating cameras…” screen | Found by comparing before/after (blur → noise-relative threshold → largest connected blob). If the comparison is unclear, the prompt's location hint (left/centre/right) is used and the item is marked `~` in the library so you can fix it |
| **Mode B — Manual** | Upload images you edited in ChatGPT/Gemini; pick room, difficulty, optional original photo. A **prompt helper** with copy buttons is built in | You drag a rectangle; **Suggest area from difference** pre-fills it when the original photo is chosen |
| **Procedural fallback** | Canvas effects on your photo: light turned on, shifted/duplicated/mirrored/tilted area, dark figure, sourceless shadow, faint face, wet footprints, person standing, scratch marks | Exact, known from the drawing |

When a room runs out of prepared anomalies (or AI failed), procedural ones are used automatically.

**Export / import.** On the Anomalies tab, *Export house (.zip)* saves your photos, every AI and manual anomaly
image (as normal `.jpg` files you can open anywhere), the layout and the marked click areas. *Import house*
loads it again — after a reset, in another browser, or on the other player's phone for co-op — so AI images
never need to be generated twice. The library is hidden by default (seeing your own anomalies spoils the game); *Show anomalies (spoilers)* opens it,
and each image then has a *save* link.
Anomalies added for **your room** are used as the final image when something reaches you.

**Co-op (for now):** one person sets up the anomalies (Mode B) and hands the device over — the library only shows
counts unless someone presses *Show anomalies*. A proper online Co-op mode is planned (see `PLAN.md`).

---

## Research summary

**How anomaly games handle spotting and reporting**
- *Japan Stigmatized Property* (2025): you monitor CCTV of real Japanese “stigmatized” properties from 00:00 to 05:00 and report phenomena — moved or vanished furniture, intruding figures, light faults, orbs, stains, video distortion. Some things show only on the night-vision or the normal camera. Missing anomalies or repeated wrong reports fail the mission; it deliberately avoids jump-scare spam in favour of quiet, Japanese-style dread.
- *I'm on Observation Duty*: switch cameras, file a report choosing room + anomaly type. Wrong reports are rejected (red X) and cost you time; too many active anomalies at once ends the shift. Reports take a moment to “process”, which is itself tense.
- *The Exit 8*: a pure spot-the-difference loop in one corridor. Anomalies range from very subtle (sign text, a tile texture, a smudge shaped like a face, a ceiling light) to obvious (lights out). The horror comes from restraint and from you having memorised what “normal” looks like.

**What makes surveillance footage unsettling**
- Low resolution, grain, flicker and static: you get *just* enough information to become paranoid, never a clear look (FNAF's camera system is built on this scarcity).
- Changes that happen while you're looking at another feed — and the feeling that something waited until you looked away.
- Timing: long stretches of nothing, then something small. Iron Lung's camera only gives a slow, grainy still image, and its sound design lets your imagination fill the rest.
- The *familiar made wrong*: a chair slightly turned is scarier in a room you know than a monster in a room you don't.

**How tension is built over a night**
- A clock that crawls (FNAF, Observation Duty): safety is a time, not a goal you can rush.
- Audio as information and threat: a constant hum, distant noises you can't place, and **silence right before danger**.
- Escalation across nights: more simultaneous threats, faster movement, subtler changes, worse equipment.

**How that shaped this game**
- The anomaly is something that *moves through your own floor plan* toward the room you're physically in — the FNAF threat, applied to Exit 8-style spot-the-difference.
- It prefers to move when you're not watching, and otherwise hides its move behind interference.
- Wrong reports are punished by lockout + rising interference instead of instant failure (Observation Duty style).
- The log never says where something is — you only have your eyes and the hum.
- The hum cutting out is the only warning that something is about to reach you.

**Image models that can edit a photo from a browser app**
- **Google Gemini image models** (“Nano Banana” family: `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`) — `generateContent` with the photo as `inline_data` plus a text instruction; returns the edited image as base64. Good at “change only X” edits, keeps the scene well. Callable from the browser with an API key. **Default here.**
- **OpenAI `gpt-image-1`** — `POST /v1/images/edits` (multipart) with image + optional mask + prompt. The mask is only guidance: the model still redraws the whole image, so the game diffs the result anyway.
- **Stable Diffusion inpainting** (e.g. via Replicate, Stability API, or a local Automatic1111/ComfyUI) — true mask-limited inpainting, so the click area is exact. Most of these hosted APIs don't allow direct browser calls (CORS), so they need a small proxy; a local ComfyUI/A1111 can be called from the browser if started with CORS enabled. A good “next step” provider.

---

## Architecture

No framework or bundler; classic `<script>` files sharing a few global modules, so it also runs from disk.

```
index.html            all screens: main menu, mode start, add-ons, setup (4 tabs), calibration, game, review, end, editor modal
css/style.css         dark CCTV look, mobile/desktop layout
config.example.js     defaults; copy to config.js (git-ignored) to add an API key
js/
  storage.js          IndexedDB: image blobs + the house record
  zip.js              tiny ZIP writer/reader for export/import
  backup.js           export/import a house (photos + anomalies + layout) as .zip
  imageutil.js        load/resize/encode images, before/after diff → click area
  prompts.js          anomaly prompt library by difficulty, varied fill-ins, helper prompts
  procedural.js       canvas anomalies (11 kinds) + the “intruder” image for losing
  ai.js               Gemini / OpenAI image-edit calls, result normalisation and area detection
  audio.js            Web Audio: hum, room tone, distant thuds/creaks, static, report beeps, silence, scare
  monitor.js          CCTV renderer: low-res tinted frame + grain, rolling bar, flicker, tape glitch, static
  pacing.js           difficulty curve, anomalies per minute, approach time, fair spawn-room picker (no DOM)
  addons.js           add-on registry: dead cameras, battery, camera filters
  game.js             shift loop: graph distances, spawn/move (never on screen), sound hints, reporting,
                      interference, add-on hooks, night/endless endings, history for the review
  review.js           after-shift review cards (found / missed / got you)
  menu.js             main menu, mode start screens, add-ons screen, endless best times
  editor.js           Mode B rectangle editor with “suggest area from difference”
  setup.js            rooms/photos, layout graph, anomaly sources, library, calibration
  demo.js             drawn demo house
  app.js              screen routing, persistence, starting a shift, end screen
tools/
  simulate.js         node pacing simulation (uses js/pacing.js)
```

**Data model** (stored in IndexedDB)
```js
house = {
  rooms:     [{ id, name, photos: [imageId] }],     // one camera per room (only the first photo is used)
  edges:     [[roomIdA, roomIdB], ...],          // undirected layout graph
  playerRoom: roomId,
  anomalies: [{ id, source: 'ai'|'manual', roomId, photoId, imageId,
                difficulty: 1..4, description, region: {x,y,w,h} /* 0..1 */ }],
  useFallback, spawnFar
}
```
At night start every image is preloaded. A *threat* is a moving entity; whenever it enters a room it
*manifests* as one unused prepared anomaly for that room (preferring the difficulty the night asks for),
or a procedural one. A report is correct when the tap lands inside that manifestation's `region` (+3.5 % margin).

---

## Next steps

- **More anomaly types:** time-based ones (a door that slowly opens over a minute), animated figures that
  are only there for a few frames, “camera malfunction” anomalies, audio-only anomalies (a voice on one feed),
  night-vision-only anomalies.
- **Reporting depth:** Observation-Duty-style report categories (object moved / extra object / intruder / light),
  a limited number of reports per hour, a penalty for anomalies left too long.
- **Difficulty curve:** tune from playtests; per-anomaly speed (severe ones move faster);
  more than one route through the house; doors you can “lock” for a while at a cost.
- **Audio:** footsteps that get louder as it approaches, room-specific sounds (fridge hum in the kitchen),
  a voice-memo style guard briefing at the start of each night, binaural panning by room position.
- **AI pipeline:** a Stable Diffusion inpainting provider with an exact mask, retry when the diff says the
  model redrew too much, generating the “your room” ending image, generating a fresh batch between nights.
- **Quality of life:** offline play (service worker).
- **Planned modes:** sharing a house by link, Challenge and online Co-op — see `PLAN.md`.
