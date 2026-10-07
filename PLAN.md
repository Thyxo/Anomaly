# Plan for næste version

Skrevet på dansk, fordi det er et arbejdsdokument.

Status: fase 0, 1, 2 og 5 er bygget. Fase 3 og 4 (Railway) venter, til du er med på det.

## Faser

| Fase | Indhold | Backend | Status |
|---|---|---|---|
| 0 | Spawn-logik og tempo (se nedenfor) | Nej | Færdig |
| 1 | Lydhints, gennemgang efter natten, fjern angle-knap, skjult bibliotek | Nej | Færdig |
| 2 | Hovedmenu med gamemodes, addon-system, Endeløs, kamera der dør | Nej | Færdig |
| 3 | Del hus (krypteret link) og Udfordring | Ja, lille (Railway) | Venter |
| 4 | Co-op med roller og timer | Ja (Railway) | Venter |
| 5 | Flere addons: batteri, kamerafiltre m.m. | Nej | Batteri og filtre færdige |

## Fase 0: Spawn-logik og tempo

### Problem (fra test)
- Nat 1: kun 1 anomali på en hel nat. Nat 2: 2-3 stykker. Det er for lidt.
- De fleste kommer stadig i ét rum.

### Årsager (fundet i `js/game.js`)
1. **Loftet er for lavt.** `maxThreats = 1` på nat 1 og 2. Der kan kun være én aktiv anomali ad gangen, og den næste kan først komme, når den forrige er rapporteret eller har ramt dig.
2. **Rejsetiden er for lang.** En anomali flytter sig ét rum hver ca. 55 sekunder (nat 1) og starter længst væk. Med 7 rum kan én anomali være undervejs i flere minutter, og hele natten er 7 minutter. Alt imens kan der ikke komme en ny.
3. **Standardtilstanden er "længst væk".** Medmindre fluebenet "any room" er slået til, vælges altid det fjerneste rum. Det er en bevidst regel, ikke tilfældighed.
4. **Rummet du ser på springes over.** Det er med vilje, men det bidrager til skævheden.
5. Med 1-3 anomalier pr. nat er det umuligt at se, om fordelingen er tilfældig. Derfor føles det værre.

### Ændringer (foreslået)
**A. Ingen to i træk i samme rum**
- Husk sidste spawn-rum og vælg aldrig det, medmindre det er det eneste mulige.
- Bedre: en "pose" (shuffle bag). Alle rum blandes og trækkes ét ad gangen. Først når alle har fået en tur, blandes posen igen. Så er fordelingen jævn over en nat. Rum der blev sprunget over (fordi du kiggede på dem) bliver i posen og tages næste gang.

**B. Flere samtidige og hurtigere rytme**
- Højere `maxThreats` (nat 1: 2, nat 2: 3, nat 3+: 4).
- Kortere `spawnEvery` på nat 1 (fx ca. 40 sekunder i stedet for 75).
- Mål pr. minut (skalerer med nattens længde, brugeren spiller 4 minutter): nat 1 ca. 0,75, nat 2 ca. 1,25, nat 3 ca. 1,75, derefter stigende.
  - 4-minutters nat: ca. 3 / 5 / 7 anomalier.
  - 7-minutters nat: ca. 5 / 9 / 12.
  - Nat 1 på 4 minutter skal give omkring 3 (brugerens ønske). De første 30 sekunder er stadig uden anomalier.
- Korte nætter: kun 1-2 samtidige på nat 1, så det ikke bliver rodet.

**C. Rejsetid uafhængig af afstand**
- I dag er tiden fra spawn til dig = antal skridt × `moveEvery`. Langt væk betyder ventetid, tæt på betyder næsten ingen tid.
- Ny regel: en samlet tilnærmelsestid (fx ca. 90 sekunder på nat 1, kortere senere), delt ud på antal skridt. Så får en anomali tæt på dig stadig en fair tid, og en langt væk blokerer ikke hele natten.

**D. Standardtilstand**
- Gør "alle rum, lige chance" til standard sammen med posen. "Længst væk" bliver et valg i stedet.

**E. Mål og test**
- Skriv en lille simulering (uden grafik), der kører spillogikken hurtigt for forskellige huse og nætter og udskriver: antal anomalier pr. nat, fordeling pr. rum og største antal i træk i samme rum. Brug den til at finjustere tallene, før vi ændrer noget for spilleren.
- Kort test: høj hastighed, få minutter.

## Fase 1: Kerneforbedringer

### Lydhints
- Kun nogle gange, ikke hver gang:
  1. Når en anomali spawner: chance ca. 30-40 %.
  2. Når en anomali har stået længe uden at du har set den (fx 60-90 sekunder): chance for et lille puf.
- Én kort lyd (dunk, knirk, fjern skridt). Den peger ikke på noget rum.
- Pause mellem lyde, så det ikke bliver forudsigeligt.

### Gennemgang efter natten (must have)
- Vis kun anomalier, der faktisk kom frem i spillet:
  - Fundet (du rapporterede den)
  - Misset (aktiv, men ikke rapporteret)
  - Den der dræbte dig
- Aldrig anomalier, der ikke spawnede. De afsløres ikke.
- Ét kort ad gangen: billede, cirkel om området, tryk skifter mellem før og efter.
- Nem og skipbar: stor "Næste", stor "Spring over alt", swipe på mobil.
- Efter hver nat.

### Fjern angle-knappen
- Der er ét billede pr. rum. Knap og genvej fjernes. Datamodellen beholdes, men er usynlig.

### Skjult bibliotek
- Biblioteket vises som standard kun som tal ("14 anomalier klar").
- Man kan åbne det med et bevidst valg. Eksport og import virker uændret.

## Fase 2: Hovedmenu, gamemodes og addons

### Hovedmenu
- Titelskærmen bliver en rigtig hovedmenu. Man vælger gamemode, og hver mode har sin egen startskærm.
- Faste valg: **Mit hus** (opsætning), **Addons**, **Instruktioner**.
- Gamemodes som kort: Natten, Endeløs, Udfordring, Co-op.
- Modes der ikke er bygget endnu vises nedtonet ("kommer"), eller helt skjult indtil de er klar.

### Gamemodes
| Mode | Beskrivelse |
|---|---|
| Natten | Nuværende spil. Nat 1, 2, 3 med stigende sværhed. |
| Endeløs | Fortsætter efter 06:00, til du taber. Sværheden stiger jævnt. Highscore gemmes lokalt. |
| Udfordring | Spil en vens hus (fase 3). Eget gamemode. |
| Co-op | To spillere med roller (fase 4). |

### Addons
- En addon er en lille fil, der kobler sig på faste punkter i spillet: nat starter, tick, spawn, rapport, jumpscare. Nye addons kræver ikke ændringer i kernen.
- Man slår dem til og fra i en addon-fane. Gamemodes kan have faste sæt.
- Regel mod kedelige addons: **hver addon skal tvinge spilleren til et nyt valg**, ikke bare gøre tal større.

| Addon | Plads |
|---|---|
| Kamera der dør (første) | Et kamera mister signal. Hold en knap for at genstarte. Imens er du blind der. |
| Batteri/strøm | Kameraskift koster. Man må prioritere. |
| Kamerafiltre | Nattesyn, VHS, termisk. Til svære baner. |
| Falske alarmer, voksende anomalier | Kandidater, hvis de føles retfærdige. |

## Fase 3: Del hus og Udfordring

### Server
- En lille server på Railway (Vercel kan kun vise filer). Typisk nogle få dollars om måneden.

### Deling
1. Zip-eksport (findes).
2. **Delingslink (anbefalet):** huset krypteres i browseren før upload. Nøglen ligger i linket efter `#` og sendes aldrig til serveren. Linket udløber efter 3 dage.
3. QR-kode til mobil.
- Ærlig begrænsning: spillet skal dekryptere for at spille. Det skjuler billederne for almindelige spillere, men er ikke kopibeskyttelse.
- Privatliv: dine rumbilleder forlader din enhed ved deling. Skal kræve et aktivt ja.

### Udfordring
- Du sender et link. Modtageren spiller i Udfordring-mode med skjult bibliotek.
- Resultat kan sendes tilbage.

## Fase 4: Co-op (vagtskifte)
- **Spiller A (overvåger):** ser kameraerne med anomalierne.
- **Spiller B (rapportør):** ser kun de normale billeder og klikker for at rapportere.
- A beskriver, hvor anomalien er. B finder stedet og klikker.
- Timer pr. anomali, så man skal forklare hurtigt.
- Spillet kører hos A. B sender klik, A tjekker dem mod det gemte område.
- Serveren på Railway er en postkasse mellem A og B med en kort rumkode.
- B får kun de normale rumbilleder. Anomalibillederne forlader aldrig A.
- Stemme via ekstern opringning i første version.
- Billedkvalitetstjek (er anomalien mulig at beskrive?) hører kun til co-op.

## Fase 5: Flere addons
Batteri, kamerafiltre og andre ideer, bygget på addon-systemet.

## Beslutninger
1. Endeløs: ét liv, og man vælger selv sværhedsgrad 1-3.
2. Gennemgang: fundne, missede og den der dræbte dig vises. Aldrig anomalier, der ikke kom frem.
3. Delingslink: 3 dages udløb.
4. Co-op: ekstern stemme (fx Discord) i første version.
5. Tempo: nat 1 ca. 6 på 4 minutter (ca. 1,5 pr. minut, ændret efter test), +0,5 pr. minut pr. nat.
6. Railway: venter, til du kan være med.

## Sådan blev det bygget (fase 0, 1, 2, 5)
- **Tempo** (`js/pacing.js`): antal pr. minut, samlet tilnærmelsestid (90 s på nat 1, derefter kortere), 2-4 samtidige. Rum vælges fra en "pose", så alle rum får en tur, og aldrig samme rum to gange i træk. "Mostly far" er et flueben på Layout-fanen. `node tools/simulate.js 4` viser tallene.
- **Lydhints**: 35 % chance ved spawn, og 60 % chance når noget har stået 55-85 s uden at blive set. Højst én hver 20. sekund. Lyden siger ikke hvor.
- **Gennemgang** (`js/review.js`): kort for hver anomali, der kom frem. Tryk = før/efter, swipe/Næste, "Skip all".
- **Angle-knap** fjernet. Ét foto pr. rum. Ekstra fotos fra før vises som "not used".
- **Skjult bibliotek**: viser kun antal, indtil man trykker "Show anomalies (spoilers)". Co-op-fluebenet er fjernet.
- **Hovedmenu** (`js/menu.js`): kort for Night shift, Endless, Challenge og Co-op (de to sidste nedtonet). Hver mode har sin egen startskærm.
- **Endeløs**: ét liv. I/II/III starter som nat 1/2/3 og bliver værre hvert 3./2./1,5. minut. Bedste tid gemmes pr. sværhedsgrad.
- **Addons** (`js/addons.js`): Dead cameras (hold Reboot eller B i 3 s), Battery (2,5 % pr. skift, lades langsomt op, strømsvigt ved 0), Camera filters (nattesyn, VHS, termisk, eller tilfældigt).
- Vibration ved jumpscare på mobil.
