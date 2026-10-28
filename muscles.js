'use strict';

/* Bhimlekha muscle map: the muscle groups (gym names), the body drawings for four views, the starting exercise
   database (each exercise's main and helping muscles) and the counting. Pure data and functions, no DOM, so it can
   be tested in Node (module.exports at the end). Loaded before track.js.

   The exercise database lives in the Google Sheet's "Exercises" tab (decision 24). This file's EXERCISES are only
   the seed written there the first time; after that the Sheet's rows are used, so the owner can add or change
   exercises there. Muscles in the Sheet are written by the names below; matching ignores case and punctuation.
   Counting: a main muscle gets the full set, a helping muscle half a set, a tertiary muscle a quarter (v2.3). */

const Muscles = (() => {
  // [key, gym name, area]. Keys are internal and never change; names are what the owner reads and types.
  const LIST = [
    ['neck', 'Neck', 'Back & traps'], ['upperTraps', 'Upper traps', 'Back & traps'], ['middleTraps', 'Mid traps', 'Back & traps'],
    ['lowerTraps', 'Lower traps', 'Back & traps'], ['rotatorCuff', 'Rotator cuff', 'Back & traps'], ['lats', 'Lats', 'Back & traps'],
    ['lowerBack', 'Lower back (erectors)', 'Back & traps'],
    ['chestUpper', 'Upper pecs', 'Chest'], ['chestMid', 'Mid pecs', 'Chest'], ['chestLower', 'Lower pecs', 'Chest'],
    ['frontDelts', 'Anterior delts', 'Shoulders'], ['sideDelts', 'Lateral delts', 'Shoulders'], ['rearDelts', 'Rear delts', 'Shoulders'],
    ['bicepsOuter', 'Biceps long head', 'Arms'], ['bicepsInner', 'Biceps short head', 'Arms'], ['brachialis', 'Brachialis', 'Arms'],
    ['triceps', 'Triceps', 'Arms'],
    ['forearmTop', 'Brachioradialis', 'Forearms'], ['forearmGrip', 'Forearm flexors', 'Forearms'], ['forearmBack', 'Forearm extensors', 'Forearms'],
    ['abs', 'Abs', 'Core'], ['obliques', 'Obliques', 'Core'], ['serratus', 'Serratus anterior', 'Core'],
    ['glutes', 'Glute max', 'Glutes & hips'], ['outerHip', 'Glute medius', 'Glutes & hips'], ['hipFlexors', 'Hip flexors', 'Glutes & hips'],
    ['quads', 'Quads', 'Legs'], ['hamstrings', 'Hamstrings', 'Legs'], ['innerThighs', 'Adductors', 'Legs'],
    ['calfInner', 'Gastrocnemius inner head', 'Calves'], ['calfOuter', 'Gastrocnemius outer head', 'Calves'], ['calfLower', 'Soleus', 'Calves'],
    ['shins', 'Tibialis', 'Calves'],
  ];
  const MUSCLES = LIST.map(([key, name, area]) => ({ key, name, area }));

  // v2.3: weekly hard-set target per muscle, [sets, direct] (owner's table, 2026-10-25). direct = only sets where the
  // muscle is a main muscle count toward it; otherwise all sets count (helping ½, tertiary ¼). Biceps: the table's
  // 12 direct for the whole biceps applies to each head (curls train both). Gastrocnemius 8 applies to both heads.
  // Neck and rotator cuff have no target (0). Editable per muscle in Settings → Muscle set targets.
  const TARGETS = {
    chestUpper: [6, false], chestMid: [5, false], chestLower: [4, false],
    frontDelts: [4, true], sideDelts: [12, false], rearDelts: [10, false],
    lats: [14, false], upperTraps: [6, true], middleTraps: [8, false], lowerTraps: [4, false], lowerBack: [6, false],
    bicepsOuter: [12, true], bicepsInner: [12, true], brachialis: [6, true], triceps: [10, true],
    forearmTop: [6, true], forearmGrip: [6, true], forearmBack: [4, true],
    obliques: [6, false], abs: [8, false], quads: [14, false], hamstrings: [12, false],
    glutes: [12, false], outerHip: [6, true], innerThighs: [6, true],
    calfInner: [8, false], calfOuter: [8, false], calfLower: [6, false], shins: [6, false],
    hipFlexors: [4, true], serratus: [4, true], neck: [0, false], rotatorCuff: [0, false],
  };
  const BY_KEY = Object.fromEntries(MUSCLES.map((m) => [m.key, m]));

  // Other ways a muscle may be written in the Sheet → key.
  const ALIASES = {
    traps: 'upperTraps', 'middle traps': 'middleTraps', 'mid traps': 'middleTraps', rhomboids: 'middleTraps', 'lower back': 'lowerBack',
    erectors: 'lowerBack', 'upper chest': 'chestUpper', 'mid chest': 'chestMid', 'middle chest': 'chestMid', chest: 'chestMid', pecs: 'chestMid',
    'lower chest': 'chestLower', 'front delts': 'frontDelts', 'side delts': 'sideDelts', 'lateral delt': 'sideDelts', 'rear delt': 'rearDelts',
    'posterior delts': 'rearDelts', 'anterior delt': 'frontDelts', 'long head': 'bicepsOuter', 'short head': 'bicepsInner', biceps: 'bicepsInner',
    forearms: 'forearmGrip', 'forearm flexor': 'forearmGrip', 'forearm extensor': 'forearmBack', 'glute max': 'glutes', glutes: 'glutes',
    'gluteus maximus': 'glutes', 'glute med': 'outerHip', 'gluteus medius': 'outerHip', abductors: 'outerHip', adductor: 'innerThighs',
    'inner thighs': 'innerThighs', quadriceps: 'quads', calves: 'calfInner', gastrocnemius: 'calfInner', 'inner calf': 'calfInner',
    'outer calf': 'calfOuter', 'tibialis anterior': 'shins', shins: 'shins', 'hip flexor': 'hipFlexors', core: 'abs', serratus: 'serratus',
  };
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => (w.length > 4 && /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
      .join(' ');
  const NAME_TO_KEY = new Map();
  for (const m of MUSCLES) {
    NAME_TO_KEY.set(norm(m.name), m.key);
    NAME_TO_KEY.set(norm(m.key), m.key);
  }
  for (const [a, k] of Object.entries(ALIASES)) NAME_TO_KEY.set(norm(a), k);
  const muscleKey = (text) => NAME_TO_KEY.get(norm(text)) || null;

  const SKIN = [
    ['skin', '', 'M100,10 C112,10 122,22 122,36 C122,52 112,62 100,62 C88,62 78,52 78,36 C78,22 88,10 100,10 Z', false],
    ['skin', '', 'M92,56 L100,56 L100,80 L90,80 C91,72 92,64 92,56 Z', true],
    ['skin', '', 'M100,74 L90,74 C80,80 64,82 56,86 C46,92 46,108 50,122 C56,140 64,150 66,170 C68,190 70,205 70,215 C66,232 62,250 64,272 L100,286 Z', true],
    ['skin', '', 'M57,87 C45,91 40,110 40,130 C38,150 36,170 36,186 C32,210 30,230 32,252 C33,258 36,262 40,264 C44,262 46,256 46,248 C50,226 54,204 54,186 C56,168 60,150 60,126 C60,106 60,94 57,87 Z', true],
    ['skin', '', 'M40,250 C34,252 32,262 34,272 C36,280 42,282 46,276 C48,268 48,258 46,250 Z', true],
    ['skin', '', 'M64,268 C60,300 61,330 67,352 C65,380 67,410 73,434 L91,436 C93,410 95,380 95,356 C99,330 100,300 100,284 Z', true],
    ['skin', '', 'M72,432 C66,436 64,444 70,448 L92,448 C94,442 93,436 91,432 Z', true],
  ];
  // Muscles tile the body with thin gaps; only head, hands, knees and feet stay skin.
  const FOREARM_OUT = 'M46,186 C38,193 33,206 33,222 C34,232 36,240 39,246 C40,228 43,206 50,190 Z';
  const FOREARM_IN = 'M50.5,190 C43.5,206 40.5,228 39.5,246 C41,250 44,250 47,248 C50,228 54,208 55,188 Z';
  const FIG = {
    front: [
      ...SKIN,
      ['m', 'neck', 'M92,58 L99,58 L99,75 C96,73 93,71 91,69 Z', true],
      ['m', 'upperTraps', 'M90.5,71 C87,76 78,81 63,85 C68,88 73,89 77,89 C85,86 92,82 99,79 L99,77 C95,75 92,73 90.5,71 Z', true],
      ['m', 'sideDelts', 'M60,86 C49,89 43,100 44,113 C44,119 46,124 49,128 C47,115 50,98 61,88 Z', true],
      ['m', 'frontDelts', 'M63.5,88 C55,88 49.5,96 48.5,108 C48.5,117 50.5,123 53.5,128 C57.5,117 64.5,106 72.5,96 C70.5,92 67,89 63.5,88 Z', true],
      ['m', 'chestUpper', 'M99,90.5 C86,89.5 77,91.5 73,96 C69,100 67,106 66,111.5 C77,107.5 88,106.5 99,107.5 Z', true],
      ['m', 'chestMid', 'M65.5,113 C64,118 64,123 64.5,127.5 C75.5,123.5 87.5,122.5 99,123.5 L99,109 C88,108 76.5,109 65.5,113 Z', true],
      ['m', 'chestLower', 'M64.5,129 C65,133 66.5,136.5 68.5,138.5 C76.5,145 88.5,146.5 99,141.5 L99,125 C87.5,124 75.5,125 64.5,129 Z', true],
      ['m', 'serratus', 'M57.5,124 C58.5,135 61.5,148 65.5,161 C67.5,159.5 69.5,158 71.5,156.5 C69.5,149 67.5,143 66,139 C63.5,134.5 61.5,130 60,125 Z', true],
      ['m', 'abs', 'M99,145 L87.5,146.5 C85.5,170 85.5,200 86.5,236 C89.5,250 94,257 99,260 Z', true],
      ['m', 'obliques', 'M85.5,147.5 C78,150 73,157 72,163 C71.5,185 73,205 75,221 C76,231 79,239 83,245 L85.5,243 C84.5,210 84,177 85.5,147.5 Z', true],
      ['m', 'hipFlexors', 'M74,226 C70.5,239 68.5,252 68.5,264 C76,269.5 86,273.5 94.5,276 C90.5,266 86.5,256 84,249 C80,243 77,235.5 74,226 Z', true],
      ['m', 'outerHip', 'M66.5,244 C63.5,254 62.5,264 64,275 L67,280 C67,268 67.5,257 70.5,247 Z', true],
      ['m', 'quads', 'M68.5,279 C62.5,296 61.5,322 65.5,342 C70.5,352 80.5,356 90,352 C93,346 94,340 94,334 C95,312 94,296 92,286 C86,276.5 74.5,274.5 68.5,279 Z', true],
      ['m', 'innerThighs', 'M95,281 C99,292 99.5,306 99,322 C98,333 96.5,341 95,347 C95.5,333 96,312 95.5,296 Z', true],
      ['m', 'calfOuter', 'M68,364 C65,382 66,402 70,418 L73.5,418 C72,402 72,382 73,364 Z', true],
      ['m', 'shins', 'M75,360 C73,382 75,406 79,427 L84,427 C82,404 81,382 81,360 Z', true],
      ['m', 'calfInner', 'M83,362 C88,374 92,390 90.5,409 L86,416 C86.5,398 86.5,380 83,364 Z', true],
      ['m', 'bicepsOuter', 'M52,130 C45,138 42,154 43,168 C44,175 46,180 49,182 C48,166 48,148 52,130 Z', true],
      ['m', 'bicepsInner', 'M52.5,130 C48.5,148 48.5,166 49.5,182 C52,183 55,181 57,177 C61,162 61,144 58.5,130 Z', true],
      ['m', 'brachialis', 'M44.5,156 C40.5,165 40.5,176 43.5,185 L48,185 C45.5,177 45.5,167 46.5,158 Z', true],
      ['m', 'forearmTop', FOREARM_OUT, true],
      ['m', 'forearmGrip', FOREARM_IN, true],
      ['fib', '', 'M88,170 L99,170 M87.5,194 L99,194 M87.5,218 L99,218', true],
      ['fib', '', 'M79,300 C78,318 79,334 82,346', true],
    ],
    back: [
      ...SKIN,
      ['m', 'upperTraps', 'M99,57 L93,59 C92,67 88,75 80,79 C72,83 64,85.5 58.5,87.5 C66,91.5 74,93.5 80,93.5 C88,93.5 95,95.5 99,97.5 Z', true],
      ['m', 'middleTraps', 'M99,99 C92,97.5 84,97.5 76.5,97.5 C76.5,105 80.5,114 88,121.5 L99,125 Z', true],
      ['m', 'lowerTraps', 'M99,126.5 L88.5,124 C90.5,140 94,158 99,176 Z', true],
      ['m', 'sideDelts', 'M60,86 C49,89 43,100 44,113 C44,119 46,124 49,128 C47,115 50,98 61,88 Z', true],
      ['m', 'rearDelts', 'M62.5,89 C54.5,89 48.5,97 47.5,108 C47.5,117 49.5,123 52.5,128 C57.5,117 64.5,106 73.5,97.5 C70.5,92.5 66.5,89.5 62.5,89 Z', true],
      ['m', 'rotatorCuff', 'M75.5,99 C69.5,105 66.5,114.5 66.5,124 C73.5,127 81.5,126 87.5,122.5 C83,114.5 79,106 75.5,99 Z', true],
      ['m', 'lats', 'M66,126.5 C64,144 66,164 72,182 C77,196 84,206 89.5,212 L89.5,186 C90.5,170 89.5,150 88.5,125 C81,128.5 73,128.5 66,126.5 Z', true],
      ['m', 'lowerBack', 'M99,178.5 C94.5,184 91.5,192 91.5,206 L91.5,226 C93.5,236 96,242 99,246 Z', true],
      ['m', 'obliques', 'M71,187 C69.5,206 69.5,226 67.5,246 C75.5,250 83.5,250.5 89.5,247 L89.5,214 C83.5,208 77,198 71,187 Z', true],
      ['m', 'glutes', 'M99,250 C88,246 72,248 66,262 C62,276 66,292 76,296 C86,298 95,294 99,288 Z', true],
      ['m', 'outerHip', 'M67.5,248.5 C64,256 63,264 64,272 C66.5,262 72.5,254.5 82,251 C76,249.5 72,249 67.5,248.5 Z', true],
      ['m', 'hamstrings', 'M66,298 C62,316 63,336 69,350 C78,356 90,356 95,350 C98,332 98,312 96,298 C88,292 74,292 66,298 Z', true],
      ['m', 'calfOuter', 'M70.5,360 C65,376 65,394 71,404 C74.5,406 78,407 81,407 C80,390 80,374 82,358 C78,357 73.5,357.5 70.5,360 Z', true],
      ['m', 'calfInner', 'M82.5,358 C80.5,374 80.5,390 81.5,407 C85.5,407 89.5,406 92.5,404 C96.5,392 96.5,374 93,361 C89.5,358 86,357 82.5,358 Z', true],
      ['m', 'calfLower', 'M72,407.5 C74.5,417 78.5,425 84,428 C89.5,425 92.5,417 92.5,407 C88,411 77,411 72,407.5 Z', true],
      ['m', 'triceps', 'M52,128 C45,138 42,154 43,170 C45,180 50,186 56,182 C60,166 60,146 58,128 Z', true],
      ['m', 'forearmTop', FOREARM_OUT, true],
      ['m', 'forearmBack', FOREARM_IN, true],
      ['fib', '', 'M100,58 L100,250', false],
      ['fib', '', 'M81,300 C80,318 81,334 83,348', true],
    ],
    // Left side: the body faces left (front at small x). Torso and legs first, then the arm on top.
    left: [
      ['skin', '', 'M100,10 C114,10 124,22 122,38 C121,50 114,60 102,62 C92,62 84,56 80,46 L76,40 L80,36 C80,20 88,10 100,10 Z', false],
      ['skin', '', 'M91,56 L109,56 L111,82 L89,82 Z', false],
      ['skin', '', 'M90,78 C76,86 68,100 70,118 C72,140 76,170 78,200 C78,228 76,248 80,266 C78,290 80,320 88,352 C88,380 90,410 94,432 L80,438 C72,440 72,447 80,448 L108,448 C110,440 108,436 106,432 C110,412 120,392 114,364 C118,344 124,316 122,296 C132,282 134,258 126,242 C118,230 114,218 116,206 C120,180 128,148 126,120 C124,100 118,86 110,78 Z', false],
      ['m', 'neck', 'M92,58 L104,58 C104,66 101,74 97,81 L90,81 Z', false],
      ['m', 'upperTraps', 'M106,58 C110,68 117,80 123,94 L113,92 C109.5,84 106.5,72 104.5,60 Z', false],
      ['m', 'chestUpper', 'M72,100 C70,106 69,112 69,117 L87,114 C86,108 87,102 90,98 Z', false],
      ['m', 'chestMid', 'M69,118.5 C69,122 69,125.5 70,128.5 L88,125.5 C87,122 87,118.5 87,115.5 Z', false],
      ['m', 'chestLower', 'M70.5,130 C71.5,133 72.5,135 74,137 L88.5,133.5 C88.5,131 88.5,129 88.5,127 Z', false],
      ['m', 'abs', 'M74,139 C73.5,166 75.5,190 79.5,212 L86,212 C82,190 80,166 80.5,139 Z', false],
      ['m', 'obliques', 'M82,140 C80.5,166 82.5,190 87,213 L99,211 C99,188 98.5,164 96.5,142 Z', false],
      ['m', 'lats', 'M118,122 C122,146 122,172 116,198 L126,194 C132,168 132,142 128,120 Z', false],
      ['m', 'lowerBack', 'M116,200 C120,214 120,228 116,242 L104.5,242 C106.5,226 106.5,212 104.5,202 Z', false],
      ['m', 'hipFlexors', 'M80,215 C78,232 78,250 82,266 L96.5,262 C94.5,248 94.5,232 96.5,215 Z', false],
      ['m', 'outerHip', 'M98.5,244 C96.5,256 96.5,268 100.5,280 L110,278 C108,266 108,254 110,244 Z', false],
      ['m', 'glutes', 'M112,244 C128,248 134,262 130,280 C126,292 116,296 106,294 C108,276 108,260 112,244 Z', false],
      ['m', 'quads', 'M80,272 C76,300 78,330 86,352 L99.5,352 C99.5,330 99.5,302 98,282 Z', false],
      ['m', 'hamstrings', 'M102,296 C116,310 120,332 110,354 L101.5,354 C101.5,334 101.5,314 100.5,298 Z', false],
      ['m', 'calfOuter', 'M106,362 C118,372 120,392 113,406 L104,406 C106,390 106,376 104,364 Z', false],
      ['m', 'calfLower', 'M104,408 L112,408 C112,418 109,426 105,430 L102,430 C103,422 104,414 104,408 Z', false],
      ['m', 'shins', 'M90,364 C88,386 90,408 94,428 L98,428 C96,406 95.5,386 95.5,366 Z', false],
      ['fib', '', 'M89,280 C85,302 87,330 93,348', false],
      ['skin', '', 'M104,88 C94,88 88,100 90,122 C90,150 92,170 94,188 C92,210 92,232 94,252 C92,262 94,272 100,276 C106,272 108,264 106,252 C110,232 112,210 110,188 C114,166 118,140 118,118 C118,98 112,88 104,88 Z', false],
      ['m', 'serratus', 'M88,136 C86.5,144 86.5,152 88.5,160 L90,160 C89.5,152 89.5,144 90.5,136 Z', false],
      ['m', 'frontDelts', 'M92,94 C88,102 88,112 92,120 L95.5,120 C93.5,110 93.5,100 97.5,92 Z', false],
      ['m', 'sideDelts', 'M100,86 C92,88 91,102 95,120 C100,123 108,123 113,120 C117,102 112,88 104,86 Z', false],
      ['m', 'rearDelts', 'M112.5,90 C116.5,98 118.5,108 116.5,120 L113.5,120 C114.5,108 112.5,98 108.5,90 Z', false],
      ['m', 'bicepsOuter', 'M92,126 C88,144 88,160 91,172 L99,172 C98,158 98,142 99,126 Z', false],
      ['m', 'triceps', 'M101,126 C102,142 102,162 103,182 L110,182 C114,164 116,142 114,124 Z', false],
      ['m', 'brachialis', 'M91.5,174 C92.5,178 94,182 96,185 L102,185 C101.5,181 101,177 100.5,174 Z', false],
      ['m', 'forearmTop', 'M93,190 C90,208 90,228 94,248 L99.5,248 C97.5,228 97.5,208 99.5,190 Z', false],
      ['m', 'forearmBack', 'M100.5,190 C98.5,208 98.5,228 100.5,248 L106,248 C110,228 110,208 108,190 Z', false],
    ],
  };

  // Which view shows a muscle best (for jumping there from a list). v2.5: the tab shows front and back only.
  const VIEW_OF = {};
  for (const k of ['upperTraps', 'middleTraps', 'lowerTraps', 'rotatorCuff', 'lats', 'lowerBack', 'rearDelts', 'triceps', 'glutes', 'hamstrings',
    'calfInner', 'calfOuter', 'calfLower', 'forearmBack']) VIEW_OF[k] = 'back';

  /* ---------------------------------------------------------------- the starting exercise database */
  // [exercise, equipment, main muscles, helping muscles]. At least 4–5 exercises have each muscle as a main
  // muscle, across barbell, dumbbell, cable, machine and bodyweight. The owner's own exercise names are included.
  const EXERCISES = [
    // Chest
    ['Barbell Bench Press', 'Barbell', ['chestMid'], ['chestUpper', 'chestLower', 'frontDelts', 'triceps']],
    ['Dumbbell Bench Press', 'Dumbbell', ['chestMid'], ['chestUpper', 'chestLower', 'frontDelts', 'triceps']],
    ['Seated Chest Press Machine', 'Machine', ['chestMid'], ['chestLower', 'frontDelts', 'triceps']],
    ['Cable Chest Fly', 'Cable', ['chestMid'], ['chestUpper', 'chestLower', 'frontDelts']],
    ['Pec Deck', 'Machine', ['chestMid'], ['chestUpper', 'frontDelts']],
    ['Push-Up', 'Bodyweight', ['chestMid'], ['triceps', 'frontDelts', 'serratus', 'abs']],
    ['Incline Barbell Bench Press', 'Barbell', ['chestUpper'], ['chestMid', 'frontDelts', 'triceps']],
    ['Incline Dumbbell Press', 'Dumbbell', ['chestUpper'], ['chestMid', 'frontDelts', 'triceps']],
    ['Incline Chest Press Machine', 'Machine', ['chestUpper'], ['chestMid', 'frontDelts', 'triceps']],
    ['Low-to-High Cable Fly', 'Cable', ['chestUpper'], ['frontDelts']],
    ['Smith Machine Incline Press', 'Smith machine', ['chestUpper'], ['chestMid', 'frontDelts', 'triceps']],
    ['Chest Dips', 'Bodyweight', ['chestLower', 'triceps'], ['frontDelts']],
    ['Decline Barbell Bench Press', 'Barbell', ['chestLower'], ['chestMid', 'triceps']],
    ['Decline Dumbbell Press', 'Dumbbell', ['chestLower'], ['chestMid', 'triceps']],
    ['High-to-Low Cable Fly', 'Cable', ['chestLower'], ['chestMid']],
    ['Decline Chest Press Machine', 'Machine', ['chestLower'], ['chestMid', 'triceps']],
    // Shoulders
    ['Barbell Overhead Press', 'Barbell', ['frontDelts'], ['sideDelts', 'triceps', 'upperTraps', 'serratus']],
    ['Seated Dumbbell Shoulder Press', 'Dumbbell', ['frontDelts'], ['sideDelts', 'triceps']],
    ['Seated Shoulder Press Machine', 'Machine', ['frontDelts'], ['sideDelts', 'triceps']],
    ['Shoulder Press Machine', 'Machine', ['frontDelts'], ['sideDelts', 'triceps']],
    ['Dumbbell Front Raise', 'Dumbbell', ['frontDelts'], ['chestUpper', 'serratus']],
    ['Cable Front Raise', 'Cable', ['frontDelts'], ['chestUpper']],
    ['Arnold Press', 'Dumbbell', ['frontDelts', 'sideDelts'], ['triceps']],
    ['Dumbbell Lateral Raise', 'Dumbbell', ['sideDelts'], ['upperTraps']],
    ['Cable Lateral Raises', 'Cable', ['sideDelts'], ['upperTraps']],
    ['Lateral Raise Machine', 'Machine', ['sideDelts'], ['upperTraps']],
    ['Cable Y-Raise', 'Cable', ['sideDelts', 'lowerTraps'], ['rearDelts', 'middleTraps']],
    ['Barbell Upright Row', 'Barbell', ['sideDelts', 'upperTraps'], ['bicepsOuter', 'forearmTop']],
    ['Reverse Pec Deck', 'Machine', ['rearDelts'], ['middleTraps', 'rotatorCuff']],
    ['Face Pulls', 'Cable', ['rearDelts'], ['rotatorCuff', 'middleTraps', 'lowerTraps']],
    ['Bent-Over Dumbbell Reverse Fly', 'Dumbbell', ['rearDelts'], ['middleTraps', 'rotatorCuff']],
    ['Cable Rear Delt Fly', 'Cable', ['rearDelts'], ['middleTraps']],
    ['Dumbbell Rear Delt Row', 'Dumbbell', ['rearDelts'], ['middleTraps', 'lats', 'bicepsOuter']],
    // Traps, neck, rotator cuff
    ['Barbell Shrug', 'Barbell', ['upperTraps'], ['forearmGrip']],
    ['Dumbbell Shrug', 'Dumbbell', ['upperTraps'], ['forearmGrip']],
    ['Smith Machine Shrug', 'Smith machine', ['upperTraps'], ['forearmGrip']],
    ['Cable Shrug', 'Cable', ['upperTraps'], ['forearmGrip']],
    ["Farmer's Carry", 'Dumbbell', ['upperTraps', 'forearmGrip'], ['obliques', 'abs', 'calfInner', 'calfOuter']],
    ['Prone Y-Raise', 'Dumbbell', ['lowerTraps'], ['middleTraps', 'rearDelts']],
    ['Cable Lower Trap Raise', 'Cable', ['lowerTraps'], ['middleTraps']],
    ['Scapular Pull-Up', 'Bodyweight', ['lowerTraps'], ['lats', 'forearmGrip']],
    ['Wall Slide', 'Bodyweight', ['lowerTraps', 'serratus'], ['middleTraps']],
    ['Plate Neck Curl', 'Plate', ['neck'], []],
    ['Plate Neck Extension', 'Plate', ['neck'], ['upperTraps']],
    ['Neck Harness Extension', 'Plate', ['neck'], ['upperTraps']],
    ['4-Way Neck Machine', 'Machine', ['neck'], ['upperTraps']],
    ['Cable External Rotation', 'Cable', ['rotatorCuff'], ['rearDelts']],
    ['Side-Lying Dumbbell External Rotation', 'Dumbbell', ['rotatorCuff'], ['rearDelts']],
    ['Band External Rotation', 'Band', ['rotatorCuff'], ['rearDelts']],
    ['Cuban Press', 'Dumbbell', ['rotatorCuff', 'rearDelts'], ['sideDelts', 'middleTraps']],
    // Back
    ['Lat Pulldown', 'Cable', ['lats'], ['bicepsInner', 'brachialis', 'middleTraps', 'rearDelts']],
    ['Neutral-Grip Lat Pulldown', 'Cable', ['lats'], ['brachialis', 'bicepsInner', 'forearmTop']],
    ['Single-Arm Cable Pulldown', 'Cable', ['lats'], ['bicepsInner', 'obliques']],
    ['Straight-Arm Pulldown', 'Cable', ['lats'], ['triceps', 'abs', 'chestLower']],
    ['Pull-Up', 'Bodyweight', ['lats'], ['bicepsInner', 'brachialis', 'lowerTraps', 'forearmGrip', 'abs']],
    ['Chin-Up', 'Bodyweight', ['lats', 'bicepsInner'], ['bicepsOuter', 'brachialis', 'forearmGrip']],
    ['One-Arm Dumbbell Row', 'Dumbbell', ['lats'], ['middleTraps', 'rearDelts', 'bicepsOuter']],
    ['Machine Pullover', 'Machine', ['lats'], ['chestLower', 'serratus', 'triceps']],
    ['Seated Cable Row', 'Cable', ['middleTraps', 'lats'], ['rearDelts', 'bicepsOuter', 'bicepsInner', 'forearmGrip']],
    ['Chest-Supported Row Machine', 'Machine', ['middleTraps', 'lats'], ['rearDelts', 'bicepsInner', 'brachialis']],
    ['Barbell Bent-Over Row', 'Barbell', ['middleTraps', 'lats'], ['rearDelts', 'lowerBack', 'bicepsOuter', 'forearmGrip']],
    ['T-Bar Row', 'Barbell', ['middleTraps', 'lats'], ['rearDelts', 'lowerBack', 'bicepsOuter']],
    ['Chest-Supported Dumbbell Row', 'Dumbbell', ['middleTraps'], ['lats', 'rearDelts', 'bicepsOuter']],
    ['45° Back Extension (weighted)', 'Bodyweight', ['lowerBack', 'glutes'], ['hamstrings']],
    ['Back Extension Machine', 'Machine', ['lowerBack'], ['glutes', 'hamstrings']],
    ['Conventional Deadlift', 'Barbell', ['lowerBack', 'glutes', 'hamstrings'], ['quads', 'upperTraps', 'forearmGrip', 'lats']],
    ['Good Morning', 'Barbell', ['hamstrings', 'lowerBack'], ['glutes']],
    ['Superman Hold', 'Bodyweight', ['lowerBack'], ['glutes', 'rearDelts']],
    // Biceps and brachialis
    ['Barbell Curl', 'Barbell', ['bicepsOuter', 'bicepsInner'], ['brachialis', 'forearmGrip']],
    ['Dumbbell Curl', 'Dumbbell', ['bicepsOuter', 'bicepsInner'], ['brachialis', 'forearmGrip']],
    ['Incline Dumbbell Curl', 'Dumbbell', ['bicepsOuter'], ['bicepsInner']],
    ['Bayesian Cable Curl', 'Cable', ['bicepsOuter'], ['bicepsInner']],
    ['Drag Curl', 'Barbell', ['bicepsOuter'], ['bicepsInner', 'brachialis']],
    ['Cable Preacher Curl', 'Cable', ['bicepsInner'], ['brachialis', 'bicepsOuter']],
    ['Preacher Curl Machine', 'Machine', ['bicepsInner'], ['brachialis', 'bicepsOuter']],
    ['EZ-Bar Preacher Curl', 'EZ-bar', ['bicepsInner'], ['brachialis']],
    ['Concentration Curl', 'Dumbbell', ['bicepsInner'], ['bicepsOuter']],
    ['Spider Curl', 'Dumbbell', ['bicepsInner'], ['bicepsOuter']],
    ['Rope Hammer Curl', 'Cable', ['brachialis', 'forearmTop'], ['bicepsOuter']],
    ['Dumbbell Hammer Curl', 'Dumbbell', ['brachialis', 'forearmTop'], ['bicepsOuter']],
    ['Cross-Body Hammer Curl', 'Dumbbell', ['brachialis', 'forearmTop'], ['bicepsOuter']],
    ['Reverse EZ-Bar Curl', 'EZ-bar', ['brachialis', 'forearmTop', 'forearmBack'], ['bicepsOuter']],
    ['Reverse-Grip Cable Curl', 'Cable', ['brachialis', 'forearmTop', 'forearmBack'], ['bicepsOuter']],
    ['Zottman Curl', 'Dumbbell', ['forearmTop', 'forearmBack', 'bicepsOuter'], ['brachialis']],
    // Triceps
    ['Overhead Rope Triceps Extension', 'Cable', ['triceps'], []],
    ['Rope Pushdown', 'Cable', ['triceps'], ['forearmBack']],
    ['Close-Grip Bench Press', 'Barbell', ['triceps'], ['chestMid', 'frontDelts']],
    ['Skull Crusher', 'EZ-bar', ['triceps'], []],
    ['Dumbbell Overhead Triceps Extension', 'Dumbbell', ['triceps'], []],
    ['Cable Triceps Kickback', 'Cable', ['triceps'], []],
    ['Bench Dips', 'Bodyweight', ['triceps'], ['frontDelts', 'chestLower']],
    // Forearms
    ['Barbell Wrist Curl', 'Barbell', ['forearmGrip'], []],
    ['Dumbbell Wrist Curl', 'Dumbbell', ['forearmGrip'], []],
    ['Cable Wrist Curl', 'Cable', ['forearmGrip'], []],
    ['Dead Hang', 'Bodyweight', ['forearmGrip'], ['lats', 'lowerTraps']],
    ['Barbell Reverse Wrist Curl', 'Barbell', ['forearmBack'], ['forearmTop']],
    ['Dumbbell Reverse Wrist Curl', 'Dumbbell', ['forearmBack'], []],
    ['Cable Reverse Wrist Curl', 'Cable', ['forearmBack'], []],
    // Core
    ['Plank', 'Bodyweight', ['abs'], ['obliques', 'serratus']],
    ['Cable Crunch', 'Cable', ['abs'], ['obliques']],
    ["Captain's Chair Knee Raise", 'Machine', ['abs', 'hipFlexors'], ['obliques']],
    ['Hanging Leg Raise', 'Bodyweight', ['abs', 'hipFlexors'], ['obliques', 'forearmGrip']],
    ['Ab Wheel Rollout', 'Bodyweight', ['abs'], ['lats', 'serratus', 'obliques']],
    ['Crunch Machine', 'Machine', ['abs'], ['obliques']],
    ['Decline Sit-Up', 'Bodyweight', ['abs', 'hipFlexors'], ['obliques']],
    ['Cable Woodchop', 'Cable', ['obliques'], ['abs', 'serratus']],
    ['Side Plank', 'Bodyweight', ['obliques'], ['abs', 'outerHip']],
    ['Russian Twist', 'Plate', ['obliques'], ['abs', 'hipFlexors']],
    ['Pallof Press', 'Cable', ['obliques', 'abs'], []],
    ['Dumbbell Side Bend', 'Dumbbell', ['obliques'], ['lowerBack']],
    ['Cable Serratus Punch', 'Cable', ['serratus'], ['frontDelts']],
    ['Push-Up Plus', 'Bodyweight', ['serratus'], ['chestMid', 'triceps']],
    ['Landmine Press', 'Barbell', ['frontDelts', 'serratus'], ['chestUpper', 'triceps']],
    ['Dumbbell Pullover', 'Dumbbell', ['lats', 'serratus'], ['chestMid', 'triceps']],
    // Glutes and hips
    ['Hip Thrust Machine', 'Machine', ['glutes'], ['hamstrings', 'outerHip']],
    ['Barbell Hip Thrust', 'Barbell', ['glutes'], ['hamstrings', 'outerHip', 'quads']],
    ['Cable Glute Kickback', 'Cable', ['glutes'], ['hamstrings', 'outerHip']],
    ['Glute Bridge', 'Bodyweight', ['glutes'], ['hamstrings']],
    ['Bulgarian Split Squat', 'Dumbbell', ['quads', 'glutes'], ['innerThighs', 'outerHip', 'hamstrings']],
    ['Cable Pull-Through', 'Cable', ['glutes', 'hamstrings'], ['lowerBack']],
    ['Hip Abduction Machine', 'Machine', ['outerHip'], ['glutes']],
    ['Cable Hip Abduction', 'Cable', ['outerHip'], ['glutes']],
    ['Banded Lateral Walk', 'Band', ['outerHip'], ['glutes', 'quads']],
    ['Side-Lying Hip Abduction', 'Bodyweight', ['outerHip'], ['obliques']],
    ['Single-Leg Romanian Deadlift', 'Dumbbell', ['hamstrings', 'glutes', 'outerHip'], ['lowerBack', 'forearmGrip']],
    ['Cable Knee Drive', 'Cable', ['hipFlexors'], ['abs', 'quads']],
    ['Lying Leg Raise', 'Bodyweight', ['hipFlexors', 'abs'], []],
    // Legs
    ['Leg Press', 'Machine', ['quads', 'glutes'], ['innerThighs', 'hamstrings']],
    ['Leg Extension', 'Machine', ['quads'], []],
    ['Barbell Back Squat', 'Barbell', ['quads', 'glutes'], ['innerThighs', 'lowerBack', 'hamstrings', 'abs']],
    ['Hack Squat Machine', 'Machine', ['quads'], ['glutes', 'innerThighs']],
    ['Goblet Squat', 'Dumbbell', ['quads', 'glutes'], ['abs', 'innerThighs']],
    ['Walking Lunge', 'Dumbbell', ['quads', 'glutes'], ['innerThighs', 'outerHip', 'hamstrings']],
    ['Sissy Squat', 'Bodyweight', ['quads'], ['hipFlexors']],
    ['Romanian Deadlift', 'Barbell', ['hamstrings', 'glutes'], ['lowerBack', 'forearmGrip', 'innerThighs']],
    ['Seated Leg Curl', 'Machine', ['hamstrings'], ['calfInner', 'calfOuter']],
    ['Lying Leg Curl', 'Machine', ['hamstrings'], ['calfInner', 'calfOuter']],
    ['Nordic Curl', 'Bodyweight', ['hamstrings'], ['calfInner', 'calfOuter']],
    ['Stiff-Leg Dumbbell Deadlift', 'Dumbbell', ['hamstrings'], ['glutes', 'lowerBack']],
    ['Hip Adduction Machine', 'Machine', ['innerThighs'], []],
    ['Cable Hip Adduction', 'Cable', ['innerThighs'], []],
    ['Sumo Squat', 'Dumbbell', ['innerThighs', 'quads', 'glutes'], []],
    ['Copenhagen Plank', 'Bodyweight', ['innerThighs'], ['obliques']],
    ['Sumo Deadlift', 'Barbell', ['glutes', 'innerThighs', 'hamstrings'], ['lowerBack', 'quads', 'forearmGrip']],
    // Calves and shins
    ['Standing Calf Raise', 'Machine', ['calfInner', 'calfOuter'], ['calfLower']],
    ['Leg Press Calf Raise', 'Machine', ['calfInner', 'calfOuter'], ['calfLower']],
    ['Smith Machine Calf Raise', 'Smith machine', ['calfInner', 'calfOuter'], ['calfLower']],
    ['Single-Leg Dumbbell Calf Raise', 'Dumbbell', ['calfInner', 'calfOuter'], ['calfLower']],
    ['Donkey Calf Raise', 'Machine', ['calfInner', 'calfOuter'], ['calfLower']],
    ['Seated Calf Raise', 'Machine', ['calfLower'], ['calfInner', 'calfOuter']],
    ['Seated Dumbbell Calf Raise', 'Dumbbell', ['calfLower'], ['calfInner', 'calfOuter']],
    ['Smith Machine Seated Calf Raise', 'Smith machine', ['calfLower'], ['calfInner', 'calfOuter']],
    ['Bent-Knee Calf Raise', 'Bodyweight', ['calfLower'], ['calfInner', 'calfOuter']],
    ['Tibialis Raise', 'Bodyweight', ['shins'], []],
    ['Tib Bar Raise', 'Plate', ['shins'], []],
    ['Cable Toe Raise', 'Cable', ['shins'], []],
    ['Banded Dorsiflexion', 'Band', ['shins'], []],
    ['Heel Walk', 'Bodyweight', ['shins'], ['calfLower']],
  ];

  /* ---------------------------------------------------------------- database rows */

  // Sheet rows ⇄ database entries. A row: { name, equipment, main: "Mid pecs, …", helps: "…", minor: "…" (tertiary), notes }.
  const seedRows = () =>
    EXERCISES.map(([name, equipment, main, helps]) => ({
      name, equipment, main: main.map((k) => BY_KEY[k].name).join(', '), helps: helps.map((k) => BY_KEY[k].name).join(', '), minor: '', notes: '',
    }));

  // Rows (from the Sheet or the seed) → { list: [{ name, equipment, main: [keys], helps: [keys], minor: [keys], aliases: [names] }],
  // index (name and every alias → entry), unknown: [muscle names not recognised] }. A row's "Also called" cell
  // (aliases) holds other names the owner uses for the same exercise, separated by commas.
  function buildDb(rows) {
    const unknown = new Set();
    const keys = (text) =>
      String(text || '')
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const k = muscleKey(s);
          if (!k) unknown.add(s);
          return k;
        })
        .filter(Boolean);
    const seen = new Set();
    const list = [];
    for (const r of rows || []) {
      const name = String(r.name || '').trim();
      if (!name || seen.has(norm(name))) continue;
      seen.add(norm(name));
      const main = [...new Set(keys(r.main))];
      const aliases = [...new Set(String(r.aliases || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))];
      const helps = [...new Set(keys(r.helps))].filter((k) => !main.includes(k));
      const minor = [...new Set(keys(r.minor))].filter((k) => !main.includes(k) && !helps.includes(k));
      // notes (v2.8): the owner's grip / form cue for the exercise, the Sheet's Notes column; shown only when set.
      list.push({ name, equipment: String(r.equipment || '').trim(), main, helps, minor, aliases, notes: String(r.notes || '').trim() });
    }
    const index = new Map(list.map((e) => [norm(e.name), e]));
    // Aliases never take over a real exercise name.
    for (const e of list) for (const a of e.aliases) if (!index.has(norm(a))) index.set(norm(a), e);
    return { list, index, unknown: [...unknown] };
  }

  /* ------------------------------------------------- changes made in the app (v2.2) */

  // Equipment offered when an exercise is created in the app.
  const EQUIPMENT = ['Machine', 'Cable', 'Barbell', 'Dumbbell', 'Smith machine', 'Bodyweight', 'Plate', 'Kettlebell', 'Band', 'Other'];

  /**
   * Rows with the app's changes not yet confirmed by the Sheet laid over them, so the app shows them at once.
   * ops: [{ type: 'upsert', row: { name, equipment, main, helps, minor, aliases?, notes? } }, { type: 'alias', name, alias }].
   * Muscles in rows are gym names joined by ", " (the Sheet's format).
   */
  function applyOps(rows, ops) {
    const out = (rows || []).map((r) => ({ ...r }));
    const find = (name) => out.find((r) => norm(r.name) === norm(name));
    for (const op of ops || []) {
      if (op.type === 'upsert' && op.row && op.row.name) {
        const r = find(op.row.name);
        if (r) Object.assign(r, Object.fromEntries(Object.entries(op.row).filter(([k, v]) => v !== undefined && k !== 'aliases')));
        else out.push({ name: op.row.name, equipment: op.row.equipment || '', main: op.row.main || '', helps: op.row.helps || '', minor: op.row.minor || '', aliases: op.row.aliases || '', notes: op.row.notes || '' });
      } else if (op.type === 'alias' && op.name && op.alias) {
        const r = find(op.name);
        if (!r) continue;
        // One other name belongs to one exercise: taken off any other row first (a match that was changed).
        for (const o of out) {
          if (o === r || !o.aliases) continue;
          o.aliases = String(o.aliases).split(',').map((s) => s.trim()).filter((a) => a && norm(a) !== norm(op.alias)).join(', ');
        }
        const list = String(r.aliases || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!list.some((a) => norm(a) === norm(op.alias))) list.push(op.alias.trim());
        r.aliases = list.join(', ');
      }
    }
    return out;
  }

  // Short forms people write in exercise names.
  const SHORT = { db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ez', ohp: 'overhead press', rdl: 'romanian deadlift', sldl: 'stiff leg deadlift',
    inc: 'incline', dec: 'decline', ext: 'extension',bw: 'bodyweight', mach: 'machine', lat: 'lat', pulldown: 'pull down', pushdown: 'push down', 'pull-up': 'pull up', chinup: 'chin up', pullup: 'pull up', smith: 'smith machine' };
  const tokens = (s) =>
    norm(s)
      .split(' ')
      .flatMap((w) => (SHORT[w] ? SHORT[w].split(' ') : [w]))
      .filter(Boolean);
  const grams = (s) => {
    const t = ` ${tokens(s).join(' ')} `;
    const g = new Set();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  /** 0–1: how alike two exercise names are (shared words, then shared letter pairs). */
  function similarity(a, b) {
    const ta = new Set(tokens(a));
    const tb = new Set(tokens(b));
    if (!ta.size || !tb.size) return 0;
    let shared = 0;
    for (const w of ta) if (tb.has(w) || [...tb].some((x) => (x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x))))) shared++;
    const words = shared / Math.max(ta.size, tb.size);
    const ga = grams(a);
    const gb = grams(b);
    let inter = 0;
    for (const g of ga) if (gb.has(g)) inter++;
    const dice = (2 * inter) / (ga.size + gb.size);
    return 0.6 * words + 0.4 * dice;
  }

  /* ---------- automatic matching of the owner's own names (v2.2.1) ---------- */

  // Phrases written several ways → one form (applied before splitting into words).
  const PHRASES = [
    [/\bpull[\s-]*downs?\b/g, 'pulldown'], [/\bpush[\s-]*downs?\b/g, 'pushdown'], [/\bpress[\s-]*downs?\b/g, 'pushdown'],
    [/\bpull[\s-]*ups?\b/g, 'pullup'], [/\bchin[\s-]*ups?\b/g, 'chinup'], [/\bpush[\s-]*ups?\b/g, 'pushup'], [/\bsit[\s-]*ups?\b/g, 'situp'],
    [/\bskull[\s-]*crushers?\b/g, 'skullcrusher'], [/\bflyes?\b|\bflys\b|\bflies\b/g, 'fly'], [/\blat raises?\b/g, 'lateral raise'],
    [/\b(ham|hamstring|hamstrings) curls?\b/g, 'leg curl'], [/\bquad extensions?\b/g, 'leg extension'], [/\bleg ext\b/g, 'leg extension'],
    [/\bpec fly\b|\bmachine fly\b|\bbutterfly\b/g, 'pec deck'], [/\breverse fly\b/g, 'rear delt fly'], [/\bt[\s-]*bar\b/g, 'tbar'],
    [/\bez[\s-]*bar\b/g, 'ez'], [/\boverhead press\b/g, 'shoulder press'], [/\bmilitary press\b/g, 'shoulder press'],
    [/\bside lateral\b/g, 'lateral'], [/\bbench\b(?!\s*(press|dip))/g, 'bench press'], [/\brope\b/g, 'rope cable'],
  ];
  // Words that make it a different exercise when the candidate has them and the name does not (incline vs flat…).
  const KEYWORDS = new Set(['incline', 'decline', 'shoulder', 'close', 'reverse', 'front', 'rear', 'lateral', 'overhead', 'hammer', 'wrist', 'preacher',
    'concentration', 'spider', 'drag', 'zottman', 'bayesian', 'upright', 'sumo', 'romanian', 'stiff', 'bulgarian', 'goblet', 'hack', 'sissy', 'donkey',
    'nordic', 'kickback', 'pullover', 'neutral', 'single', 'straight', 'knee', 'bent', 'landmine', 'arnold', 'cuban', 'y', 'external', 'scapular']);
  // Muscle words in a name ("Tricep Pushdown"): satisfied by any exercise that trains that muscle.
  const MUSCLE_WORDS = { tricep: ['triceps'], bicep: ['bicepsInner', 'bicepsOuter'] };
  // Short forms → words.
  const SHORTS = { db: 'dumbbell', dbs: 'dumbbell', dumbell: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ohp: 'shoulder press', rdl: 'romanian deadlift',
    sldl: 'stiff leg deadlift', bss: 'bulgarian split squat', inc: 'incline', dec: 'decline', ext: 'extension', bw: 'bodyweight', mach: 'machine',
    tri: 'tricep', tris: 'tricep', bi: 'bicep', bis: 'bicep', oh: 'overhead', cgbp: 'close grip bench press', hs: 'hammer strength', cg: 'close grip', ng: 'neutral grip' };
  // Words that do not change which exercise it is.
  // "Seated" and "standing" are optional too, but a seated candidate loses a little when the name does not say seated
  // (Calf Raise = standing; a shoulder press is still found seated).
  const OPTIONAL = new Set(['seated', 'standing', 'the', 'with', 'on', 'a', 'and', 'of', 'weighted', 'flat', 'grip', 'single', 'one', 'arm', 'both', 'x', 'set', 'sets', 'heavy', 'light', 'slow', 'plate', 'loaded', 'variation', 'free']);
  const EQUIP = ['dumbbell', 'barbell', 'cable', 'machine', 'smith', 'kettlebell', 'band', 'ez', 'bodyweight'];
  function coreWords(s) {
    let t = ` ${String(s || '').toLowerCase().replace(/[()]/g, ' ')} `;
    for (const [re, rep] of PHRASES) t = t.replace(re, rep);
    return [
      ...new Set(
        norm(t)
          .split(' ')
          .flatMap((w) => (SHORTS[w] ? norm(SHORTS[w]).split(' ') : [w]))
          .filter((w) => w && !OPTIONAL.has(w) && !/^\d+$/.test(w)),
      ),
    ];
  }
  /** 0–1 confidence that two names are the same exercise (`entry` = the candidate's database row, for muscle words). */
  function matchScore(name, candidate, entry = null) {
    let a = coreWords(name);
    let b = coreWords(candidate);
    if (entry) {
      for (const [w, keys] of Object.entries(MUSCLE_WORDS)) {
        if (keys.some((k) => entry.main.includes(k))) {
          a = a.filter((x) => x !== w);
          b = b.filter((x) => x !== w);
        }
      }
    }
    if (!a.length || !b.length) return 0;
    const raw = (s) => ` ${norm(s)} `;
    const seatedPenalty = raw(candidate).includes(' seated ') && !raw(name).includes(' seated ') ? 0.08 : 0;
    // A defining word on one side only (incline, hammer, reverse…) makes it a different exercise.
    const extraKey = (b.filter((w) => KEYWORDS.has(w) && !a.includes(w)).length + a.filter((w) => KEYWORDS.has(w) && !b.includes(w)).length) * 0.1;
    return Math.max(0, baseScore(a, b) - seatedPenalty - extraKey);
  }
  function baseScore(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    const eqA = a.filter((w) => EQUIP.includes(w));
    const eqB = b.filter((w) => EQUIP.includes(w));
    // Different equipment named on both sides: not the same exercise.
    if (eqA.length && eqB.length && !eqA.some((w) => B.has(w))) return 0;
    const inter = a.filter((w) => B.has(w)).length;
    if (inter === A.size && inter === B.size) return 1;
    if (inter === A.size) return Math.max(0, 0.9 - 0.08 * (B.size - A.size)); // every word of the name is in the candidate
    if (inter === B.size) return Math.max(0, 0.86 - 0.08 * (A.size - B.size)); // the candidate is a shorter form of the name
    return (0.8 * inter) / new Set([...a, ...b]).size;
  }

  /**
   * The database exercise a name surely means, or null. Sure = scores at least 0.74 and clearly ahead; when several
   * tie, they must all train the same muscles (then counting is the same whichever is picked).
   */
  function autoMatch(db, name) {
    if (db.index.has(norm(name))) return null;
    const scored = db.list
      .map((e) => ({ e, s: Math.max(matchScore(name, e.name, e), ...e.aliases.map((x) => matchScore(name, x, e))) }))
      .filter((x) => x.s >= 0.74)
      .sort((x, y) => y.s - x.s || x.e.name.length - y.e.name.length);
    if (!scored.length) return null;
    const best = scored[0];
    const close = scored.filter((x) => best.s - x.s < 0.06);
    // Near-ties are fine when they share the main muscles (coverage and counting then come out the same).
    const same = (x) => x.e.main.slice().sort().join() === best.e.main.slice().sort().join();
    if (close.length > 1 && !close.every(same)) return null;
    return { e: best.e, score: best.s, tied: close.length };
  }

  /** The closest database exercises to a name the database does not know (best first). */
  function suggest(db, name, n = 3) {
    return db.list
      .map((e) => ({ e, s: Math.max(similarity(name, e.name), ...e.aliases.map((a) => similarity(name, a))) }))
      .filter((x) => x.s >= 0.35)
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((x) => x.e);
  }

  /**
   * Search the database by name, alias, equipment or muscle. Every word typed must match something; exercises whose
   * name starts with the text come first, then those that train the muscle typed as a main muscle.
   */
  function search(db, query, limit = 40) {
    const q = norm(query);
    if (!q) return db.list.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
    const words = tokens(query);
    const muscleHit = muscleKey(query);
    const scored = [];
    for (const e of db.list) {
      const muscleNames = [...e.main, ...e.helps, ...e.minor].map((k) => BY_KEY[k].name);
      const hay = norm([e.name, ...e.aliases, e.equipment, ...muscleNames, ...[...e.main, ...e.helps, ...e.minor].map((k) => BY_KEY[k].area)].join(' '));
      const hayTokens = tokens(hay);
      const all = words.every((w) => hayTokens.some((h) => h.startsWith(w)));
      if (!all && !(muscleHit && (e.main.includes(muscleHit) || e.helps.includes(muscleHit) || e.minor.includes(muscleHit)))) continue;
      let score = 0;
      if (norm(e.name).startsWith(q)) score += 5;
      if (e.aliases.some((a) => norm(a).startsWith(q))) score += 4;
      if (tokens(e.name).some((t) => words.includes(t))) score += 2;
      if (muscleHit && e.main.includes(muscleHit)) score += 3;
      else if (muscleHit && e.helps.includes(muscleHit)) score += 1;
      else if (muscleHit && e.minor.includes(muscleHit)) score += 0.5;
      // A part of a muscle name ("tri", "hamstr"): exercises where it is the main muscle first.
      const starts = (keys) => keys.some((k) => tokens(BY_KEY[k].name).some((t) => words.some((w) => w.length >= 3 && t.startsWith(w))));
      if (!muscleHit && starts(e.main)) score += 2;
      else if (!muscleHit && starts(e.helps)) score += 0.5;
      scored.push({ e, score });
    }
    return scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name)).slice(0, limit).map((x) => x.e);
  }

  /**
   * Hard sets a week each muscle gets from the plan: each exercise's planned sets × how many times its day is on
   * the weekly schedule; main muscles count the set, helping ones half, tertiary ones a quarter (as the logged sets).
   * days: { dayName: [exercise names] }, perWeek: { dayName: times a week }, setsOf(day, name) → planned sets.
   */
  function plannedWeekly(db, days, perWeek, setsOf, coarseOf = () => null) {
    return plannedDetail(db, days, perWeek, setsOf, coarseOf).sets;
  }

  /** plannedWeekly with where each muscle's sets come from: by[key] = [{ name, day, sets, counted, main }]. */
  function plannedDetail(db, days, perWeek, setsOf, coarseOf = () => null) {
    const sets = Object.fromEntries(MUSCLES.map((m) => [m.key, 0]));
    const direct = Object.fromEntries(MUSCLES.map((m) => [m.key, 0]));
    const by = Object.fromEntries(MUSCLES.map((m) => [m.key, []]));
    for (const [day, names] of Object.entries(days || {})) {
      const times = perWeek[day] || 0;
      if (!times) continue;
      for (const name of names || []) {
        const e = lookup(db, name, coarseOf(name));
        if (!e) continue;
        const n = (setsOf(day, name) || 0) * times;
        for (const [list, weight] of TIERS(e)) {
          for (const k of list) {
            sets[k] += n * weight;
            if (weight === 1) direct[k] += n;
            by[k].push({ name, day, sets: n, counted: n * weight, main: weight === 1, weight });
          }
        }
      }
    }
    return { sets, direct, by };
  }

  // [muscle keys, share of a set]: main 1, helping (secondary) half, tertiary a quarter.
  const TIERS = (e) => [[e.main, 1], [e.helps, 0.5], [e.minor || [], 0.25]];

  // The owner's older coarse muscle group → muscles, for an exercise that is not in the database.
  const COARSE = {
    Chest: [['chestMid'], ['chestUpper', 'chestLower', 'triceps']], Shoulders: [['frontDelts', 'sideDelts'], ['triceps']],
    Triceps: [['triceps'], []], Back: [['lats', 'middleTraps'], ['bicepsInner', 'rearDelts']], 'Rear delts': [['rearDelts'], ['middleTraps']],
    Biceps: [['bicepsOuter', 'bicepsInner'], ['brachialis']], Quads: [['quads'], ['glutes']], Hamstrings: [['hamstrings'], ['glutes']],
    Glutes: [['glutes'], ['hamstrings']], Calves: [['calfInner', 'calfOuter'], ['calfLower']], Core: [['abs'], ['obliques']],
    'Lower back': [['lowerBack'], ['glutes']],
  };

  /** The database entry for an exercise name, else one made from its coarse group, else null. */
  function lookup(db, name, coarse) {
    const hit = db.index.get(norm(name));
    if (hit) return hit;
    const c = coarse && COARSE[coarse];
    return c ? { name, equipment: '', main: c[0], helps: c[1], minor: [], guessed: true } : null;
  }

  /**
   * Sets per muscle from workout sessions (warm-ups left out). A main muscle gets the whole set, a helping muscle half, a tertiary one a quarter.
   * Returns { sets: {key: n}, by: {key: Map(exercise → {sets, main})}, unmatched: [exercise names] }.
   */
  function tally(db, sessions, coarseOf = () => null) {
    const sets = Object.fromEntries(MUSCLES.map((m) => [m.key, 0]));
    const direct = Object.fromEntries(MUSCLES.map((m) => [m.key, 0]));
    const by = Object.fromEntries(MUSCLES.map((m) => [m.key, new Map()]));
    const unmatched = new Set();
    for (const s of sessions) {
      for (const set of s.sets || []) {
        if (set.warmup) continue;
        const e = lookup(db, set.exercise, coarseOf(set.exercise));
        if (!e) { unmatched.add(set.exercise); continue; }
        if (e.guessed) unmatched.add(set.exercise);
        for (const [list, weight] of TIERS(e)) {
          const isMain = weight === 1;
          for (const k of list) {
            sets[k] += weight;
            if (isMain) direct[k] += 1;
            const cur = by[k].get(set.exercise) || { sets: 0, main: isMain, counted: 0, days: [], weight };
            cur.sets += 1;
            cur.counted += weight;
            cur.main = cur.main || isMain;
            if (s.dayType && !cur.days.includes(s.dayType)) cur.days.push(s.dayType);
            by[k].set(set.exercise, cur);
          }
        }
      }
    }
    return { sets, direct, by, unmatched: [...unmatched] };
  }

  /** Every database exercise that works a muscle: main ones first, then helpers, each alphabetical. */
  function exercisesFor(db, key) {
    const main = db.list.filter((e) => e.main.includes(key)).sort((a, b) => a.name.localeCompare(b.name));
    const helps = db.list.filter((e) => e.helps.includes(key)).sort((a, b) => a.name.localeCompare(b.name));
    const minor = db.list.filter((e) => e.minor.includes(key)).sort((a, b) => a.name.localeCompare(b.name));
    return { main, helps, minor };
  }

  // Colour levels 0–4. Week: about 10–20 hard sets a muscle is the usual target. Day: one session's worth.
  const LEVELS = {
    week: [[0, 'Not trained'], [0.5, 'Under 5'], [5, '5–9'], [10, '10–20 target'], [20.5, 'Over 20']],
    day: [[0, 'None'], [0.5, '1–2'], [2.5, '3–4'], [4.5, '5–7'], [7.5, '8+']],
    // "All exercises": how well the owner's plan covers a muscle.
    // Week against each muscle's own target (v2.3): see targetLevel.
    target: [[0, 'Not trained'], [0, 'Under half target'], [0, 'Below target'], [0, 'On target'], [0, 'Over 2× target']],
    plan: [[0, 'Not in your plan'], [0.5, 'Helped only'], [1, '1 main exercise'], [2, '2 main'], [3, '3 or more main']],
  };
  function level(n, scale) {
    if (!n) return 0;
    const L = LEVELS[scale];
    let lv = 1;
    for (let i = 1; i < L.length; i++) if (n >= L[i][0]) lv = i;
    return lv;
  }

  /** Colour level 0–4 of n sets against a weekly target: under half, below, on (up to 2×), over 2×. */
  function targetLevel(n, target) {
    if (!n) return 0;
    if (!target) return level(n, 'week');
    const r = n / target;
    return r < 0.5 ? 1 : r < 1 ? 2 : r <= 2 ? 3 : 4;
  }

  /** How the owner's plan covers each muscle: main exercises count 1, helping 0.5, tertiary 0.25 (for colouring); plus the lists. */
  function planCoverage(db, planNames, coarseOf = () => null) {
    const score = Object.fromEntries(MUSCLES.map((m) => [m.key, 0]));
    const mine = Object.fromEntries(MUSCLES.map((m) => [m.key, { main: [], helps: [], minor: [] }]));
    for (const name of new Set(planNames)) {
      const e = lookup(db, name, coarseOf(name));
      if (!e) continue;
      for (const k of e.main) { score[k] += 1; mine[k].main.push(name); }
      for (const k of e.helps) { score[k] += 0.5; mine[k].helps.push(name); }
      for (const k of e.minor) { score[k] += 0.25; mine[k].minor.push(name); }
    }
    return { score, mine };
  }

  return {
    MUSCLES, BY_KEY, FIG, SKIN, VIEW_OF, EXERCISES, LEVELS, EQUIPMENT, norm, muscleKey, seedRows, buildDb, lookup, tally, exercisesFor, level, targetLevel, TARGETS, planCoverage,
    applyOps, similarity, suggest, search, plannedWeekly, plannedDetail, autoMatch, matchScore, coreWords,
  };
})();

if (typeof module !== 'undefined') module.exports = Muscles;
