# ANOMALY — night watch in your own home

A browser anomaly-horror game. You photograph your own rooms, and the game turns them into security cameras.
Something comes in through the room farthest from you and moves one room closer at a time.
Spot what is wrong, report it, and survive until 06:00.

> ## ⚠️ Private game — never publish it with a key
> AI generation (Mode A) calls the image API **directly from the browser**, so the API key sits in `config.js`
> and anyone who can open the page can read it. `config.js` is git-ignored on purpose.
> **Never publish the game folder, a fork or a hosted copy (e.g. GitHub Pages) with a key inside it.**
> Keep the repository private, and do not commit `config.js`.

---

## Running it

No install or build step. It is plain HTML/CSS/JavaScript.

- **Desktop:** serve the folder and open it: `python3 -m http.server 8000` → <http://localhost:8000>.
  (Opening `index.html` straight from disk mostly works in Chrome, but a local server is more reliable.)
- **Phone:** run the same server on your computer and open `http://<computer-ip>:8000` on the phone (same Wi-Fi).
  “Take photo” opens the camera directly (`<input type="file" capture>`).
- **Try it without photos:** press **Load demo house** on the title screen (a drawn 4-room house).
- Debug helpers: add `?debug` to the URL to outline where the current anomaly is, and `?speed=8` to run time faster.

### Turning on AI anomalies (Mode A)
1. Copy `config.example.js` to `config.js`.
2. Set `provider` to `'gemini'` or `'openai'` and fill in the matching `apiKey` (and model if you like).
   You can also paste a key on the Anomalies tab; it is then kept in this browser's `localStorage`.
3. In **House setup → Anomalies**, press **Calibrate cameras**.

### Privacy
Photos are stored only in the browser (IndexedDB) on the device. They are sent to an AI service **only** when you
press *Calibrate cameras* with Mode A enabled. Manual uploads (Mode B) and procedural anomalies never leave the device.
The game says this on the setup screen before the first upload.

---

## How it plays

1. **Setup.** Add rooms, 1–2 photos each, name them, mark **Your room** (the room you're actually sitting in).
   On the Layout tab, connect rooms that open into each other (e.g. hallway — living room — your room).
2. **Night.** 00:00 → 06:00 takes ~7 real minutes (adjustable). Switch between cameras (and between the two
   angles of a room if it has two photos).
3. **Anomalies.** Each one spawns in the room farthest from you and walks the layout graph one room closer
   at intervals. It likes to move while you are *not* watching that room; if you are watching, it waits a
   little and then moves anyway, hidden behind a burst of interference.
4. **Reporting.** Press **Report**, then tap/click the thing that is wrong. After a short “Transmitting report…”:
   - correct → the anomaly is removed and the room goes back to normal;
   - wrong → the console locks for 6 s and **interference** rises; at 100 % every feed drops for 12 s.
5. **Losing.** When it reaches your room, the hum stops, there's a few seconds of silence, and then your own
   room appears on the screen with something in it.
6. **Winning.** Reach 06:00. Each new night has more anomalies at once, faster movement, a larger share of
   *subtle* changes, a worse picture (lower resolution, more grain and glitches, less colour), vaguer log
   messages and occasional dropped feeds.

### Where anomalies come from (all three can be mixed)
| Source | How | Click area |
|---|---|---|
| **Mode A — AI** | Room photo + a varied prompt → Gemini or OpenAI image editing, done in advance on a “Calibrating cameras…” screen | Found by comparing before/after (blur → noise-relative threshold → largest connected blob). If the comparison is unclear, the prompt's location hint (left/centre/right) is used and the item is marked `~` in the library so you can fix it |
| **Mode B — Manual** | Upload images you edited in ChatGPT/Gemini; pick room, difficulty, optional original photo. A **prompt helper** with copy buttons is built in | You drag a rectangle; **Suggest area from difference** pre-fills it when the original photo is chosen |
| **Procedural fallback** | Canvas effects on your photo: light turned on, shifted/duplicated/mirrored/tilted area, dark figure, sourceless shadow, faint face, wet footprints, person standing, scratch marks | Exact, known from the drawing |

When a room runs out of prepared anomalies (or AI failed), procedural ones are used automatically.
Anomalies added for **your room** are used as the final image when something reaches you.

**Co-op mode:** one person sets up the anomalies (Mode B) and ticks *Co-op: hide anomaly images* — the library then only shows counts. The other person plays.

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
- Log text is short and clinical, and gets vaguer every night (“Activity detected in KITCHEN.” → “Movement detected.”).
- The hum cutting out is the only warning that something is about to reach you.

**Image models that can edit a photo from a browser app**
- **Google Gemini image models** (“Nano Banana” family: `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`) — `generateContent` with the photo as `inline_data` plus a text instruction; returns the edited image as base64. Good at “change only X” edits, keeps the scene well. Callable from the browser with an API key. **Default here.**
- **OpenAI `gpt-image-1`** — `POST /v1/images/edits` (multipart) with image + optional mask + prompt. The mask is only guidance: the model still redraws the whole image, so the game diffs the result anyway.
- **Stable Diffusion inpainting** (e.g. via Replicate, Stability API, or a local Automatic1111/ComfyUI) — true mask-limited inpainting, so the click area is exact. Most of these hosted APIs don't allow direct browser calls (CORS), so they need a small proxy; a local ComfyUI/A1111 can be called from the browser if started with CORS enabled. A good “next step” provider.

---

## Architecture

No framework or bundler; classic `<script>` files sharing a few global modules, so it also runs from disk.

```
index.html            all screens: title, setup (4 tabs), calibration, game, end, editor modal
css/style.css         dark CCTV look, mobile/desktop layout
config.example.js     defaults; copy to config.js (git-ignored) to add an API key
js/
  storage.js          IndexedDB: image blobs + the house record
  imageutil.js        load/resize/encode images, before/after diff → click area
  prompts.js          anomaly prompt library by difficulty, varied fill-ins, helper prompts
  procedural.js       canvas anomalies (11 kinds) + the “intruder” image for losing
  ai.js               Gemini / OpenAI image-edit calls, result normalisation and area detection
  audio.js            Web Audio: hum, room tone, distant thuds/creaks, static, report beeps, silence, scare
  monitor.js          CCTV renderer: low-res tinted frame + grain, rolling bar, flicker, tape glitch, static
  game.js             night loop: graph distances, spawn/move, reporting, interference, win/lose, difficulty curve
  editor.js           Mode B rectangle editor with “suggest area from difference”
  setup.js            rooms/photos, layout graph, anomaly sources, library, calibration
  demo.js             drawn demo house
  app.js              screen routing, persistence, title/end screens
```

**Data model** (stored in IndexedDB)
```js
house = {
  rooms:     [{ id, name, photos: [imageId, imageId?] }],
  edges:     [[roomIdA, roomIdB], ...],          // undirected layout graph
  playerRoom: roomId,
  anomalies: [{ id, source: 'ai'|'manual', roomId, photoId, imageId,
                difficulty: 1..4, description, region: {x,y,w,h} /* 0..1 */ }],
  useFallback, coopHide
}
```
At night start every image is preloaded. A *threat* is a moving entity; whenever it enters a room it
*manifests* as one unused prepared anomaly for that room (preferring the difficulty the night asks for),
or a procedural one. A report is correct when the tap lands inside that manifestation's `region` (+3.5 % margin)
on the view (angle) it is on.

---

## Next steps

- **More anomaly types:** time-based ones (a door that slowly opens over a minute), animated figures that
  are only there for a few frames, “camera malfunction” anomalies, audio-only anomalies (a voice on one feed),
  anomalies that differ between the two angles of a room, night-vision-only anomalies.
- **Reporting depth:** Observation-Duty-style report categories (object moved / extra object / intruder / light),
  a limited number of reports per hour, a penalty for anomalies left too long.
- **Difficulty curve:** tune from playtests; add a night 6+ “endless” mode; per-anomaly speed (severe ones move faster);
  more than one route through the house; doors you can “lock” for a while at a cost.
- **Audio:** footsteps that get louder as it approaches, room-specific sounds (fridge hum in the kitchen),
  a voice-memo style guard briefing at the start of each night, binaural panning by room position.
- **AI pipeline:** a Stable Diffusion inpainting provider with an exact mask, retry when the diff says the
  model redrew too much, generating the “your room” ending image, generating a fresh batch between nights.
- **Quality of life:** export/import the house as a file (to move it between devices or set up co-op on
  another phone), a “review the night” screen showing every anomaly you missed, PWA install for offline play.
