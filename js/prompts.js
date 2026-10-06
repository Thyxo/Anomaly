// Anomaly prompt library. Used for AI generation (Mode A) and shown in the
// prompt helper for players who make their own images (Mode B).
const Prompts = (() => {
  const DIFFICULTY = { 1: 'Subtle', 2: 'Strange', 3: 'Creepy', 4: 'Severe' };

  // {where} is replaced by a location hint so the change lands somewhere we can
  // also use as a fallback click area. {obj}/{n} add variety.
  const LIBRARY = {
    1: [
      'Move one chair or small piece of furniture {where} about 30 cm and turn it so it faces the wall.',
      'Open a door or cupboard {where} about 10 cm. If it is already open, close it almost completely.',
      'Remove one picture, poster or wall decoration {where}. Leave the wall behind it plain.',
      'Turn on a lamp or light {where} that is currently off, casting a weak warm glow.',
      'Remove one small object ({obj}) from a table, shelf or counter {where}.',
      'Rotate one {obj} {where} by about 90 degrees.',
      'Pull a curtain or blind {where} slightly further open or closed than it is now.',
    ],
    2: [
      'Add an extra chair {where} that was not there before, matching the style of the room.',
      'Make every picture and frame on the wall {where} hang noticeably crooked.',
      'Mirror the text or image of one poster, label or book cover {where}, as if reflected.',
      'Duplicate one object {where} so there are two identical copies side by side.',
      'Turn one piece of furniture {where} upside down, resting neatly on the floor.',
      'Stack {n} identical {obj}s in a neat tower {where}, where nothing was before.',
      'Make one door {where} slightly too tall for its frame.',
    ],
    3: [
      'Add a tall, pale, thin human figure {where}, far in the background, half hidden in shadow. Its face is not clearly visible.',
      'Add a faint pale face looking in through a window, glass or doorway {where}.',
      'Add a dark shadow on the floor or wall {where} shaped like a standing person, with nothing there to cast it.',
      'Add the dark silhouette of a person standing very still in a doorway or corner {where}, barely visible.',
      'Add a pale hand curling around the edge of a door frame or piece of furniture {where}.',
      'Add a pair of eyes faintly reflecting light in the darkest spot {where}.',
    ],
    4: [
      'Add a trail of dark, wet footprints across the floor {where}, leading toward the camera.',
      'Make a ceiling light or lamp {where} hang wrong, on a long stretched cord, tilted as if something pulled it.',
      'Add a person {where} standing very still facing the wall, with their back to the camera. Ordinary clothes, no visible face.',
      'Add long dark scratch marks on the wall {where} at about head height.',
      'Make all the furniture {where} pushed tightly against the wall, as if something needed space.',
      'Add a figure crouching low behind furniture {where}, only the top of its head visible.',
    ],
  };

  const OBJECTS = ['cup', 'book', 'remote control', 'vase', 'shoe', 'cushion', 'bottle', 'plant pot', 'bowl', 'candle'];

  const WHERE = [
    { label: 'on the left side of the image', region: { x: 0, y: 0, w: 0.42, h: 1 }, mask: 'left' },
    { label: 'near the center of the image', region: { x: 0.28, y: 0, w: 0.44, h: 1 }, mask: 'center' },
    { label: 'on the right side of the image', region: { x: 0.58, y: 0, w: 0.42, h: 1 }, mask: 'right' },
  ];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function fill(template, where) {
    return template
      .replace('{where}', where ? where.label : 'somewhere in the room')
      .replace(/\{obj\}/g, pick(OBJECTS))
      .replace('{n}', String(3 + Math.floor(Math.random() * 3)));
  }

  const STYLE = {
    common: 'Keep everything else exactly identical: same framing, camera angle, perspective, lighting, colours, image noise and resolution. ' +
      'The change must look photorealistic and physically plausible, as if photographed by the same camera at the same moment. ' +
      'Do not add text, borders, watermarks, or any other changes.',
    creepy: 'Keep it quiet and understated, like something caught by accident on a security camera. No gore, no blood, no monsters.',
  };

  function fullPrompt(change, roomName, difficulty) {
    const lead = roomName ? `This is a photo of a ${roomName.toLowerCase()} in a private home. ` : 'This is a photo of a room in a private home. ';
    return lead + 'Edit it with exactly one change: ' + change + ' ' + STYLE.common + (difficulty >= 3 ? ' ' + STYLE.creepy : '');
  }

  // For AI generation: varied prompt + where we asked the change to appear.
  function build(roomName, difficulty, avoidTemplates = new Set()) {
    const options = LIBRARY[difficulty].filter(t => !avoidTemplates.has(t));
    const template = pick(options.length ? options : LIBRARY[difficulty]);
    const where = pick(WHERE);
    const change = fill(template, where);
    return { template, where, change, prompt: fullPrompt(change, roomName, difficulty) };
  }

  // For the Mode B helper: location left open so the player can pick anything.
  function helperList() {
    return Object.keys(LIBRARY).map(d => ({
      difficulty: Number(d),
      name: DIFFICULTY[d],
      prompts: LIBRARY[d].map(t => fullPrompt(fill(t, null), null, Number(d))),
    }));
  }

  return { DIFFICULTY, build, helperList };
})();
