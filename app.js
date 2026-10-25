'use strict';

/* Bhimlekha (भीमलेखा, "Bhima's record") — vanilla JS, no build step.
   One `state` object; each screen is re-rendered from it after every change.
   Everything the user does is saved to localStorage at once, so killing Safari loses nothing. */

const APP_VERSION = '2.1.0';
const HISTORY_LIMIT = 400;
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_REPS = [6, 8, 10, 12, 14]; // even numbers 5–15 (owner's choice); editable in Settings; Other and Failure always follow
const DEFAULT_QUESTIONS = ['Energy', 'Strength', 'Focus', 'Pump', 'Enjoyment']; // satisfaction matrix, 1–5 each
const RIR_CHOICES = [0, 1, 2, 3]; // reps in reserve; 3 means "3 or more"
// Waist = where the waistband sits; Abdomen = at the navel (the US Navy body fat formula for men uses the abdomen).
const DEFAULT_MEASURE_FIELDS = ['Bodyweight (kg)', 'Waist (cm)', 'Abdomen (cm)', 'Chest (cm)', 'Arm L (cm)', 'Arm R (cm)', 'Thigh L (cm)', 'Thigh R (cm)', 'Hips (cm)', 'Neck (cm)'];
const DEFAULT_POSES = ['Front', 'Side', 'Back'];
const MUSCLE_GROUPS = ['Chest', 'Shoulders', 'Triceps', 'Back', 'Rear delts', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Lower back'];
const LOWER_MUSCLES = ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Lower back'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const KEYS = {
  settings: 'wt.settings',
  exercises: 'wt.exercises',
  targets: 'wt.targets',
  cardio: 'wt.cardio',
  draft: 'wt.draft',
  outbox: 'wt.outbox',
  history: 'wt.history',
  measurements: 'wt.measurements',
  mOutbox: 'wt.mOutbox',
  vaultInfo: 'wt.vaultInfo', // { lastPhotoAt, lastBackupAt }: dates only, never photo data
  missed: 'wt.missed', // [{ id, date, dayType, reason, note, savedAt }] scheduled days with no workout
  missedOutbox: 'wt.missedOutbox', // [{ id, entry }] waiting for the Sheet (entry.deleted = remove the row)
  backup: 'wt.backup', // { linked, dirty, sentAt, error }: the settings copy in the Sheet's Settings tab
  small: 'wt.small', // [{ id, date, time, note, savedAt }] "Small workout" check-ins
  smallOutbox: 'wt.smallOutbox', // [{ id, entry }] waiting for the Sheet's Small workouts tab (entry.deleted = remove)
  recovery: 'wt.recovery', // [{ date, sleepHours, sleepScore, rhr, hrv, soreness, score }] one per day (v1.7)
  recoveryOutbox: 'wt.recoveryOutbox', // [{ date, … }] the owner's morning answers waiting for the Recovery tab
  recoveryFetchedAt: 'wt.recoveryFetchedAt', // last time the Shortcut's numbers were fetched from the Sheet
  exdb: 'wt.exdb', // { rows, fetchedAt }: the Sheet's Exercises tab, cached for the muscle map (v2.0)
};

// Weekday (0 = Sunday) → day type; '' = rest. The owner trains Monday to Saturday. Editable in Settings.
const DEFAULT_SCHEDULE = { 0: '', 1: 'Push A', 2: 'Pull A', 3: 'Legs A', 4: 'Push B', 5: 'Pull B', 6: 'Legs B' };
const DEFAULT_MISS_REASONS = ['Sick', 'Injury or pain', 'Tired or sore', 'Work', 'Travel', 'Family', 'Planned rest', 'Other'];

// Muscle group of each exercise in the owner's plan, for the weekly-sets count. Editable per exercise in Settings.
const DEFAULT_MUSCLES = {
  'Barbell Bench Press': 'Chest',
  'Incline Chest Press Machine': 'Chest',
  'Seated Chest Press Machine': 'Chest',
  'Cable Chest Fly': 'Chest',
  'Seated Shoulder Press Machine': 'Shoulders',
  'Shoulder Press Machine': 'Shoulders',
  'Cable Lateral Raises': 'Shoulders',
  'Cable Y-Raise': 'Shoulders',
  'Overhead Rope Triceps Extension': 'Triceps',
  'Rope Pushdown': 'Triceps',
  Plank: 'Core',
  'Lat Pulldown': 'Back',
  'Neutral-Grip Lat Pulldown': 'Back',
  'Single-Arm Cable Pulldown': 'Back',
  'Chest-Supported Row Machine': 'Back',
  'Seated Cable Row': 'Back',
  'Straight-Arm Pulldown': 'Back',
  'Reverse Pec Deck': 'Rear delts',
  'Face Pulls': 'Rear delts',
  'Cable Preacher Curl': 'Biceps',
  'Preacher Curl Machine': 'Biceps',
  'Rope Hammer Curl': 'Biceps',
  'Leg Press': 'Quads',
  'Leg Extension': 'Quads',
  'Romanian Deadlift': 'Hamstrings',
  'Seated Leg Curl': 'Hamstrings',
  'Lying Leg Curl': 'Hamstrings',
  'Hip Thrust Machine': 'Glutes',
  '45° Back Extension (weighted)': 'Lower back',
  'Standing Calf Raise': 'Calves',
  'Seated Calf Raise': 'Calves',
  "Captain's Chair Knee Raise": 'Core',
  'Cable Crunch': 'Core',
};

// The owner's plan. Each day: [exercise, planned sets × reps]. Editable in Settings; this is only the seed.
const DEFAULT_PLAN = {
  'Push A': [
    ['Barbell Bench Press', '3 × 6-8'],
    ['Incline Chest Press Machine', '3 × 8-12'],
    ['Seated Shoulder Press Machine', '2 × 8-12'],
    ['Cable Lateral Raises', '4 × 12-20'],
    ['Overhead Rope Triceps Extension', '3 × 10-15'],
    ['Rope Pushdown', '2 × 10-15'],
    ['Plank', '3 × 30-60 sec'],
  ],
  'Pull A': [
    ['Lat Pulldown', '3 × 8-12'],
    ['Chest-Supported Row Machine', '3 × 8-12'],
    ['Seated Cable Row', '2 × 10-12'],
    ['Reverse Pec Deck', '3 × 12-20'],
    ['Cable Preacher Curl', '3 × 10-15'],
    ['Rope Hammer Curl', '2 × 10-15'],
    ['Straight-Arm Pulldown', '2 × 12-15'],
  ],
  'Legs A': [
    ['Leg Press', '3 × 6-10'],
    ['Romanian Deadlift', '3 × 8-10'],
    ['Seated Leg Curl', '2 × 10-12'],
    ['Leg Extension', '2 × 12-15'],
    ['Standing Calf Raise', '3 × 10-15'],
    ["Captain's Chair Knee Raise", '3 × 10-15'],
  ],
  'Push B': [
    ['Incline Chest Press Machine', '3 × 8-12'],
    ['Seated Chest Press Machine', '2 × 8-12'],
    ['Shoulder Press Machine', '2 × 8-12'],
    ['Cable Lateral Raises', '4 × 12-20'],
    ['Overhead Rope Triceps Extension', '3 × 10-15'],
    ['Cable Y-Raise', '2 × 12-15'],
    ['Cable Chest Fly', '2 × 12-15'],
  ],
  'Pull B': [
    ['Neutral-Grip Lat Pulldown', '3 × 8-12'],
    ['Seated Cable Row', '3 × 8-12'],
    ['Single-Arm Cable Pulldown', '2 × 10-15 per side'],
    ['Reverse Pec Deck', '2 × 12-20'],
    ['Preacher Curl Machine', '3 × 8-12'],
    ['Rope Hammer Curl', '2 × 10-15'],
    ['Face Pulls', '2 × 12-20'],
  ],
  'Legs B': [
    ['Hip Thrust Machine', '3 × 8-12'],
    ['45° Back Extension (weighted)', '2 × 10-15'],
    ['Lying Leg Curl', '3 × 10-15'],
    ['Leg Extension', '3 × 12-15'],
    ['Seated Calf Raise', '4 × 12-20'],
    ['Cable Crunch', '3 × 10-15'],
  ],
};
const DEFAULT_CARDIO = {
  'Push A': 'Incline walk, 15 min',
  'Pull A': 'Bike, 15 min',
  'Legs A': 'Easy bike, 10-15 min',
  'Push B': 'Incline walk, 15 min',
  'Pull B': 'Bike or elliptical, 15 min',
  'Legs B': 'Easy cycling or flat walk, 10-15 min',
};
const DAY_TYPES = [...Object.keys(DEFAULT_PLAN), 'Custom'];

/* ---------------------------------------------------------------- storage */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// What the Sheet's Settings tab mirrors: any save of these schedules an upload (see backupSettingsSoon).
const BACKED_UP_KEYS = ['wt.settings', 'wt.exercises', 'wt.targets', 'wt.cardio'];

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (BACKED_UP_KEYS.includes(key) && typeof backupSettingsSoon === 'function') backupSettingsSoon();
    return true;
  } catch {
    toast('Could not save on this device (storage full or blocked)', 'error');
    return false;
  }
}

function seedExercises() {
  const exercises = {};
  const targets = {};
  for (const [day, list] of Object.entries(DEFAULT_PLAN)) {
    exercises[day] = list.map(([name]) => name);
    targets[day] = Object.fromEntries(list);
  }
  return { exercises, targets };
}

/* ------------------------------------------------------------------ state */

const savedSettings = load(KEYS.settings, {});
const state = {
  settings: {
    scriptUrl: '',
    token: '',
    restSeconds: 90,
    repsChips: DEFAULT_REPS,
    questions: DEFAULT_QUESTIONS,
    requireRir: true, // ask for reps in reserve on every working set
    steps: {}, // { exercise: kg } weight step overrides
    muscles: { ...DEFAULT_MUSCLES }, // { exercise: muscle group }
    measureFields: DEFAULT_MEASURE_FIELDS,
    checkinDay: 0, // Sunday
    photoPoses: DEFAULT_POSES,
    programStart: '', // YYYY-MM-DD in Week 1 of the photo folders; blank = the first logged workout
    schedule: { ...DEFAULT_SCHEDULE },
    scheduleFrom: null, // first day missed workouts are looked for (set on first run, so nothing is back-filled)
    missReasons: DEFAULT_MISS_REASONS,
    cameraTimer: 10, // seconds of countdown on the in-app camera
    autoLockMinutes: 3,
    lastDeload: null, // YYYY-MM-DD of the last lighter week (v1.1; kept as a fallback for `deloads`)
    deloads: [], // [{ start, end }] lighter weeks; their workouts are left out of the progress maths
    snoozeUntil: null, // "Not now" on the recovery alert hides it until this date
    profile: { sex: 'male', dob: '', heightCm: null }, // for body fat and calories (v1.7)
    calorieLock: null, // { target, weightKg, date, bfDate, reason, prev, seen } the number to enter in MyFitnessPal
    ...savedSettings,
    calories: { ...Body.CALORIE_DEFAULTS, ...(savedSettings.calories || {}) },
    recoveryScore: { ...Body.RECOVERY_SCORE_DEFAULTS, ...(savedSettings.recoveryScore || {}) },
    progression: { ...Progress.PROGRESSION_DEFAULTS, ...(savedSettings.progression || {}) },
    recovery: {
      ...Progress.RECOVERY_DEFAULTS,
      ...(savedSettings.progression?.deloadWeeks ? { schedWeeks: savedSettings.progression.deloadWeeks } : {}),
      ...(savedSettings.recovery || {}),
    },
  },
  exercises: load(KEYS.exercises, null),
  targets: load(KEYS.targets, null),
  cardio: load(KEYS.cardio, null),
  draft: load(KEYS.draft, null),
  outbox: load(KEYS.outbox, []),
  history: load(KEYS.history, []),
  measurements: load(KEYS.measurements, []),
  mOutbox: load(KEYS.mOutbox, []),
  vaultInfo: load(KEYS.vaultInfo, { lastPhotoAt: null, lastBackupAt: null }),
  missed: load(KEYS.missed, []),
  missedOutbox: load(KEYS.missedOutbox, []),
  backup: load(KEYS.backup, { linked: false, dirty: false, sentAt: null, error: '' }),
  small: load(KEYS.small, []),
  smallOutbox: load(KEYS.smallOutbox, null), // null = never set up: v1.5.1 entries get queued once (below)
  recovery: load(KEYS.recovery, []),
  recoveryOutbox: load(KEYS.recoveryOutbox, []),
  exdb: load(KEYS.exdb, null),
  ui: {
    muscles: { mode: 'mine', period: 'week', day: null, view: 'front', picked: null, vb: null }, // Muscles tab
    morning: { soreness: null, sleepScore: '' }, // Home's morning check, before it is saved
    progress: { metric: 'e1rm', range: '12w' },
    body: { field: null, range: '12w', weighIn: '', draft: null },
    vault: { status: 'unknown', items: [], busy: '', backup: null, compare: null, viewing: null, pose: null, faceId: null, faceStep: '', weekFiles: {}, openWeek: null },
    newRep: '',
    newField: '',
    newPose: '',
    form: null, // the Workout entry form
    timer: null, // { endsAt, total }
    start: { dayType: DAY_TYPES[0], custom: '', date: todayISO() },
    submit: { status: 'idle', message: '', session: null },
    ping: null, // { ok, message }
    manageDay: DAY_TYPES[0],
    manageNew: '',
    showToken: false,
    syncing: false,
    historySync: '',
    newExercise: '',
    newQuestion: '',
    newReason: '',
    startPicked: false, // the owner chose a day on Home, so it no longer follows the schedule
    summaryWeek: null, // Progress → weekly summary shown (week end date)
  },
};

function repsChips() {
  const list = Array.isArray(state.settings.repsChips) ? state.settings.repsChips : DEFAULT_REPS;
  return [...list, 'other', 'failure'];
}

function questions() {
  return Array.isArray(state.settings.questions) ? state.settings.questions : DEFAULT_QUESTIONS;
}

function measureFields() {
  return Array.isArray(state.settings.measureFields) && state.settings.measureFields.length ? state.settings.measureFields : DEFAULT_MEASURE_FIELDS;
}

function weightField() {
  return measureFields().find((f) => /weight/i.test(f)) || null;
}

function poses() {
  return Array.isArray(state.settings.photoPoses) && state.settings.photoPoses.length ? state.settings.photoPoses : DEFAULT_POSES;
}

/* ----------------------------------------------------- photo week folders */

/** The day Week 1 contains: the setting, else the first logged workout, else null. */
function programStart() {
  if (/^\d{4}-\d{2}-\d{2}$/.test(state.settings.programStart || '')) return state.settings.programStart;
  let first = null;
  for (const s of state.history) if (s.date && (!first || s.date < first)) first = s.date;
  return first;
}

/** Weeks end on the check-in day (Sunday → Monday to Sunday), so check-in photos close the week they finish. */
function weekBounds(iso) {
  const endDow = Number(state.settings.checkinDay) || 0;
  const dow = new Date(Date.parse(iso)).getUTCDay();
  const end = Progress.addDays(iso, (endDow - dow + 7) % 7);
  return { start: Progress.addDays(end, -6), end };
}

/** { n, start, end, folder } for a photo date, e.g. folder "Week 3 - 13 Oct to 19 Oct 2026". */
function photoWeek(iso) {
  const { start, end } = weekBounds(iso);
  const base = programStart();
  const n = base ? Math.floor(Progress.daysBetween(weekBounds(base).start, start) / 7) + 1 : 1;
  const from = formatDate(start, start.slice(0, 4) !== end.slice(0, 4));
  return { n, start, end, folder: `Week ${n} - ${from} to ${formatDate(end)}` };
}

/** File name (no extension) for a photo, e.g. "Week-3 Biceps L"; characters Files cannot use become "-". */
function photoFileName(week, pose) {
  return `Week-${week.n} ${pose}`.replace(/[\\/:*?"<>|]/g, '-').trim();
}

/** Week folders whose photos changed after they were last saved to Files. */
function unsavedWeeks() {
  const { weeksChanged = {}, weeksSaved = {} } = state.vaultInfo;
  return Object.keys(weeksChanged)
    .filter((f) => !weeksSaved[f] || weeksSaved[f] < weeksChanged[f])
    .sort((a, b) => Number(a.split(' ')[1]) - Number(b.split(' ')[1]));
}

/* -------------------------------------------------- schedule and missed days */

/** The day type scheduled on a date ('' = rest day). */
function scheduledDay(iso) {
  const dow = new Date(Date.parse(iso)).getUTCDay();
  const s = state.settings.schedule || DEFAULT_SCHEDULE;
  return String(s[dow] ?? s[String(dow)] ?? '');
}

function missReasons() {
  return Array.isArray(state.settings.missReasons) && state.settings.missReasons.length ? state.settings.missReasons : DEFAULT_MISS_REASONS;
}

/** Dates with a workout saved (or one in progress), so they are never called missed. */
function trainedDates() {
  const dates = new Set(state.history.map((s) => s.date));
  if (state.draft && state.draft.sets.length) dates.add(state.draft.date);
  return dates;
}

/**
 * Mark scheduled days that passed with no workout as missed (the owner never makes them up: the next day's
 * workout follows). Looks from `scheduleFrom` (set on first run, so older days are not back-filled) to yesterday.
 * A missed day that gets a workout logged afterwards (a late entry for that date) is taken back.
 * Ids are "missed-YYYY-MM-DD", so two phones agree. Returns true when something changed.
 */
function detectMissed() {
  const today = todayISO();
  if (!state.settings.scheduleFrom) {
    state.settings.scheduleFrom = today;
    save(KEYS.settings, state.settings);
    return false;
  }
  const trained = trainedDates();
  const have = new Map(state.missed.map((m) => [m.date, m]));
  let changed = false;
  for (const m of [...state.missed]) {
    if (trained.has(m.date)) {
      state.missed = state.missed.filter((x) => x.id !== m.id);
      queueMissed({ id: m.id, deleted: true });
      changed = true;
    }
  }
  const from = state.settings.scheduleFrom > Progress.addDays(today, -60) ? state.settings.scheduleFrom : Progress.addDays(today, -60);
  for (let d = from; d < today; d = Progress.addDays(d, 1)) {
    const dayType = scheduledDay(d);
    if (!dayType || trained.has(d) || have.has(d)) continue;
    const entry = { id: `missed-${d}`, date: d, dayType, reason: '', note: '', savedAt: nowISO() };
    state.missed.push(entry);
    queueMissed(entry);
    changed = true;
  }
  if (changed) {
    state.missed.sort((a, b) => a.date.localeCompare(b.date));
    save(KEYS.missed, state.missed);
  }
  return changed;
}

/** Queue one missed-day change for the Sheet (the latest change per id wins). */
function queueMissed(entry) {
  state.missedOutbox = [...state.missedOutbox.filter((x) => x.id !== entry.id), { id: entry.id, entry }];
  save(KEYS.missedOutbox, state.missedOutbox);
}

function setMissedReason(id, reason, note) {
  const m = state.missed.find((x) => x.id === id);
  if (!m) return;
  m.reason = reason;
  if (note !== undefined) m.note = note;
  m.savedAt = nowISO();
  save(KEYS.missed, state.missed);
  queueMissed(m);
  syncOutbox();
}

/* --------------------------------------------------- small workouts → Sheet */

// Check-ins made in v1.5.1 (before they went to the Sheet) are sent once.
if (!Array.isArray(state.smallOutbox)) {
  state.smallOutbox = state.small.map((s) => ({ id: s.id, entry: s }));
  save(KEYS.smallOutbox, state.smallOutbox);
}

/** Queue one small-workout change for the Sheet (the latest change per id wins). */
function queueSmall(entry) {
  state.smallOutbox = [...state.smallOutbox.filter((x) => x.id !== entry.id), { id: entry.id, entry }];
  save(KEYS.smallOutbox, state.smallOutbox);
  syncOutbox();
}

async function syncSmallOutbox() {
  for (const item of [...state.smallOutbox]) {
    try {
      await apiPost({ action: 'small', entry: item.entry });
    } catch {
      break; // offline, or an Apps Script older than v1.6: kept for later
    }
    state.smallOutbox = state.smallOutbox.filter((x) => x !== item);
    save(KEYS.smallOutbox, state.smallOutbox);
  }
}

/** Small workouts from the Sheet (a new phone): added by id; this phone's own copies are kept. */
async function syncSmallFromSheet() {
  try {
    const data = await apiGet({ action: 'small' });
    const byId = new Map(state.small.map((s) => [s.id, s]));
    for (const e of Array.isArray(data.entries) ? data.entries : []) {
      if (!e || !e.id || byId.has(e.id) || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) || !/^\d{2}:\d{2}$/.test(String(e.time))) continue;
      byId.set(e.id, { id: e.id, date: e.date, time: e.time, note: e.note || '', savedAt: '' });
    }
    state.small = [...byId.values()];
    save(KEYS.small, state.small);
  } catch {}
}

/* -------------------------------------------- recovery score (v1.7, Recovery tab) */

const RECOVERY_KEYS = ['sleepHours', 'sleepScore', 'rhr', 'hrv', 'soreness', 'score'];

function recoveryEntry(date) {
  return state.recovery.find((e) => e.date === date) || null;
}

/** Merge numbers into one day's entry (only the keys given). */
function putRecovery(date, values) {
  const e = recoveryEntry(date) || { date };
  for (const k of RECOVERY_KEYS) if (values[k] !== undefined) e[k] = values[k];
  state.recovery = [...state.recovery.filter((x) => x.date !== date), e].sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
  save(KEYS.recovery, state.recovery);
  return e;
}

function recoveryResult(date = todayISO()) {
  return Body.recoveryScore(state.recovery, date, state.settings.recoveryScore);
}

/** Queue the app's own fields for the Sheet; one item per date, newest values win. */
function queueRecovery(date, values) {
  const old = state.recoveryOutbox.find((x) => x.date === date) || { date };
  state.recoveryOutbox = [...state.recoveryOutbox.filter((x) => x.date !== date), { ...old, ...values, date }];
  save(KEYS.recoveryOutbox, state.recoveryOutbox);
  syncOutbox();
}

async function syncRecoveryOutbox() {
  for (const item of [...state.recoveryOutbox]) {
    try {
      await apiPost({ action: 'recovery', entry: item });
    } catch {
      break; // offline, or an Apps Script older than v1.7: kept for later
    }
    state.recoveryOutbox = state.recoveryOutbox.filter((x) => x !== item);
    save(KEYS.recoveryOutbox, state.recoveryOutbox);
  }
}

/** Keep today's score in the Sheet in step once the Shortcut's numbers and the owner's answers are both in. */
function storeRecoveryScore(date) {
  const r = recoveryResult(date);
  const e = recoveryEntry(date);
  if (!r || r.score === null || !e || e.soreness === undefined || e.soreness === null || e.score === r.score) return;
  putRecovery(date, { score: r.score });
  queueRecovery(date, { score: r.score });
}

/** The Shortcut's sleep, resting HR and HRV from the Sheet (at most every 20 minutes unless forced). Values this
    phone has not sent yet win over the Sheet's. */
async function fetchRecovery({ force = false } = {}) {
  if (!haveApi()) return false;
  const last = load(KEYS.recoveryFetchedAt, 0);
  if (!force && Date.now() - last < 20 * 60000) return false;
  try {
    const data = await apiGet({ action: 'recovery', days: 60 });
    save(KEYS.recoveryFetchedAt, Date.now());
    for (const e of Array.isArray(data.entries) ? data.entries : []) {
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) continue;
      const pending = state.recoveryOutbox.find((x) => x.date === e.date) || {};
      const values = {};
      for (const k of RECOVERY_KEYS) if (e[k] !== null && e[k] !== undefined && pending[k] === undefined) values[k] = Number(e[k]);
      putRecovery(e.date, values);
    }
    storeRecoveryScore(todayISO());
    return true;
  } catch {
    return false; // offline or an older Apps Script: the morning card still works with what it has
  }
}

/* ------------------------------------------------- exercise database (v2.0, Exercises tab) */

let exdbCache = null;
/** The exercise database: the Sheet's rows when they have been read, else the built-in starting list. */
function exerciseDb() {
  const rows = state.exdb && Array.isArray(state.exdb.rows) && state.exdb.rows.length ? state.exdb.rows : null;
  if (!exdbCache || exdbCache.rows !== rows) {
    exdbCache = { rows, db: Muscles.buildDb(rows || Muscles.seedRows()), fromSheet: Boolean(rows) };
  }
  return exdbCache;
}

/** Read the Exercises tab (at most every 6 hours unless forced). An empty tab gets the starting list written once;
    the script never writes over rows that are there, so the owner's edits stay. */
async function fetchExercises({ force = false } = {}) {
  if (!haveApi()) return false;
  const ex = state.exdb || {};
  if (!force && ex.fetchedAt && Date.now() - ex.fetchedAt < 6 * 3600000) return false;
  try {
    let rows = (await apiGet({ action: 'exercises' })).rows;
    if (!Array.isArray(rows)) rows = [];
    if (!rows.length) {
      await apiPost({ action: 'exercises', rows: Muscles.seedRows() });
      const again = (await apiGet({ action: 'exercises' })).rows;
      rows = Array.isArray(again) && again.length ? again : Muscles.seedRows();
    }
    state.exdb = { rows, fetchedAt: Date.now() };
    save(KEYS.exdb, state.exdb);
    return true;
  } catch {
    return false; // offline, or an Apps Script older than v2.0: the built-in list is used meanwhile
  }
}

function refreshExercises(force = false) {
  return fetchExercises({ force }).then((got) => {
    if (got && route().name === 'muscles') render();
    return got;
  });
}

/* ------------------------------------------------- body fat and calories (v1.7) */

function bodyFatSeries() {
  return Body.bodyFatSeries(state.measurements, state.settings.profile || {}, measureFields(), weightField());
}

/** Today's numbers: { calc (Body.calorieTarget), bf (latest reading), weight }. */
function calorieState(today = todayISO()) {
  const series = bodyFatSeries();
  const bf = series[series.length - 1] || null;
  const weight = weightField() ? Body.currentWeight(state.measurements, weightField(), today) : null;
  const calc = Body.calorieTarget({ profile: state.settings.profile || {}, c: state.settings.calories, weight, bf, sessions: state.history, today });
  return { calc, bf, weight, series };
}

/**
 * Move the target the owner enters in MyFitnessPal when the rules say so (Body.shouldUpdateTarget): the first
 * time, a new body fat reading, 5 kg of weight change, or a weekly change of 100 kcal or more. `force` = settings
 * changed, so the new number applies at once. A change shows on Home until the owner confirms it is entered.
 */
function updateCalorieTarget({ force = false } = {}) {
  const today = todayISO();
  const { calc, bf } = calorieState(today);
  if (!calc.target) return false;
  const lock = state.settings.calorieLock;
  const reason = force && (!lock || lock.target !== calc.target) ? 'settings' : Body.shouldUpdateTarget(lock, calc, bf?.date || null, state.settings.calories, today);
  if (!reason) return false;
  state.settings.calorieLock = {
    target: calc.target,
    weightKg: calc.weightKg,
    bf: calc.bf,
    method: calc.method,
    date: today,
    bfDate: bf?.date || null,
    reason,
    prev: lock?.target ?? null,
    seen: Boolean(lock) && lock.target === calc.target, // nothing to re-enter when the number is the same
  };
  save(KEYS.settings, state.settings);
  return true;
}

const TARGET_REASON = {
  first: 'first calculation',
  'body fat': 'new body fat reading',
  weight: 'bodyweight moved',
  week: 'weekly recalculation',
  settings: 'your settings changed',
};

/* ---------------------------------------------------------------------------- */

/** Exercises planned on a day type (the plan as it is now). */
function dayExercises(dayType) {
  return state.exercises[dayType] || [];
}

/**
 * Days to leave out of an exercise's clocks (shortfall, stagnant, watch) between `from` and `to`: each missed
 * workout whose day has this exercise counts `missedPauseDays`, so a skipped session is not "no progress".
 */
function missedPause(exercise, from, to) {
  const per = Number(state.settings.progression.missedPauseDays) || 0;
  if (!per) return 0;
  return state.missed.filter((m) => m.date > from && m.date <= to && dayExercises(m.dayType).includes(exercise)).length * per;
}

/** Muscle groups in the plan not trained (working sets) for more than `neglectDays`. Newest workouts count. */
function neglectedMuscles() {
  const limit = Number(state.settings.progression.neglectDays) || 0;
  if (!limit) return [];
  const planned = new Set();
  for (const day of Object.keys(state.exercises)) for (const ex of dayExercises(day)) if (muscleOf(ex)) planned.add(muscleOf(ex));
  const last = {};
  for (const s of state.history) {
    for (const set of s.sets) {
      const m = muscleOf(set.exercise);
      if (m && Progress.isWorking(set) && (!last[m] || s.date > last[m])) last[m] = s.date;
    }
  }
  const today = todayISO();
  const started = state.history.length ? state.history.map((s) => s.date).sort()[0] : null;
  if (!started) return [];
  return [...planned]
    .map((m) => ({ muscle: m, last: last[m] || null, days: Progress.daysBetween(last[m] || started, today) }))
    .filter((x) => x.days > limit)
    .sort((a, b) => b.days - a.days);
}

/* ------------------------------------------------- settings copy in the Sheet */

let backupTimer = null;

/** The settings worth restoring on a new phone. The Sheet URL and token stay out: you need them to get here. */
function settingsSnapshot() {
  const { scriptUrl, token, ...settings } = state.settings;
  return { settings, exercises: state.exercises, targets: state.targets, cardio: state.cardio, app: APP_VERSION };
}

function saveBackupState(patch) {
  state.backup = { ...state.backup, ...patch };
  try {
    localStorage.setItem(KEYS.backup, JSON.stringify(state.backup));
  } catch {}
}

/** Called by save(): upload a few seconds after the last change (many saves in a row become one upload). */
function backupSettingsSoon() {
  if (!state || !state.backup) return;
  if (!state.backup.dirty) saveBackupState({ dirty: true });
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => uploadSettings().catch(() => {}), 3000);
}

async function uploadSettings() {
  if (!haveApi() || !state.backup.linked || !state.backup.dirty) return false;
  const savedAt = nowISO();
  try {
    await apiPost({ action: 'settings', data: settingsSnapshot(), savedAt });
    saveBackupState({ dirty: false, sentAt: savedAt, error: '' });
    return true;
  } catch (err) {
    saveBackupState({ error: err instanceof ApiError ? err.message : 'offline' });
    return false;
  } finally {
    // Only the status line is refreshed, so a field being typed in Settings keeps its focus.
    const el = document.getElementById('backup-status');
    if (el) el.innerHTML = settingsCopyStatus();
  }
}

/** Put a settings copy from the Sheet into effect (keeps this phone's URL and token). */
function applySettingsSnapshot(data) {
  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  state.settings = {
    ...state.settings,
    ...s,
    scriptUrl: state.settings.scriptUrl,
    token: state.settings.token,
    progression: { ...Progress.PROGRESSION_DEFAULTS, ...(s.progression || {}) },
    recovery: { ...Progress.RECOVERY_DEFAULTS, ...(s.recovery || {}) },
    calories: { ...Body.CALORIE_DEFAULTS, ...(s.calories || {}) },
    recoveryScore: { ...Body.RECOVERY_SCORE_DEFAULTS, ...(s.recoveryScore || {}) },
    // This phone may not hold the past workouts yet, so it looks for missed days only from today; the
    // earlier ones come from the Sheet's Missed tab.
    scheduleFrom: todayISO(),
  };
  if (data.exercises && typeof data.exercises === 'object') state.exercises = data.exercises;
  if (data.targets && typeof data.targets === 'object') state.targets = data.targets;
  if (data.cardio && typeof data.cardio === 'object') state.cardio = data.cardio;
  save(KEYS.settings, state.settings);
  save(KEYS.exercises, state.exercises);
  save(KEYS.targets, state.targets);
  save(KEYS.cardio, state.cardio);
  saveBackupState({ dirty: false });
}

/**
 * First contact with the Sheet's Settings tab from this phone. Empty tab → this phone becomes the source.
 * A copy already there (a new phone, or a reinstall) → ask before anything is overwritten either way, so
 * fresh defaults on a new phone can never replace the real settings.
 * `ask` false (background sync) leaves the question for Settings → Settings copy.
 */
async function linkSettingsBackup({ ask = true } = {}) {
  if (!haveApi() || state.backup.linked) return;
  let remote;
  try {
    remote = await apiGet({ action: 'settings' });
  } catch (err) {
    saveBackupState({ error: err instanceof ApiError ? err.message : 'offline' });
    return;
  }
  if (!remote.data) {
    saveBackupState({ linked: true, dirty: true, error: '' });
    await uploadSettings();
    return;
  }
  saveBackupState({ remoteAt: remote.savedAt || null, error: '' });
  if (!ask) return;
  const restore = await openModal({
    title: 'Settings found in the Sheet',
    message: `Saved ${remote.savedAt ? formatDate(String(remote.savedAt).slice(0, 10)) : 'earlier'}: exercises, plans, schedule, rep buttons, progression and recovery settings. Use them on this phone? (Cancel keeps this phone's settings and replaces the Sheet's copy.)`,
    confirmText: 'Use the Sheet’s settings',
  });
  if (restore) {
    applySettingsSnapshot(remote.data);
    await syncMissedFromSheet();
    await syncSmallFromSheet();
    toast('Settings restored from the Sheet');
  }
  saveBackupState({ linked: true, dirty: !restore, remoteAt: null });
  if (!restore) await uploadSettings();
  render();
}

/** Missed days from the Sheet (a new phone): merged by id, the Sheet's reason wins when this phone has none. */
async function syncMissedFromSheet() {
  try {
    const data = await apiGet({ action: 'missed' });
    const byId = new Map(state.missed.map((m) => [m.id, m]));
    for (const e of Array.isArray(data.entries) ? data.entries : []) {
      if (!e || !e.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) continue;
      const local = byId.get(e.id);
      if (local) {
        if (!local.reason && e.reason) Object.assign(local, { reason: e.reason, note: e.note || '' });
      } else byId.set(e.id, { id: e.id, date: e.date, dayType: e.dayType || '', reason: e.reason || '', note: e.note || '', savedAt: '' });
    }
    state.missed = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
    save(KEYS.missed, state.missed);
  } catch {}
}

/* ------------------------------------------------- progress engine glue */

/** The plan text for an exercise: the day's own plan first, else the first day that has one. */
function planText(dayType, exercise) {
  const own = state.targets[dayType]?.[exercise];
  if (own) return own;
  for (const day of Object.keys(state.targets)) if (state.targets[day]?.[exercise]) return state.targets[day][exercise];
  return '';
}

function muscleOf(exercise) {
  return state.settings.muscles?.[exercise] || '';
}

function progressCtx() {
  return {
    p: state.settings.progression,
    planFor: (dayType, exercise) => Progress.parsePlan(planText(dayType, exercise)),
    isLower: (dayType, exercise) => (muscleOf(exercise) ? LOWER_MUSCLES.includes(muscleOf(exercise)) : /leg/i.test(dayType || '')),
    stepFor: (exercise) => state.settings.steps?.[exercise],
    today: todayISO(),
    pauseFor: missedPause,
  };
}

/* ------------------------------------------------ lighter weeks (recovery) */

const DELOAD_PLAN = 'Same exercises, about half the sets, about 10% less weight, stop with 3–4 reps in reserve.';

function deloadWindows() {
  return (Array.isArray(state.settings.deloads) ? state.settings.deloads : []).filter((w) => w && w.start && w.end);
}

function inDeload(date) {
  return Boolean(date) && deloadWindows().some((w) => date >= w.start && date <= w.end);
}

/** Saved workouts that count for progress: lighter-week workouts are left out so they cannot trigger warnings. */
function statsHistory() {
  return state.history.filter((s) => !inDeload(s.date));
}

/** Analysis of one exercise over the saved workouts that count. */
function analyse(exercise) {
  return Progress.analyseExercise(statsHistory(), exercise, progressCtx());
}

function trackedExercises() {
  const names = new Set();
  for (const s of statsHistory()) for (const set of s.sets) if (Progress.isWorking(set)) names.add(set.exercise);
  return [...names];
}

/**
 * Recovery state: an active lighter week, or the triggers that fire now (any one is enough), plus the date the
 * scheduled one is due. Triggers (each switchable in Settings → Recovery):
 *  A every `schedWeeks` weeks since the last lighter week (or since the first workout)
 *  B overall strength (Progress.weeklyStrength) down more than `strengthPct`% for `strengthWeeks` weeks in a row
 *  C at least `dropCount` exercises flagged dropping at once
 *  D Energy/Strength ratings averaging ≤ `feelMax` over the last `feelWorkouts` rated workouts
 */
function recoveryState() {
  const r = state.settings.recovery;
  const today = todayISO();
  const windows = deloadWindows().sort((a, b) => a.start.localeCompare(b.start));
  const active = windows.find((w) => w.start <= today && today <= w.end) || null;
  const ended = windows.filter((w) => w.end < today).map((w) => w.end);
  const lastEnd = [...ended, state.settings.lastDeload].filter(Boolean).sort().pop() || null;
  const stats = statsHistory();
  const firstDate = stats.map((s) => s.date).filter(Boolean).sort()[0] || null;
  const base = lastEnd && (!firstDate || lastEnd > firstDate) ? lastEnd : firstDate;
  // Missed workouts are rest the body got anyway: each pushes the scheduled lighter week back a little.
  const missedSince = base ? state.missed.filter((m) => m.date > base).length : 0;
  const pushed = missedSince * (Number(state.settings.progression.missedSchedDays) || 0);
  const next = base ? Progress.addDays(base, r.schedWeeks * 7 + pushed) : null;
  const out = { active: null, reasons: [], due: false, snoozed: false, next, last: lastEnd, base, pushed };
  if (active) {
    out.active = { ...active, day: Progress.daysBetween(active.start, today) + 1, length: Progress.daysBetween(active.start, active.end) + 1 };
    return out;
  }
  if (!stats.length) return out;

  if (r.schedOn && next && today >= next) {
    const weeks = Math.floor(Progress.daysBetween(base, today) / 7);
    out.reasons.push({ key: 'sched', lead: `${weeks} weeks`, text: `of training since ${lastEnd ? 'your last lighter week' : 'you started'} (alert every ${r.schedWeeks})` });
  }
  if (r.strengthOn && r.strengthWeeks >= 1) {
    const weeks = Progress.weeklyStrength(stats);
    const tail = weeks.slice(-r.strengthWeeks);
    const recent = tail.length && tail[tail.length - 1].week >= Progress.addDays(Progress.mondayOf(today), -7);
    const consecutive = tail.every((w, i) => i === 0 || Progress.daysBetween(tail[i - 1].week, w.week) === 7);
    if (tail.length === r.strengthWeeks && recent && consecutive && tail.every((w) => w.pct < -r.strengthPct)) {
      out.reasons.push({ key: 'strength', lead: tail.map((w) => Progress.signed(w.pct)).join(', '), text: `overall strength, ${r.strengthWeeks} week${r.strengthWeeks === 1 ? '' : 's'} in a row` });
    }
  }
  if (r.dropOn) {
    const dropping = trackedExercises()
      .map((n) => analyse(n))
      .filter((a) => a && a.flags.some((f) => f.kind === 'drop'));
    if (dropping.length >= r.dropCount) {
      out.reasons.push({ key: 'drop', lead: `${dropping.length} exercises`, text: `dropping at once: ${dropping.map((a) => a.exercise).join(', ')}` });
    }
  }
  if (r.feelOn) {
    const feel = Progress.recentFeel(stats, r.feelWorkouts, ['Energy', 'Strength']);
    if (feel !== null && feel <= r.feelMax) {
      out.reasons.push({ key: 'feel', lead: `${feel.toFixed(1)} / 5`, text: `Energy and Strength ratings over your last ${r.feelWorkouts} workouts` });
    }
  }
  out.due = out.reasons.length > 0;
  out.snoozed = out.due && Boolean(state.settings.snoozeUntil) && today < state.settings.snoozeUntil;
  return out;
}

/**
 * The recovery card. `where`: 'home' (always shown: countdown, alert or active week), 'entry' (only when a lighter
 * week is running or the alert is due) and 'progress'.
 */
function recoveryCard(where) {
  const rs = recoveryState();
  const r = state.settings.recovery;
  const buttons = where !== 'entry';
  if (rs.active) {
    const a = rs.active;
    const pct = Math.round((Math.min(a.day, a.length) / a.length) * 100);
    return `<div class="alert notice ok recovery-active" role="status">
      <div class="nhead">${appIcon('leaf', 'green')}<div class="tx"><b class="alert-title">Lighter week · day ${Math.min(a.day, a.length)} of ${a.length}</b><span>Ends ${esc(formatDate(a.end, false))}</span></div></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <p class="small" style="margin:8px 0 0">${esc(DELOAD_PLAN)} These workouts are not counted in progress.</p>
      ${buttons ? '<div class="actions"><button type="button" class="btn small pill" data-action="endDeload">End it now</button></div>' : ''}
    </div>`;
  }
  if (rs.due && !rs.snoozed) {
    return `<div class="alert notice warn recovery-due" role="alert">
      <div class="nhead">${appIcon('alert', 'orange')}<div class="tx"><b class="alert-title">Time for a lighter week</b><span>${esc(r.lengthDays)} days: ${esc(DELOAD_PLAN)}</span></div></div>
      <ul class="reasons">${rs.reasons.map((x) => `<li><strong class="lead">${esc(x.lead)}</strong> ${esc(x.text)}</li>`).join('')}</ul>
      ${
        buttons
          ? `<div class="actions">
              <button type="button" class="btn primary-alert" data-action="startDeload">Start lighter week</button>
              <button type="button" class="btn pill" data-action="snoozeRecovery">Not now (${esc(r.snoozeDays)} days)</button>
            </div>`
          : ''
      }
    </div>`;
  }
  if (where === 'entry') return '';
  if (!rs.next) return `<div class="next-deload">${icon('calendar')}<span>Lighter week every ${esc(r.schedWeeks)} weeks, counted from your first workout.</span></div>`;
  const left = Progress.daysBetween(todayISO(), rs.next);
  const weeksLeft = Math.max(0, Math.ceil(left / 7));
  return `<div class="next-deload">${icon('calendar')}<span><strong>Next lighter week ${esc(left <= 0 ? 'due now' : `in ${weeksLeft} week${weeksLeft === 1 ? '' : 's'}`)}</strong> · ${esc(formatDate(rs.next, false))}${
    rs.last ? ` · last one ${esc(formatDate(rs.last, false))}` : ''
  }${rs.pushed ? ` · +${rs.pushed} day${rs.pushed === 1 ? '' : 's'} for missed workouts` : ''}${
    rs.snoozed ? ` · alert snoozed until ${esc(formatDate(state.settings.snoozeUntil, false))}` : ''
  }${!r.schedOn ? ' · schedule off' : ''}</span></div>`;
}

if (!state.exercises) {
  const seed = seedExercises();
  state.exercises = seed.exercises;
  state.targets = state.targets || seed.targets;
  save(KEYS.exercises, state.exercises);
  save(KEYS.targets, state.targets);
}
if (!state.targets) state.targets = {};
if (!state.cardio) {
  state.cardio = { ...DEFAULT_CARDIO };
  save(KEYS.cardio, state.cardio);
}
for (const day of DAY_TYPES) if (day !== 'Custom' && !state.exercises[day]) state.exercises[day] = [];

// v1.7: the US Navy body fat formula needs the abdomen at the navel, measured apart from the waist (where the
// waistband sits). Added once after Waist to a saved list that has no abdomen field.
if (!state.settings.abdomenAdded) {
  const list = [...measureFields()];
  if (!list.some((f) => /abdomen|navel/i.test(f))) {
    const at = list.findIndex((f) => /waist/i.test(f));
    list.splice(at >= 0 ? at + 1 : list.length, 0, 'Abdomen (cm)');
    state.settings.measureFields = list;
  }
  state.settings.abdomenAdded = true;
  save(KEYS.settings, state.settings);
}

/* ---------------------------------------------------------------- helpers */

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso, withYear = true) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtKg(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function fmtVolume(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-IN')} kg`;
}

function fmtDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function setVolume(set) {
  return (set.reps || 0) * (Number(set.weightKg) || 0);
}

function sessionVolume(session) {
  return session.sets.reduce((sum, s) => sum + setVolume(s), 0);
}

function describeSet(set, withSetNo = true) {
  const reps =
    set.toFailure && set.reps == null
      ? 'to failure'
      : set.toFailure
        ? `${set.reps} reps to failure`
        : `${set.reps} reps`;
  const extra = set.warmup ? ' · warm-up' : !set.toFailure && Number.isFinite(set.rir) ? ` · ${rirLabel(set.rir)} in reserve` : '';
  return `${withSetNo ? `Set ${set.setNo} · ` : ''}${reps} · ${fmtKg(set.weightKg)} kg${extra}`;
}

function rirLabel(n) {
  return n >= 3 ? '3+' : String(n);
}

function groupByExercise(sets) {
  const groups = new Map();
  for (const s of sets) {
    if (!groups.has(s.exercise)) groups.set(s.exercise, []);
    groups.get(s.exercise).push(s);
  }
  for (const list of groups.values()) list.sort((a, b) => a.setNo - b.setNo || a.loggedAt.localeCompare(b.loggedAt));
  return groups;
}

function sortedHistory() {
  return [...state.history].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || (b.finishedAt || '').localeCompare(a.finishedAt || ''),
  );
}

function allKnownExercises() {
  const names = new Set();
  for (const list of Object.values(state.exercises)) for (const n of list) names.add(n);
  for (const s of state.history) for (const set of s.sets) names.add(set.exercise);
  if (state.draft) for (const set of state.draft.sets) names.add(set.exercise);
  return [...names];
}

function manageDays() {
  const days = DAY_TYPES.filter((d) => d !== 'Custom');
  for (const d of Object.keys(state.exercises)) if (!days.includes(d)) days.push(d);
  return days;
}

/* ---------------------------------------------------------- toast / modal */

let toastTimer = null;
/** Saffron toast for good news; `kind = 'error'` gives an ink one for validation and failures. */
function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', kind === 'error');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

/** In-page modal. Resolves with `true`/field values on confirm, `null` on cancel. */
function openModal({ title, message = '', fields = [], confirmText = 'OK', cancelText = 'Cancel', danger = false }) {
  const modal = document.getElementById('modal');
  return new Promise((resolve) => {
    modal.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="grab" aria-hidden="true"></div>
        <h2 id="modal-title">${esc(title)}</h2>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${fields
          .map(
            (f) => `
          <div class="field">
            <label for="modal-${esc(f.key)}">${esc(f.label)}</label>
            <input id="modal-${esc(f.key)}" class="input" type="${esc(f.type || 'text')}" value="${esc(f.value ?? '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="off" />
          </div>`,
          )
          .join('')}
        <div class="actions">
          <button type="button" class="btn" data-modal="cancel">${esc(cancelText)}</button>
          <button type="button" class="btn confirm ${danger ? 'danger' : ''}" data-modal="confirm">${esc(confirmText)}</button>
        </div>
      </div>`;
    modal.hidden = false;
    const first = modal.querySelector('input') || modal.querySelector('[data-modal="confirm"]');
    setTimeout(() => first && first.focus(), 30);

    const finish = (value) => {
      modal.hidden = true;
      modal.innerHTML = '';
      modal.onclick = null;
      modal.onkeydown = null;
      resolve(value);
    };
    modal.onclick = (e) => {
      const btn = e.target.closest('[data-modal]');
      if (btn?.dataset.modal === 'cancel' || e.target === modal) return finish(null);
      if (btn?.dataset.modal === 'confirm') {
        if (!fields.length) return finish(true);
        const values = {};
        for (const f of fields) values[f.key] = modal.querySelector(`#modal-${f.key}`).value.trim();
        return finish(values);
      }
    };
    modal.onkeydown = (e) => {
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') modal.querySelector('[data-modal="confirm"]').click();
    };
  });
}

/* ---------------------------------------------------------------- routing */

function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';
  const [name, ...rest] = h.split('/');
  return { name, arg: rest.join('/') };
}

function go(name, arg) {
  const target = `#${name}${arg ? '/' + encodeURIComponent(arg) : ''}`;
  if (location.hash === target) render();
  else location.hash = target;
}

/* --------------------------------------------------------- draft helpers */

function saveDraft() {
  save(KEYS.draft, state.draft);
}

function nextSetNo(exercise) {
  if (!state.draft) return 1;
  const nums = state.draft.sets.filter((s) => s.exercise === exercise).map((s) => s.setNo);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function lastWeight(exercise) {
  if (state.draft) {
    const mine = state.draft.sets.filter((s) => s.exercise === exercise);
    if (mine.length) return fmtKg(mine[mine.length - 1].weightKg);
  }
  for (const session of sortedHistory()) {
    const mine = session.sets.filter((s) => s.exercise === exercise);
    if (mine.length) return fmtKg(mine[mine.length - 1].weightKg);
  }
  return '';
}

function lastTimeHint(exercise) {
  for (const session of sortedHistory()) {
    if (state.draft && session.id === state.draft.id) continue;
    const mine = session.sets.filter((s) => s.exercise === exercise).sort((a, b) => a.setNo - b.setNo);
    if (!mine.length) continue;
    const parts = mine.map((s, i) => {
      const reps = s.toFailure ? (s.reps == null ? 'F' : `${s.reps}F`) : s.reps;
      return `${fmtKg(s.weightKg)}${i === 0 ? ' kg' : ''} × ${reps}`;
    });
    return `Last: ${formatDate(session.date, false)} · ${parts.join(', ')}`;
  }
  return '';
}

function defaultExercise() {
  const d = state.draft;
  if (d.sets.length) return d.sets[d.sets.length - 1].exercise;
  const list = state.exercises[d.dayType] || [];
  return list[0] || allKnownExercises()[0] || '';
}

function newForm(exercise) {
  const ex = exercise ?? defaultExercise();
  const setNo = nextSetNo(ex);
  return {
    exercise: ex,
    setNo,
    visibleSets: Math.max(4, setNo),
    reps: null, // number | 'other' | 'failure' | null
    otherReps: '',
    failureReps: '',
    rir: null, // 0–3 (3 = 3+), null until tapped
    warmup: false,
    weight: lastWeight(ex),
    editingId: null,
    addingExercise: false,
  };
}

function form() {
  if (!state.ui.form) state.ui.form = newForm();
  return state.ui.form;
}

/* ------------------------------------------------------------- rendering */

function render() {
  const { name, arg } = route();
  const app = document.getElementById('app');
  let html;
  switch (name) {
    case 'entry':
      if (!state.draft) return go('home');
      if (state.draft.finishedAt) return go('review'); // a finished workout is closed: Reopen is on the review
      html = renderEntry();
      break;
    case 'review':
      if (!state.draft && !state.ui.submit.session) return go('home');
      html = renderReview();
      break;
    case 'history':
      html = arg ? renderHistoryDetail(arg) : renderHistory();
      break;
    case 'workout':
      // The Workout tab goes straight back to an open workout.
      if (state.draft) return go(state.draft.finishedAt ? 'review' : 'entry');
      html = renderWorkoutHome();
      break;
    case 'muscles':
      html = renderMuscles();
      break;
    case 'more':
      html = renderMore();
      break;
    case 'settings': {
      const sec = SETTINGS_SECTIONS[arg] ? arg : null;
      if (!sec) return go('more');
      html = `${topbar(SETTINGS_SECTIONS[sec][0], { href: 'more', label: 'More' })}
        <div class="settings-page">${renderSettings()}</div>`;
      break;
    }
    case 'progress':
      html = arg ? renderExerciseProgress(arg) : renderProgress();
      break;
    case 'body':
      html = renderBody();
      break;
    case 'photos':
      html = renderPhotos();
      break;
    default:
      html = renderHome();
  }
  // Leaving the photo screens locks the vault, so decrypted photos never sit behind another screen.
  if (name !== 'photos') lockVault();
  // The logging panel redraws on every tap; keep its scroll position so it does not jump back to the top.
  const sheetScroll = app.querySelector('.logsheet')?.scrollTop || 0;
  app.innerHTML = html + tabBar(tabOf(name));
  const sheet = app.querySelector('.logsheet');
  if (sheet) sheet.scrollTop = sheetScroll;
  clearInterval(clockHandle);
  if (name === 'entry') {
    clockHandle = setInterval(() => {
      const el = document.getElementById('wk-clock');
      if (el && state.draft) el.textContent = fmtClock(entryElapsed());
      else clearInterval(clockHandle);
    }, 1000);
  }
  if (name === 'settings') {
    // One settings section per page: the others stay in the page (their handlers are shared) but hidden.
    for (const s of app.querySelectorAll('section[data-sec]')) s.hidden = s.dataset.sec !== arg;
  }
  if (name === 'history' && !arg) autoPull('history');
  if (name === 'body') autoPull('measurements');
  if (name === 'photos') afterPhotosRender();
  if (name === 'muscles') afterMusclesRender();
  if (name === 'entry') tickTimer();
  if (name !== 'review' && state.ui.submit.status !== 'idle' && state.ui.submit.status !== 'sending') {
    state.ui.submit = { status: 'idle', message: '', session: null };
  }
}

/** Opening History or Body pulls from the Sheet by itself, at most every 6 hours, so the Sync buttons are optional. */
const AUTO_PULL_MS = 6 * 3600 * 1000;
function autoPull(kind) {
  if (!haveApi() || !navigator.onLine || state.ui.syncing) return;
  const key = `wt.pulledAt.${kind}`;
  let last = 0;
  try {
    last = Number(localStorage.getItem(key)) || 0;
    if (Date.now() - last < AUTO_PULL_MS) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  setTimeout(() => (kind === 'history' ? syncHistoryFromSheet(true) : syncMeasurementsFromSheet(true)), 0);
}

/** "2 h ago" for the last automatic pull. */
function pulledAgo(kind) {
  let t = 0;
  try {
    t = Number(localStorage.getItem(`wt.pulledAt.${kind}`)) || 0;
  } catch {}
  if (!t) return 'not yet';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Page header (v2.0): an optional back link, then the large title. */
function topbar(title, back = null, links = []) {
  const row = back || links.length
    ? `<div class="topbar">
        ${back ? `<a class="btn link" href="#${esc(back.href)}">‹ ${esc(back.label)}</a>` : '<span></span>'}
        <div class="links">${links.map((l) => `<a class="btn link" href="#${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>
      </div>`
    : '';
  return `${row}${title ? `<h1 class="large">${esc(title)}</h1>` : ''}`;
}

/* ------------------------------------------------- v2.0: app shell, Today, Workout, More */

/** A named group: heading (+ something on the right) over its content. */
function group(title, right, body) {
  return `<section class="sgroup">
    <div class="ghead"><h2>${esc(title)}</h2>${right || ''}</div>
    ${body}
  </section>`;
}

/** A small status pill. tone: ok (green), warn (amber), bad (red), accent (saffron) or '' (grey). */
function tag(text, tone = '') {
  return `<span class="tag ${tone}">${esc(text)}</span>`;
}

/** A row of stat tiles: [[value, label], …]. */
function tiles(list) {
  return `<div class="tiles">${list.map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
}

/** A settings form row: label and hint on the left, the control (already built, ids and handlers intact) on the right. */
function frow(forId, label, hint, control) {
  return `<div class="frow"><label for="${esc(forId)}"><b>${esc(label)}</b>${hint ? `<span>${esc(hint)}</span>` : ''}</label>${control}</div>`;
}

/* Small line icons for edit rows (move, rename, delete). */
const IGLYPH = {
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
};
function ibtn(glyph, attrs, label, disabled = false) {
  return `<button type="button" class="ibtn ${glyph === 'trash' ? 'danger' : ''}" ${attrs} aria-label="${esc(label)}" ${disabled ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IGLYPH[glyph]}</svg></button>`;
}

/** One editable list row: name (and a second line), then its buttons. */
function erow(name, sub, buttons) {
  return `<div class="erow"><div class="tx"><b>${esc(name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div><div class="acts">${buttons}</div></div>`;
}

/** A logged set as one line: set number bubble, weight × reps, then reserve or warm-up. */
function setLine(x) {
  const reps = x.toFailure ? (x.reps == null ? 'failure' : `${x.reps} (failure)`) : x.reps;
  const extra = x.warmup ? 'warm-up' : !x.toFailure && Number.isFinite(x.rir) ? `${rirLabel(x.rir)} in reserve` : '';
  return `<span class="no ${x.warmup ? 'w' : ''}">${x.warmup ? 'W' : esc(x.setNo)}</span><span class="what"><b>${esc(fmtKg(x.weightKg))} kg × ${esc(reps)}</b>${extra ? ` <span class="muted">${esc(extra)}</span>` : ''}</span>`;
}

/** The bottom tab bar (all screens). `tab` is the one shown as current. */
function tabBar(tab) {
  const d = state.draft;
  const live = d && !d.finishedAt && d.sets.length ? `<span class="live">${d.sets.length}</span>` : '';
  const T = [
    ['home', 'Today', '<path d="M12 3v2M12 19v2M4.2 7.5l1.7 1M18.1 15.5l1.7 1M3 12h2M19 12h2M4.2 16.5l1.7-1M18.1 8.5l1.7-1"/><circle cx="12" cy="12" r="4"/>'],
    ['workout', 'Workout', '<rect x="2.5" y="8.5" width="3" height="7" rx="1"/><rect x="18.5" y="8.5" width="3" height="7" rx="1"/><rect x="5.5" y="6.5" width="3" height="11" rx="1"/><rect x="15.5" y="6.5" width="3" height="11" rx="1"/><path d="M8.5 12h7"/>'],
    ['muscles', 'Muscles', '<path d="M7 4.5c1.5 2 3.2 2.5 5 2.5s3.5-.5 5-2.5"/><path d="M5 9c2 1.2 3.5 1.5 4.5 1.5M19 9c-2 1.2-3.5 1.5-4.5 1.5"/><path d="M9.5 10.5c-.5 2-.3 4 .5 5.5l-1 5M14.5 10.5c.5 2 .3 4-.5 5.5l1 5M10 16h4"/>'],
    ['progress', 'Progress', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ['body', 'Body', '<circle cx="12" cy="4.5" r="2.2"/><path d="M6 9l6 1 6-1M12 10v5M9 21l3-6 3 6"/>'],
    ['more', 'More', '<path d="M4 6h16M4 12h16M4 18h16"/>'],
  ];
  return `<nav class="tabbar" aria-label="Sections">${T.map(
    ([key, label, icon]) => `<a class="tab" href="#${key}" ${tab === key ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>${label}${key === 'workout' ? live : ''}</a>`,
  ).join('')}</nav>`;
}

/** Which tab a route belongs to. */
function tabOf(name) {
  if (name === 'entry' || name === 'review' || name === 'workout') return 'workout';
  if (name === 'photos') return 'body'; // opened from Body, and its back link goes there
  if (name === 'history' || name === 'settings' || name === 'more') return 'more';
  return ['progress', 'body', 'muscles'].includes(name) ? name : 'home';
}

const TICK = '<span class="tickmark" aria-label="done">✓</span>';

/** "Log today": morning check, weight and small workout, one tap each (Today and Body). */
function dailyLog() {
  const today = todayISO();
  const e = recoveryEntry(today) || {};
  const morningDone = Number.isFinite(e.soreness) && !state.ui.morning.editing;
  const wf = weightField();
  const weighIn = wf ? state.measurements.filter((m) => m.date === today && Number.isFinite(m.values?.[wf])).pop() : null;
  const small = state.small.filter((s) => s.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const done = [morningDone, Boolean(weighIn), small.length > 0].filter(Boolean).length;
  const last = wf ? lastValue(wf) : null;
  const html = `<div class="card flush">
      <div class="drow">${appIcon('heart', 'pink')}
        <div class="tx"><b>Morning check ${morningDone ? TICK : ''}</b><span>${
          morningDone ? esc(`Soreness ${e.soreness}/10${Number.isFinite(e.sleepScore) ? ` · sleep score ${e.sleepScore}` : ''}`) : 'Soreness and the Watch sleep score'
        }</span></div>
        ${morningDone ? '<button type="button" class="btn small pill" data-action="morningEdit">Edit</button>' : ''}
      </div>
      ${morningDone ? '' : `<div class="dform">${morningForm()}</div>`}
      ${
        wf
          ? `<div class="drow">${appIcon('scale', 'teal')}
        <div class="tx"><b>Weight ${weighIn ? TICK : ''}</b><span>${
          weighIn ? esc(`${fmtKg(weighIn.values[wf])} kg saved`) : last !== null ? esc(`Last ${fmtKg(last)} kg`) : 'Morning, before food'
        }</span></div>
        ${
          weighIn
            ? ''
            : `<span class="inline"><label for="weigh-in" class="sr-only">Today's weight</label><input id="weigh-in" class="input mini" type="number" inputmode="decimal" step="0.1" min="0" placeholder="kg" value="${esc(state.ui.body.weighIn)}" data-input="weighIn" data-change="weighInCommit" /><button type="button" class="btn small pill" data-action="saveWeighIn">Save</button></span>`
        }
      </div>`
          : ''
      }
      <div class="drow">${appIcon('bolt', 'yellow')}
        <div class="tx"><b>Small workout ${small.length ? TICK : ''}</b><span>${
          small.length ? esc(`${small.length} today · last ${small[small.length - 1].time}`) : 'Push-ups, a walk… one tap logs the time'
        }</span></div>
        <button type="button" class="btn small pill" data-action="smallNow">+ Log</button>
      </div>
    </div>`;
  return { html, done, total: wf ? 3 : 2 };
}

/** Today's training: the workout in progress, done today, today's plan, or a rest day. */
function trainingCard() {
  const today = todayISO();
  const d = state.draft;
  if (d) {
    return `<div class="card stack">
      <div><b class="big-name">${esc(d.dayType)}</b><p class="hint">${
        d.finishedAt ? 'Finished, not sent yet: add how it went, heart rate and calories.' : `${d.sets.length} set${d.sets.length === 1 ? '' : 's'} logged · ${esc(formatDate(d.date))}`
      }</p></div>
      <div class="row-btns"><button type="button" class="btn primary" data-action="resume">${d.finishedAt ? 'Finish up' : 'Resume workout'}</button>
      <button type="button" class="btn danger" data-action="discardDraft">Discard</button></div>
    </div>`;
  }
  const doneToday = state.history.filter((s) => s.date === today);
  if (doneToday.length) {
    const s = doneToday[0];
    return `<div class="card"><div class="done-today"><div class="tick">✓</div><div><b>${esc(s.dayType)} done</b><p class="hint">${esc(
      [`${s.sets.length} sets`, s.score ? `rated ${s.score}/10` : '', s.synced ? 'in the Sheet' : 'waiting to sync'].filter(Boolean).join(' · '),
    )}</p></div></div><a class="btn link small" href="#workout">Start another workout ›</a></div>`;
  }
  const planned = scheduledDay(today);
  if (!planned) {
    return `<div class="card stack"><p style="margin:0"><b>Rest day</b> on your schedule.</p><a class="btn secondary" href="#workout">Start a workout anyway</a></div>`;
  }
  const list = dayExercises(planned);
  const last = state.history.filter((s) => s.dayType === planned && s.date < today).map((s) => s.date).sort().pop();
  return `<div class="card stack">
    <div><b class="big-name">${esc(planned)}</b><p class="hint">${list.length} exercise${list.length === 1 ? '' : 's'}${last ? ` · last done ${esc(formatDate(last, false))}` : ''}</p></div>
    <div class="plan-lines">${list
      .slice(0, 3)
      .map((n) => `<div class="plan-line"><i></i><span>${esc(n)}</span><span class="n">${esc(planText(planned, n) || '')}</span></div>`)
      .join('')}${list.length > 3 ? `<p class="hint">+ ${list.length - 3} more${state.cardio[planned] ? ` · then ${esc(state.cardio[planned])}` : ''}</p>` : ''}</div>
    ${nextWorkoutHtml(planned)}
    <button type="button" class="btn primary" data-action="startToday">Start ${esc(planned)}</button>
    <a class="btn link small" href="#workout">Another day ›</a>
  </div>`;
}

/** Calorie target, weight trend and body fat in one card. */
function nutritionCard() {
  const { calc, bf, weight } = calorieState();
  const lock = state.settings.calorieLock;
  const rows = [];
  if (calc.target || lock) {
    rows.push(['Calorie target', `${(lock?.target ?? calc.target).toLocaleString('en-IN')}`, 'kcal a day · enter in MyFitnessPal', lock ? `set ${formatDate(lock.date, false)}` : '', '']);
  }
  if (weight) rows.push(['Weight', `${fmtKg(weight.kg)} kg`, weight.n >= 3 ? `average of ${weight.n} weigh-ins` : `on ${formatDate(weight.date, false)}`, '', '']);
  if (bf) rows.push(['Body fat', `${fmtKg(bf.bf)}%`, `US Navy · ${formatDate(bf.date, false)}`, '', '']);
  if (!rows.length) return '<div class="card"><p class="hint" style="margin:0">Weigh in and add your height in More → Calories &amp; body fat to see your calorie target here.</p></div>';
  return `<div class="card kvs">${rows
    .map(([k, v, h, d]) => `<div class="kv"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="h">${esc(h)}</div><div class="d">${esc(d)}</div></div>`)
    .join('')}</div>`;
}

function renderHome() {
  const today = todayISO();
  const log = dailyLog();
  const e = recoveryEntry(today) || {};
  const morningDone = Number.isFinite(e.soreness) && !state.ui.morning.editing;
  const attention = homeBanners();
  const rc = recoveryCard('home');
  const rcInfo = rc.includes('class="alert') ? '' : rc;
  const waiting = state.outbox.length;
  if (waiting) {
    attention.unshift(
      notice(
        'warn',
        'sync',
        'blue',
        `${waiting} workout${waiting === 1 ? '' : 's'} waiting to sync`,
        haveApi() ? 'Retries by itself when the app opens or comes back online.' : 'Add the script URL and token in More → Google Sheet first.',
        '',
        `<button type="button" class="btn small pill" data-action="retryNow" ${state.ui.syncing ? 'disabled' : ''}>${state.ui.syncing ? 'Syncing…' : 'Retry now'}</button>`,
      ),
    );
  }
  return `
    <div class="brandrow">
      <img class="logo" src="./icons/icon.svg" alt="" width="44" height="44" />
      <div><div class="brandname">Bhimlekha</div><h1 class="large">Today</h1></div>
    </div>
    <p class="sub">${esc(WEEKDAYS[new Date().getDay()])}, ${esc(formatDate(today))}</p>
    ${group('Log today', `<span class="freq">Daily · ${log.done} of ${log.total} done</span>`, log.html)}
    ${morningDone ? group('Recovery', '', morningCard()) : ''}
    ${group('Training', '', trainingCard() + (rcInfo ? `<div style="margin-top:10px">${rcInfo}</div>` : ''))}
    ${group('Nutrition & body', '<a class="btn link small" href="#body">Body ›</a>', nutritionCard())}
    ${attention.length ? group('Needs attention', `<span class="count">${attention.length}</span>`, `<div class="attention">${attention.join('')}</div>`) : ''}`;
}

/** Workout tab when nothing is running: start any day, then recent workouts. */
function renderWorkoutHome() {
  const d = state.draft;
  const st = state.ui.start;
  const planned = /^\d{4}-\d{2}-\d{2}$/.test(st.date) ? scheduledDay(st.date) : '';
  if (!state.ui.startPicked && planned && DAY_TYPES.includes(planned)) st.dayType = planned;
  const recent = sortedHistory().slice(0, 5);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(st.date) ? st.date : todayISO();
  const isToday = date === todayISO();
  // One tap starts a day: the planned one first, the rest in plan order.
  const days = DAY_TYPES.filter((x) => x !== 'Custom');
  const ordered = planned && days.includes(planned) ? [planned, ...days.filter((x) => x !== planned)] : days;
  const dayRow = (day) => {
    const n = dayExercises(day).length;
    const last = state.history.filter((s) => s.dayType === day && s.date < date).map((s) => s.date).sort().pop();
    const ago = last ? Progress.daysBetween(last, date) : null;
    return `<button type="button" class="lrow" data-action="quickStart" data-day="${esc(day)}">${appIcon('dumbbell', day === planned ? 'saffron' : 'grey')}
      <span class="tx"><b>${esc(day)}</b><span>${n} exercise${n === 1 ? '' : 's'}${last ? ` · last done ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}` : ' · not done yet'}</span></span>
      ${day === planned ? tag(isToday ? 'Today' : 'Planned', 'accent') : ''}<span class="go">Start</span></button>`;
  };
  return `
    <h1 class="large">Workout</h1>
    <p class="sub">${d ? 'A workout is open' : 'Tap a day to start'}</p>
    ${d ? group('Open workout', '', trainingCard()) : ''}
    ${nextWorkoutHtml(planned) ? `<div class="sgroup">${nextWorkoutHtml(planned)}</div>` : ''}
    ${group(
      d ? 'Start a new workout' : 'Start a workout',
      `<label class="datechip" for="start-date">${icon('calendar')}<span>${esc(isToday ? 'Today' : formatDate(date, false))}</span><input id="start-date" type="date" value="${esc(date)}" data-change="startDate" aria-label="Workout date" /></label>`,
      `<div class="card flush">
        ${ordered.map(dayRow).join('')}
        <details class="customday" ${st.dayType === 'Custom' ? 'open' : ''}>
          <summary class="lrow">${appIcon('bolt', 'yellow')}<span class="tx"><b>Custom day</b><span>Your own name, e.g. Arms</span></span>${CHEV}</summary>
          <div class="addrow input-row">
            <label for="custom-day" class="sr-only">Day name</label>
            <input id="custom-day" class="input" value="${esc(st.custom)}" placeholder="e.g. Arms" data-input="startCustom" autocomplete="off" />
            <button type="button" class="btn" data-action="startCustomDay">Start</button>
          </div>
        </details>
      </div>
      ${d ? '<p class="hint gnote">Starting a new workout asks before discarding the open one.</p>' : ''}`,
    )}
    ${group(
      'Recent',
      '<a class="btn link small" href="#history">All ›</a>',
      recent.length
        ? `<div class="card flush">${recent
            .map(
              (s) => `<button type="button" class="lrow" data-action="openSession" data-id="${esc(s.id)}">${appIcon('check', s.synced ? 'green' : 'grey')}
                <span class="tx"><b>${esc(s.dayType)} · ${esc(formatDate(s.date, false))}</b><span>${esc(
                  [`${s.sets.length} sets`, fmtVolume(sessionVolume(s)), s.score ? `${s.score}/10` : '', s.synced ? 'in the Sheet' : 'waiting to sync'].filter(Boolean).join(' · '),
                )}</span></span>${CHEV}</button>`,
            )
            .join('')}</div>`
        : '<div class="card"><p class="hint" style="margin:0">Your workouts show here.</p></div>',
    )}`;
}

/* iOS-Settings-style icons: a coloured rounded square with a white glyph. */
const GLYPHS = {
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  dumbbell: '<rect x="2" y="9" width="3" height="6" rx="1"/><rect x="19" y="9" width="3" height="6" rx="1"/><rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/><path d="M8 12h8"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M10 2h4M12 2v3"/>',
  flame: '<path d="M12 21c4 0 7-2.8 7-7 0-3.5-2.5-6-4-8 0 2.5-1.5 4-3 4 0-3-1.5-5.5-4-7 .3 3-3 5.5-3 10 0 4.2 3 8 7 8z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M6 12h3l1.5-2.5 2 5 1.5-2.5h4" stroke-width="1.6"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5M20 8v3"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z"/><circle cx="12" cy="13.5" r="3.5"/>',
  sheet: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M4.5 9h15M4.5 14.5h15M10 9v12"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2.5h16V17"/>',
  cloud: '<path d="M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/><path d="M12 11v5M9.5 13.5L12 11l2.5 2.5"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 2"/>',
  bolt: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M8 3.5h8M7 6h10v14H7z"/><path d="M9.5 13l2 2 3.5-4"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9a5.5 5.5 0 0 1 8 0"/><path d="M12 9.5l1.5-2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
  body: '<circle cx="12" cy="4.5" r="2.2"/><path d="M6 9l6 1 6-1M12 10v5M9 21l3-6 3 6"/>',
  cross: '<path d="M7 7l10 10M17 7L7 17"/>',
  watch: '<rect x="6.5" y="6.5" width="11" height="11" rx="3"/><path d="M9 6.5L9.5 3h5l.5 3.5M9 17.5l.5 3.5h5l.5-3.5M12 9.5V12l1.5 1"/>',
  alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  faceid: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M17.5 12v3M20 12v2"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
};
const ICON_BG = {
  red: 'linear-gradient(#ff6961,#e5463e)', ink: 'linear-gradient(#4a3f38,#17120f)', green: 'linear-gradient(#58d27b,#2f8a55)', grey: 'linear-gradient(#a1a1a6,#6e6e73)',
  saffron: 'linear-gradient(#ffa95a,#f07f1e)', pink: 'linear-gradient(#ff7a95,#e5395f)', teal: 'linear-gradient(#5ccfe6,#1e94c4)', purple: 'linear-gradient(#b48cff,#7a4ee0)',
  gsheet: 'linear-gradient(#3fbf68,#188038)', blue: 'linear-gradient(#5c9bff,#2f63e0)', sky: 'linear-gradient(#7fc8ff,#3a8fe0)', indigo: 'linear-gradient(#7d7aff,#4b45d6)',
  orange: 'linear-gradient(#ff9f45,#e8611a)', yellow: 'linear-gradient(#ffd84d,#f2a516)',
};
/** A small line icon in the text colour (in place of emoji). */
function icon(glyph) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[glyph]}</svg>`;
}
function appIcon(glyph, bg) {
  return `<span class="appicon" style="background:${ICON_BG[bg]}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[glyph]}</svg></span>`;
}
const CHEV = '<svg class="chev" width="9" height="15" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

// Settings sections opened from More: [data-sec name, title, icon, colour, one-line summary].
const SETTINGS_SECTIONS = {
  schedule: ['Schedule', 'calendar', 'red'], exercises: ['Exercises & plans', 'dumbbell', 'ink'], progression: ['Progression', 'trend', 'green'],
  logging: ['Logging & rest timer', 'timer', 'grey'], questions: ['End-of-workout questions', 'chat', 'indigo'], recovery: ['Lighter weeks', 'leaf', 'green'],
  calories: ['Calories & body fat', 'flame', 'saffron'], recoveryScore: ['Recovery score & Shortcut', 'heart', 'pink'], body: ['Measurements & photos', 'ruler', 'teal'],
  sheet: ['Google Sheet', 'sheet', 'gsheet'], copy: ['Settings copy', 'cloud', 'sky'], backup: ['Backup', 'download', 'blue'],
};

function renderMore() {
  const s = state.settings;
  const row = (href, glyph, bg, title, sub) =>
    `<a class="lrow" href="#${href}">${appIcon(glyph, bg)}<span class="tx"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${CHEV}</a>`;
  const sec = (key, sub) => row(`settings/${key}`, SETTINGS_SECTIONS[key][1], SETTINGS_SECTIONS[key][2], SETTINGS_SECTIONS[key][0], sub);
  const missedOpen = state.missed.filter((m) => !m.reason).length;
  const sched = s.schedule || DEFAULT_SCHEDULE;
  return `
    <h1 class="large">More</h1>
    <p class="sub">Settings, history and your data</p>
    ${group('Training', '', `<div class="card flush">
      ${sec('schedule', [1, 2, 3, 4, 5, 6, 0].map((i) => sched[i] ? `${WEEKDAYS[i].slice(0, 3)} ${sched[i]}` : '').filter(Boolean).slice(0, 2).join(' · ') + ' …')}
      ${sec('exercises', `${manageDays().length} days · ${allKnownExercises().length} exercises`)}
      ${sec('progression', 'When to add weight, warnings')}
      ${sec('logging', `Reps buttons · rest ${s.restSeconds} s · RIR ${s.requireRir ? 'on' : 'off'}`)}
      ${sec('questions', `${questions().length} questions after each workout`)}
      ${sec('recovery', 'Lighter week alerts')}
    </div>`)}
    ${group('Body & health', '', `<div class="card flush">
      ${sec('calories', s.calorieLock ? `${s.calorieLock.target.toLocaleString('en-IN')} kcal a day` : 'Height, goal, rate')}
      ${sec('recoveryScore', 'Weights, baseline, morning Shortcut')}
      ${sec('body', `${measureFields().length} measurements · ${poses().length} poses`)}
      ${row('photos', 'lock', 'purple', 'Progress photos', 'Encrypted on this phone')}
    </div>`)}
    ${group('History', '', `<div class="card flush">
      ${row('history', 'history', 'indigo', 'Workouts and missed days', `${state.history.length} workouts${missedOpen ? ` · ${missedOpen} missed without a reason` : ''}`)}
      ${row('body', 'bolt', 'yellow', 'Small workouts and measurements', `${state.small.length} small workouts · ${state.measurements.length} entries`)}
    </div>`)}
    ${group('Your data', '', `<div class="card flush">
      ${sec('sheet', haveApi() ? 'Connected' : 'Not connected yet')}
      ${sec('copy', state.backup.linked ? 'Saved in the Sheet' : 'Not linked yet')}
      ${sec('backup', 'Export or import a JSON file')}
    </div>`)}
    <div class="about"><img class="logo lg" src="./icons/icon.svg" alt="" width="64" height="64" /><b>Bhimlekha</b><span class="hint">भीमलेखा · Bhima's record · v${esc(APP_VERSION)}</span></div>`;
}

/** "Today · Tuesday: Pull A", when it was last done, and muscle groups left untrained too long. */
function nextWorkoutHtml(planned) {
  const st = state.ui.start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date)) return '';
  const today = st.date === todayISO();
  const when = `${today ? 'Today' : formatDate(st.date, false)} · ${WEEKDAYS[new Date(Date.parse(st.date)).getUTCDay()]}`;
  let line;
  if (!planned) line = `${esc(when)}: <strong>rest day</strong> on your schedule.`;
  else {
    const last = state.history.filter((s) => s.dayType === planned && s.date < st.date).map((s) => s.date).sort().pop();
    line = `${esc(when)}: <strong>${esc(planned)}</strong>${last ? ` · last done ${esc(formatDate(last, false))} (${Progress.daysBetween(last, st.date)} days ago)` : ''}`;
  }
  const neglected = today ? neglectedMuscles() : [];
  return `<div class="next-workout">
      <p class="small iline" style="margin:0">${icon('calendar')}<span>${line}</span></p>
      ${
        neglected.length
          ? `<p class="small warn-text iline" style="margin:6px 0 0">${icon('alert')}<span>Not trained for over ${esc(state.settings.progression.neglectDays)} days: ${neglected
              .map((n) => `<strong>${esc(n.muscle)}</strong> ${n.last ? `${n.days} days` : 'not yet'}`)
              .join(', ')}</span></p>`
          : ''
      }
    </div>`;
}

/** One "Needs attention" item: icon, title, a line of (already escaped) detail, extra content and actions. */
function notice(cls, glyph, bg, title, sub, extra = '', actionsHtml = '') {
  return `<div class="banner notice ${cls}">
    <div class="nhead">${appIcon(glyph, bg)}<div class="tx"><b class="title">${esc(title)}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>
    ${extra}${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
  </div>`;
}

/** Missed days still waiting for a reason (newest first), each with one-tap reasons. */
function missedCard() {
  const open = state.missed.filter((m) => !m.reason).sort((a, b) => b.date.localeCompare(a.date));
  if (!open.length) return '';
  return notice(
    'warn',
    'calendar',
    'red',
    `Missed workout${open.length === 1 ? '' : 's'}: why?`,
    `One tap each. Their exercises' clocks pause ${esc(state.settings.progression.missedPauseDays)} days, so a skip is not counted as stalling.`,
    `${open
      .slice(0, 4)
      .map(
        (m) => `<div class="missed-item">
            <p class="small" style="margin:10px 0 6px"><strong>${esc(m.dayType)}</strong> · ${esc(WEEKDAYS[new Date(Date.parse(m.date)).getUTCDay()])} ${esc(formatDate(m.date, false))}</p>
            <div class="pills">${missReasons()
              .map((r) => `<button type="button" class="pill-btn" data-action="missedReason" data-id="${esc(m.id)}" data-reason="${esc(r)}">${esc(r)}</button>`)
              .join('')}</div>
          </div>`,
      )
      .join('')}
      ${open.length > 4 ? `<p class="small muted" style="margin:6px 0 0">${open.length - 4} more in History.</p>` : ''}`,
  );
}

/** Weight increases due, the weekly check-in, and photos waiting for a backup. */
const RECOVERY_ADVICE = {
  green: 'Train as planned.',
  amber: 'Train, but keep the weights and do one set fewer per exercise. Stop each set with a rep or two in reserve.',
  red: 'Make it a light session (lighter-week rules: about half the sets, 10% less weight) or rest today.',
};
const RECOVERY_TITLE = { green: 'Ready to train', amber: 'Go a little easier', red: 'Take it light today' };

/** A ring gauge 0–100 with the number in the middle. */
function ringGauge(score) {
  const c = 2 * Math.PI * 30;
  const off = score === null || score === undefined ? c : c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `<span class="ringbox"><svg class="ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="track"/><circle cx="36" cy="36" r="30" class="val" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 36 36)"/></svg><b>${score ?? '–'}</b></span>`;
}

/** Home's morning check: soreness and the Watch sleep score from the owner, sleep / RHR / HRV from the Shortcut,
    then the day's recovery score with what to do about it. Advice only: it never locks anything. */
function morningCard() {
  const today = todayISO();
  const e = recoveryEntry(today) || {};
  const ui = state.ui.morning;
  const fromWatch = [
    Number.isFinite(e.sleepHours) ? `${e.sleepHours.toFixed(1)} h sleep` : '',
    Number.isFinite(e.rhr) ? `resting HR ${Math.round(e.rhr)}` : '',
    Number.isFinite(e.hrv) ? `HRV ${Math.round(e.hrv)} ms` : '',
  ].filter(Boolean);
  const watchLine = fromWatch.length
    ? `⌚ From your Watch: ${fromWatch.join(' · ')}`
    : '⌚ Waiting for the morning Shortcut (sleep, resting HR, HRV). More → Recovery score shows how to set it up.';
  const answered = Number.isFinite(e.soreness) && !ui.editing;
  if (answered) {
    const r = recoveryResult(today);
    const score = r && r.score !== null ? r.score : null;
    return `<div class="card recovery-score ${esc(r?.band || '')}">
      <div class="rhead">${ringGauge(score)}
        <div class="tx"><b>${esc(RECOVERY_TITLE[r?.band] || 'Recovery')}</b><span>${esc(r?.band ? RECOVERY_ADVICE[r.band] : 'Not enough data for a score yet.')}</span></div>
      </div>
      ${
        r?.parts?.length
          ? `<div class="parts">${r.parts
              .map((p) => `<div class="part"><span>${esc(p.label)}</span><i><em style="width:${Math.max(0, Math.min(100, p.score))}%"></em></i><b>${esc(p.score)}</b><small>${esc(p.detail)}</small></div>`)
              .join('')}</div>`
          : ''
      }
      ${(r?.notes || []).map((n) => `<p class="small muted" style="margin:8px 0 0">${esc(n)}</p>`).join('')}
      ${fromWatch.length ? '' : `<p class="small muted watchline" style="margin:8px 0 0">${icon('watch')}${esc(watchLine.replace(/^⌚ /, ''))}</p>`}
      <button type="button" class="btn link small" data-action="morningEdit" style="padding-left:0;margin-top:4px">Change answers</button>
    </div>`;
  }
  return `<div class="card stack"><b>Morning check</b>${morningForm()}</div>`;
}

/** The morning questions: soreness (required) and the Watch sleep score, with the Shortcut's numbers above. */
function morningForm() {
  const today = todayISO();
  const e = recoveryEntry(today) || {};
  const ui = state.ui.morning;
  const fromWatch = [
    Number.isFinite(e.sleepHours) ? `${e.sleepHours.toFixed(1)} h sleep` : '',
    Number.isFinite(e.rhr) ? `resting HR ${Math.round(e.rhr)}` : '',
    Number.isFinite(e.hrv) ? `HRV ${Math.round(e.hrv)} ms` : '',
  ].filter(Boolean);
  const watchLine = fromWatch.length
    ? `⌚ From your Watch: ${fromWatch.join(' · ')}`
    : '⌚ Waiting for the morning Shortcut (sleep, resting HR, HRV). More → Recovery score shows how to set it up.';
  const sore = ui.soreness ?? (Number.isFinite(e.soreness) ? e.soreness : null);
  // Fewer taps: the optional sleep score comes first; tapping a soreness number saves both (no Save button).
  return `
      <p class="small muted watchline" style="margin:0">${icon('watch')}${esc(watchLine.replace(/^⌚ /, ''))}</p>
      <div class="frow inset">
        <label for="sleep-score"><b>Watch sleep score</b><span>Optional, 0–100</span></label>
        <input id="sleep-score" class="input fnum" type="number" inputmode="numeric" min="0" max="100" placeholder="–" value="${esc(ui.sleepScore || (Number.isFinite(e.sleepScore) ? e.sleepScore : ''))}" data-input="morningSleepScore" />
      </div>
      <div class="matrix-row">
        <div class="q">How sore are you? <span class="small muted">1 = none · 10 = very sore · tap to save</span></div>
        <div class="chips ten" role="group" aria-label="Soreness">${Array.from({ length: 10 }, (_, i) => i + 1)
          .map((n) => `<button type="button" class="chip" data-action="morningSoreness" data-value="${n}" aria-pressed="${sore === n}">${n}</button>`)
          .join('')}</div>
      </div>`;
}

/** A new calorie target to enter in MyFitnessPal, until the owner confirms it is entered. */
function calorieBanner() {
  const lock = state.settings.calorieLock;
  if (!lock || lock.seen) return '';
  return notice(
    'accent',
    'flame',
    'saffron',
    `New calorie target: ${lock.target.toLocaleString('en-IN')} kcal a day`,
    `${lock.prev ? `Was ${esc(lock.prev.toLocaleString('en-IN'))}. ` : ''}Reason: ${esc(TARGET_REASON[lock.reason] || lock.reason)}. Enter it in MyFitnessPal (Goals → Calories).`,
    '',
    '<button type="button" class="btn small pill" data-action="calorieSeen">Done, it is in MyFitnessPal</button>',
  );
}

/** Everything on Today that needs attention, as a list of banners (empty ones left out). */
function homeBanners() {
  const out = [];
  out.push(calorieBanner());
  out.push(missedCard());
  out.push(weekSummaryHome());
  const all = trackedExercises()
    .map((n) => analyse(n))
    .filter(Boolean);
  const rc = recoveryCard('home');
  if (rc.includes('class="alert')) out.push(rc); // the "next lighter week" line is information, shown under Training
  const due = recoveryState().active ? [] : all.filter((a) => a.status.kind === 'increase');
  if (due.length) {
    out.push(
      notice(
        'accent',
        'dumbbell',
        'saffron',
        'Time to add weight',
        `${due.length} exercise${due.length === 1 ? '' : 's'} hit the top of the range`,
        `<div class="mini-rows">${due.map((a) => `<div><span>${esc(a.exercise)}</span><b>${esc(fmtKg(a.status.weight))} → ${esc(fmtKg(a.status.nextWeight))} kg</b></div>`).join('')}</div>`,
      ),
    );
  }
  const check = checkinState();
  if (check.due) {
    out.push(notice('', 'ruler', 'teal', check.title, 'Measurements and photos, same time and conditions as last week.', '', '<a class="btn small pill" href="#body">Open check-in</a>'));
  }
  const v = state.vaultInfo;
  const weeks = unsavedWeeks();
  // Before the vault is first unlocked in v1.4 the week list is unknown, so fall back to the old photo/backup dates.
  if (weeks.length || (!v.weeksChanged && v.lastPhotoAt && (!v.lastBackupAt || v.lastBackupAt < v.lastPhotoAt))) {
    out.push(
      notice(
        'warn',
        'folder',
        'sky',
        'Photos not saved to Files yet',
        weeks.length ? `${esc(weeks.map((f) => f.split(' - ')[0]).join(', '))}: save to Files → iCloud Drive → Bhimlekha.` : 'Save your week folders to Files → iCloud Drive → Bhimlekha.',
        '',
        '<a class="btn small pill" href="#photos">Open Photos</a>',
      ),
    );
  }
  return out.filter(Boolean);
}

/** Weekly check-in: due on the check-in day until one is logged, and overdue once a week has passed. */
function checkinState() {
  const today = todayISO();
  const checkins = state.measurements.filter((m) => m.kind === 'checkin').map((m) => m.date).sort();
  const last = checkins[checkins.length - 1] || null;
  const dayName = WEEKDAYS[Number(state.settings.checkinDay) || 0];
  if (last === today) return { due: false, last };
  if (new Date().getDay() === (Number(state.settings.checkinDay) || 0)) return { due: true, last, title: `${dayName} check-in` };
  if (last && Progress.daysBetween(last, today) > 7) return { due: true, last, title: `Check-in overdue (last: ${formatDate(last)})` };
  return { due: false, last };
}

function exerciseOptions(f) {
  const day = state.draft.dayType;
  const mine = state.exercises[day] || [];
  const others = allKnownExercises()
    .filter((n) => !mine.includes(n))
    .sort((a, b) => a.localeCompare(b));
  if (f.exercise && !mine.includes(f.exercise) && !others.includes(f.exercise)) others.unshift(f.exercise);
  const opt = (n) => `<option value="${esc(n)}" ${f.exercise === n ? 'selected' : ''}>${esc(n)}</option>`;
  return `
    ${!f.exercise ? '<option value="" selected disabled>Choose an exercise</option>' : ''}
    ${mine.map(opt).join('')}
    ${mine.length && others.length ? '<option disabled>──────────</option>' : ''}
    ${others.map(opt).join('')}
    <option value="__new__">+ Add new exercise…</option>`;
}

/** Exercises shown on the workout screen: the day's plan in order, then anything else logged today. */
function entryExercises() {
  const d = state.draft;
  const plan = state.exercises[d.dayType] || [];
  const extra = [...new Set(d.sets.map((s) => s.exercise))].filter((n) => !plan.includes(n));
  return [...plan, ...extra];
}

/** Planned working sets for an exercise ("3 × 8-12" → 3), else the sets logged (at least 1). */
function plannedSets(name) {
  const p = Progress.parsePlan(planText(state.draft.dayType, name));
  const done = state.draft.sets.filter((s) => s.exercise === name && !s.warmup).length;
  return Math.max(p ? p.sets : 0, done, 1);
}

function workingSetsDone(name) {
  return state.draft.sets.filter((s) => s.exercise === name && !s.warmup).length;
}

/** One exercise card: name, add-weight badge, a dot per planned set, plan, and today's sets or last time. */
function exerciseCard(name) {
  const d = state.draft;
  const done = workingSetsDone(name);
  const total = plannedSets(name);
  const today = d.sets.filter((s) => s.exercise === name);
  const a = inDeload(d.date) ? null : analyse(name);
  const badge = a && a.status.kind === 'increase' ? `<span class="badge">+${esc(fmtKg(a.status.nextWeight - a.status.weight))} kg</span>` : '';
  const dots = Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('');
  const plan = planText(d.dayType, name);
  const line = today.length ? `Today: ${today.map((s) => describeSet(s, false)).join(', ')}` : lastTimeHint(name);
  return `<button type="button" class="excard ${done >= total ? 'done' : ''}" data-action="openLog" data-name="${esc(name)}">
    <span class="name">${esc(name)}${badge}</span>
    <span class="sets" aria-label="${done} of ${total} sets">${dots}</span>
    ${plan ? `<span class="plan">Plan ${esc(plan)}</span>` : ''}
    ${line ? `<span class="last">${esc(line)}</span>` : ''}
  </button>`;
}

function renderEntry() {
  const d = state.draft;
  const names = entryExercises();
  const total = names.reduce((t, n) => t + plannedSets(n), 0);
  const done = d.sets.filter((s) => !s.warmup).length;
  const inProgress = names.filter((n) => workingSetsDone(n) > 0 && workingSetsDone(n) < plannedSets(n));
  const next = names.filter((n) => workingSetsDone(n) === 0);
  const finished = names.filter((n) => workingSetsDone(n) >= plannedSets(n) && workingSetsDone(n) > 0);
  const cardio = state.cardio[d.dayType];
  const list = (title, items, empty) =>
    group(title, `<span class="note">${items.length}</span>`, `<div class="card flush">${items.length ? items.map(exerciseCard).join('') : `<p class="empty pad">${esc(empty)}</p>`}</div>`);
  return `
    <div class="wk-head">
      <div class="top">
        <div class="t"><b>${esc(d.dayType)}</b><span class="clock"><span id="wk-clock">${esc(fmtClock(entryElapsed()))}</span> · ${done} of ${total} sets${d.date === todayISO() ? '' : ` · ${esc(formatDate(d.date, false))}`}</span></div>
        <button type="button" class="btn small pill" data-action="finishWorkout">Finish</button>
      </div>
      <div class="progress" aria-hidden="true"><div style="width:${Math.min(100, total ? (done / total) * 100 : 0)}%"></div></div>
    </div>
    ${recoveryCard('entry')}
    <p class="sub" style="margin-top:12px">Tap an exercise to log a set.</p>
    ${inProgress.length ? list('In progress', inProgress, '') : ''}
    ${list('Up next', next, 'Every exercise has been started.')}
    ${finished.length ? list('Done', finished, '') : ''}
    <div class="sgroup"><button type="button" class="btn secondary" data-action="openLog" data-name="">+ Another exercise</button></div>
    ${cardio ? `<p class="hint" style="text-align:center;margin-top:16px">After lifting: ${esc(cardio)}</p>` : ''}
    ${state.ui.timer ? renderTimer() : ''}
    ${state.ui.sheet ? renderSetSheet() : ''}`;
}

/** Time since the first set (or the start), for the header clock. */
function entryElapsed() {
  const d = state.draft;
  if (!d) return 0;
  const times = d.sets.map((s) => Date.parse(s.loggedAt)).filter(Number.isFinite);
  const start = times.length ? Math.min(...times) : Date.parse(d.startedAt);
  return Number.isFinite(start) ? Math.max(0, (Date.now() - start) / 1000) : 0;
}

/** The logging panel (slides up from the bottom): the same form as before, with a −/+ weight stepper. */
function renderSetSheet() {
  const d = state.draft;
  const f = form();
  const target = state.targets[d.dayType]?.[f.exercise];
  const hint = f.exercise ? lastTimeHint(f.exercise) : '';
  const chips = repsChips()
    .map((c) => {
      const label = c === 'other' ? 'Other' : c === 'failure' ? 'Failure' : c;
      return `<button type="button" class="chip" data-action="reps" data-value="${c}" aria-pressed="${f.reps === c}">${label}</button>`;
    })
    .join('');
  const setsHtml = [];
  for (let i = 1; i <= f.visibleSets; i++) {
    setsHtml.push(`
      <label class="seg ${f.setNo === i ? 'selected' : ''}">
        <input type="radio" name="setNo" value="${i}" data-change="setNo" ${f.setNo === i ? 'checked' : ''} />
        Set ${i}
      </label>`);
  }
  const today = d.sets.filter((s) => s.exercise === f.exercise);
  const step = Number(state.settings.steps?.[f.exercise]) || 2.5;
  return `
    <div class="logsheet-overlay" data-action="closeSheet" aria-hidden="true"></div>
    <section class="logsheet" role="dialog" aria-modal="true" aria-label="Log a set">
      <div class="grab" aria-hidden="true"></div>
      <div class="stack">
        <div class="logsheet-head">
          <label for="exercise" class="sr-only">Exercise</label>
          <select id="exercise" class="select" data-change="exercise">${exerciseOptions(f)}</select>
          <button type="button" class="btn link" data-action="closeSheet">Close</button>
        </div>
        ${
          f.addingExercise
            ? `<div class="input-row newex">
                <input id="new-exercise" class="input" placeholder="New exercise name" value="${esc(state.ui.newExercise)}" data-input="newExercise" autocomplete="off" />
                <button type="button" class="btn" data-action="addExercise">Add</button>
              </div>`
            : ''
        }
        ${target || hint ? `<p class="hint" style="margin:0">${esc([target ? `Plan ${target}` : '', hint].filter(Boolean).join(' · '))}</p>` : ''}
        ${f.exercise ? entryStatus(f.exercise) : ''}
        <fieldset>
          <legend>Set number</legend>
          <div class="segments">
            ${setsHtml.join('')}
            <button type="button" class="seg plus" data-action="moreSets" aria-label="Add another set number">+</button>
          </div>
        </fieldset>
        <div id="set-compare" aria-live="polite">${setCompareHtml()}</div>
        <div>
          <label for="weight">Weight <span class="small muted">kg · steps of ${esc(fmtKg(step))} · 0 = bodyweight</span></label>
          <div class="stepper">
            <button type="button" data-action="weightStep" data-dir="-1" aria-label="${esc(fmtKg(step))} kg less">−</button>
            <input id="weight" class="input" type="number" inputmode="decimal" min="0" step="0.5" placeholder="kg" value="${esc(f.weight)}" data-input="weight" />
            <button type="button" data-action="weightStep" data-dir="1" aria-label="${esc(fmtKg(step))} kg more">+</button>
          </div>
        </div>
        <fieldset>
          <legend>Reps</legend>
          <div class="chips" id="reps-grid">${chips}</div>
          ${
            f.reps === 'other'
              ? `<div style="margin-top:8px">
                  <label for="other-reps" class="sr-only">Reps</label>
                  <input id="other-reps" class="input" type="number" inputmode="numeric" min="1" step="1" placeholder="Reps" value="${esc(f.otherReps)}" data-input="otherReps" />
                </div>`
              : ''
          }
          ${
            f.reps === 'failure'
              ? `<div style="margin-top:8px">
                  <label for="failure-reps" class="sr-only">Reps done (optional)</label>
                  <input id="failure-reps" class="input" type="number" inputmode="numeric" min="0" step="1" placeholder="Reps done (optional)" value="${esc(f.failureReps)}" data-input="failureReps" />
                </div>`
              : ''
          }
        </fieldset>
        ${
          f.reps === 'failure'
            ? ''
            : `<fieldset>
          <legend>Reps left in the tank <span class="small muted">(RIR)</span></legend>
          <div class="chips four" id="rir-chips">${RIR_CHOICES.map(
            (n) => `<button type="button" class="chip" data-action="rir" data-value="${n}" aria-pressed="${f.rir === n}">${rirLabel(n)}</button>`,
          ).join('')}</div>
          <p class="hint">0 = could not do another · 1 = one more · 2 = two more · 3+ = easy.</p>
        </fieldset>`
        }
        <div class="card flush inset"><label class="check switch"><span><b>Warm-up set</b><span>Not counted in progress or muscle sets</span></span><input type="checkbox" data-action="toggleWarmup" ${f.warmup ? 'checked' : ''} /></label></div>
        <button type="button" class="btn primary" data-action="saveSet">${f.editingId ? `Update set ${f.setNo}` : `Save set ${f.setNo}`}</button>
        ${f.editingId ? '<button type="button" class="btn secondary" data-action="cancelEdit">Cancel edit</button>' : ''}
        ${
          today.length
            ? `<div><p class="sublabel">Logged today</p>${today
                .map(
                  (s) => `<div class="set-row setline">${setLine(s)}
                    ${ibtn('edit', `data-action="editSet" data-id="${s.id}"`, `Edit set ${s.setNo}`)}
                    ${ibtn('trash', `data-action="deleteSet" data-id="${s.id}"`, `Delete set ${s.setNo}`)}
                  </div>`,
                )
                .join('')}</div>`
            : ''
        }
      </div>
    </section>`;
}

/** Reps currently entered in the form: a chip, the Other box, or the Failure count (null when not known yet). */
function formReps(f) {
  if (typeof f.reps === 'number') return f.reps;
  const raw = f.reps === 'other' ? f.otherReps : f.reps === 'failure' ? f.failureReps : '';
  const n = Number(raw);
  return raw !== '' && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The line above Save set: this set against the same set number last time (weight and reps up or down),
 * plus a shortfall or stagnation warning for this set. Refreshed live as reps and weight change.
 */
function setCompareHtml() {
  const f = state.ui.form;
  if (!f || !f.exercise || f.warmup || !state.draft) return '';
  if (inDeload(state.draft.date)) return `<div class="set-compare"><div class="small iline">${icon('leaf')}<span>Lighter week: comparisons are paused. Go easy, with 3–4 reps in reserve.</span></div></div>`;
  const weight = f.weight === '' ? NaN : Number(f.weight);
  const sessions = statsHistory().filter((s) => s.id !== state.draft.id);
  const c = Progress.setComparison(sessions, f.exercise, f.setNo, { weight, reps: formReps(f) }, state.draft.date || todayISO(), state.settings.progression, (from, to) =>
    missedPause(f.exercise, from, to),
  );
  if (!c) return '';
  const delta = (n, unit) => (n > 0 ? `<span class="up">▲ +${esc(fmtKg(n))}${unit}</span>` : n < 0 ? `<span class="down">▼ −${esc(fmtKg(-n))}${unit}</span>` : '<span class="same">● same</span>');
  const parts = [];
  if (c.weightDelta !== null) parts.push(`weight ${delta(c.weightDelta, ' kg')}`);
  parts.push(c.repsDelta !== null ? `reps ${delta(c.repsDelta, '')}` : '<span class="muted">pick reps to compare</span>');
  const warn = [];
  if (c.shortfall) {
    const r = c.shortfall.ref;
    warn.push({
      cls: 'shortfall',
      html: `<strong class="lead">${icon('alert')}${c.shortfall.days} days below</strong> your ${esc(fmtKg(r.weight))} kg × ${r.reps} of ${esc(formatDate(r.date, false))} on this set${
        c.shortfall.paused ? ` (not counting ${c.shortfall.paused} days paused for missed workouts)` : ''
      }`,
    });
  }
  const plan = Progress.parsePlan(planText(state.draft.dayType, f.exercise));
  const capped = c.stagnant && plan && !plan.timed && c.stagnant.best.reps >= plan.max - state.settings.progression.topTolerance;
  if (capped) {
    // Already at the top of the rep range: no more reps are expected until the weight goes up, so not "stagnant".
    warn.push({ cls: 'info', html: `${icon('info')}This set is at the top of its range (${c.stagnant.best.reps} reps; the range tops out at ${plan.max}). It moves on when the weight goes up.` });
  } else if (c.stagnant) {
    const b = c.stagnant.best;
    warn.push({
      cls: 'stagnant',
      html: `<strong class="lead">${icon('alert')}Stagnant ${c.stagnant.days} days</strong> no new best on this set since ${esc(fmtKg(b.weight))} kg × ${b.reps} (${esc(formatDate(c.stagnant.since, false))})${
        c.stagnant.paused ? `, not counting ${c.stagnant.paused} days paused for missed workouts` : ''
      }`,
    });
  }
  const tone = warn.some((w) => w.cls === 'shortfall') ? 'shortfall' : warn.some((w) => w.cls === 'stagnant') ? 'stagnant' : '';
  return `<div class="set-compare ${tone}">
      <div class="small muted">vs Set ${f.setNo} last time · ${esc(formatDate(c.prev.date, false))} · ${esc(fmtKg(c.prev.weight))} kg × ${c.prev.reps}</div>
      <div class="deltas">${parts.join(' · ')}</div>
      ${warn.map((w) => `<div class="warn-line ${w.cls}">${w.html}</div>`).join('')}
    </div>`;
}

function refreshSetCompare() {
  const el = document.getElementById('set-compare');
  if (el) el.innerHTML = setCompareHtml();
}

/** Progression status for the exercise on the entry screen, from saved workouts only (what today should aim for). */
function entryStatus(exercise) {
  if (state.draft && inDeload(state.draft.date)) return '';
  const a = analyse(exercise);
  if (!a || a.status.kind === 'untracked') return '';
  const line = Progress.statusLine(a.status, todayISO());
  return line ? `<p class="status-line ${esc(a.status.kind)}">${esc(line)}</p>` : '';
}

function renderTimer() {
  const t = state.ui.timer;
  const remaining = (t.endsAt - Date.now()) / 1000;
  return `
    <div class="timer floating ${remaining <= 0 ? 'done' : ''}" id="timer" role="timer" aria-label="Rest timer">
      <div>
        <div class="small muted">Rest</div>
        <div class="time" id="timer-value">${remaining <= 0 ? 'Go' : fmtClock(remaining)}</div>
      </div>
      <div class="controls">
        <button type="button" class="btn small" data-action="timerMinus">−15s</button>
        <button type="button" class="btn small" data-action="timerPlus">+15s</button>
        <button type="button" class="btn small" data-action="timerSkip">Skip</button>
      </div>
    </div>`;
}

function summarise(session) {
  const groups = groupByExercise(session.sets);
  const rows = [...groups.entries()].map(([name, list]) => {
    const best = list.reduce(
      (b, s) => (!b || s.weightKg > b.weightKg || (s.weightKg === b.weightKg && (s.reps || 0) > (b.reps || 0)) ? s : b),
      null,
    );
    return { name, sets: list.length, best, volume: list.reduce((v, s) => v + setVolume(s), 0) };
  });
  const times = session.sets.map((s) => s.loggedAt).sort();
  const start = times[0] ? new Date(times[0]) : new Date(session.startedAt);
  const end = session.finishedAt ? new Date(session.finishedAt) : new Date();
  return { rows, totalSets: session.sets.length, totalVolume: sessionVolume(session), duration: end - start };
}

function renderSummary(session) {
  const s = summarise(session);
  return `
    ${tiles([[s.totalSets, 'Sets'], [fmtVolume(s.totalVolume), 'Volume'], [fmtDuration(s.duration), 'Duration']])}
    <div class="card flush summary-rows">${s.rows
      .map(
        (r) => `<div class="xrow"><div class="tx"><b>${esc(r.name)}</b><span>${r.sets} set${r.sets === 1 ? '' : 's'} · best ${esc(fmtKg(r.best.weightKg))} kg × ${
          r.best.toFailure && r.best.reps == null ? 'F' : esc(r.best.reps)
        }</span></div><span class="n">${esc(fmtVolume(r.volume))}</span></div>`,
      )
      .join('')}</div>`;
}

/** Heart rate, calories, score, the 1–5 answers and notes of a saved workout, as label / value rows. */
function wellbeingRows(session) {
  const rows = [];
  if (session.score) rows.push(['How it went', `${session.score}/10`]);
  if (session.avgHeartRate) rows.push(['Average heart rate', `${session.avgHeartRate} bpm`]);
  if (session.activeCalories) rows.push(['Active calories', `${session.activeCalories} kcal`]);
  for (const [q, v] of Object.entries(session.satisfaction || {})) if (v) rows.push([q, `${v}/5`]);
  if (!rows.length && !session.notes) return '';
  return `<div class="card kvs">${rows.map(([k, v]) => `<div class="kv"><div class="k">${esc(k)}</div><div class="v sm">${esc(v)}</div></div>`).join('')}${
    session.notes ? `<p class="note-text">${esc(session.notes)}</p>` : ''
  }</div>`;
}

const TREND = {
  up: { icon: '▲', label: 'Improved', cls: 'up' },
  flat: { icon: '●', label: 'Maintained', cls: 'flat' },
  down: { icon: '▼', label: 'Dropped', cls: 'down' },
  first: { icon: '○', label: 'Baseline', cls: 'first' },
};

/** "How did this workout compare": per exercise trend, numbers in words, progression status and warnings. */
function renderInsight(session) {
  if (inDeload(session.date)) {
    return `<div class="insight stack">
      <p class="small iline" style="margin:0">${icon('leaf')}<span>Lighter-week workout: not compared and not counted in progress, so it cannot set off warnings.</span></p></div>`;
  }
  const ctx = progressCtx();
  ctx.today = session.date || todayISO();
  const others = statsHistory().filter((s) => s.id !== session.id);
  const ins = Progress.workoutInsight(session, others, ctx);
  if (!ins.rows.length) return '';
  const p = state.settings.progression;
  const c = ins.counts;
  const headline = [];
  if (c.up) headline.push(`${c.up} improved`);
  if (c.flat) headline.push(`${c.flat} maintained`);
  if (c.down) headline.push(`${c.down} dropped`);
  if (c.first) headline.push(`${c.first} new`);
  const totals = [];
  if (ins.strengthPct !== null) totals.push(`${Progress.signed(ins.strengthPct)} average change per exercise`);
  if (ins.volumePct !== null) totals.push(`volume ${Progress.signed(ins.volumePct)} on the same exercises`);
  // Recovery check including this workout, so a drop it causes shows up straight away.
  const saved = state.history;
  if (!saved.some((s) => s.id === session.id)) state.history = [...saved, session];
  const rs = recoveryState();
  state.history = saved;
  return `
    <div class="insight stack">
      <p class="insight-head">${esc(headline.join(' · '))}${totals.length ? `<br /><span class="small muted">vs last time: ${esc(totals.join(', '))}</span>` : ''}</p>
      ${
        rs.due
          ? `<div class="alert notice warn recovery-due"><div class="nhead">${appIcon('alert', 'orange')}<div class="tx"><b class="alert-title">Time for a lighter week</b><span>Start it from Today.</span></div></div>
              <ul class="reasons">${rs.reasons.map((x) => `<li><strong class="lead">${esc(x.lead)}</strong> ${esc(x.text)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${ins.rows
        .map((a) => {
          const t = TREND[a.trend];
          const status = a.status.kind === 'untracked' ? '' : Progress.statusLine(a.status, ctx.today);
          const flags = a.flags
            .map((f) =>
              f.kind === 'stall'
                ? `Stalled: ${f.sessions} sessions at ${fmtKg(a.last.weight)} kg without more reps. Try a longer rest, one extra rep on one set, or a variation.`
                : `Dropping: est. strength ${Progress.signed(f.pct)} over the last ${f.sessions} sessions. Check sleep, food and recovery.`,
            )
            .map((x) => `<p class="flag">${icon('alert')}<span>${esc(x)}</span></p>`)
            .join('');
          return `
          <div class="insight-row">
            <div class="row between"><strong>${esc(a.exercise)}</strong>${tag(`${t.icon} ${t.label}`, { up: 'ok', down: 'bad', flat: '', first: 'accent' }[a.trend])}</div>
            <p class="small" style="margin:4px 0 0">${esc(Progress.exerciseSentence(a, p))}</p>
            ${status ? `<p class="status-line ${esc(a.status.kind)}">${esc(status)}</p>` : ''}
            ${flags}
          </div>`;
        })
        .join('')}
    </div>`;
}

function renderReview() {
  const sub = state.ui.submit;
  const session = state.draft || sub.session;
  const busy = sub.status === 'sending';
  const done = sub.status === 'ok' || sub.status === 'offline' || sub.status === 'rejected';
  const statusText = {
    sending: 'Sending to your Sheet…',
    ok: `✓ ${sub.message}`,
    offline: sub.message,
    rejected: sub.message,
  }[sub.status];
  const finished = session.finishedAt ? new Date(session.finishedAt) : null;
  const missing = done || busy ? [] : reviewMissing(session);
  const insight = renderInsight(session);
  return `
    <h1 class="large">${done ? 'Workout saved' : 'Workout finished'}</h1>
    <p class="sub">${esc(session.dayType)} · ${esc(formatDate(session.date))}${
      finished ? ` · clock stopped at ${esc(`${String(finished.getHours()).padStart(2, '0')}:${String(finished.getMinutes()).padStart(2, '0')}`)}` : ''
    }</p>
    ${group('Summary', '', renderSummary(session))}
    ${insight ? group('Progress insight', '', `<section class="card">${insight}</section>`) : ''}
    ${group('How was it?', missing.length ? `<span class="note">${missing.length} still needed</span>` : '', `
    <section class="card stack">
      ${renderWellbeing(session, busy || done)}
      <div>
        <label for="notes">Notes (optional)</label>
        <textarea id="notes" class="textarea" placeholder="How did it go?" data-input="notes" ${busy || done ? 'disabled' : ''}>${esc(session.notes || '')}</textarea>
      </div>
      ${statusText ? `<div class="status ${esc(sub.status)}" role="status">${esc(statusText)}</div>` : ''}
      ${missing.length ? `<p class="hint" style="margin:0">Still needed before it is sent: ${esc(missing.join(', '))}.</p>` : ''}
      ${
        done
          ? '<button type="button" class="btn primary" data-action="submitDone">Done</button>'
          : `<button type="button" class="btn primary" data-action="submitWorkout" ${busy ? 'disabled' : ''}>${busy ? 'Sending…' : 'Submit workout'}</button>
             <button type="button" class="btn secondary" data-action="reopenWorkout" ${busy ? 'disabled' : ''}>Reopen workout to log more sets</button>`
      }
    </section>`)}`;
}

/** What the review still needs (v1.7: how it went, heart rate and calories are required; the watch can be
    marked as not recorded instead of typing made-up numbers). */
function reviewMissing(session) {
  const out = [];
  if (!(session.score >= 1 && session.score <= 10)) out.push('how the workout was (1–10)');
  if (!session.noWatch) {
    if (!(session.avgHeartRate >= 40 && session.avgHeartRate <= 220)) out.push('average heart rate (40–220 bpm)');
    if (!(session.activeCalories >= 1 && session.activeCalories <= 3000)) out.push('active calories (1–3000 kcal)');
  }
  return out;
}

/** Heart rate, calories, the satisfaction matrix (1–5 per question) and the overall score out of 10. */
function renderWellbeing(session, locked) {
  const sat = session.satisfaction || {};
  const scale = (name, value, max, action) =>
    `<div class="chips ${max === 10 ? 'ten' : 'five'}" role="group" aria-label="${esc(name)}">${Array.from({ length: max }, (_, i) => i + 1)
      .map(
        (n) =>
          `<button type="button" class="chip" data-action="${action}" data-q="${esc(name)}" data-value="${n}" aria-pressed="${value === n}" ${locked ? 'disabled' : ''}>${n}</button>`,
      )
      .join('')}</div>`;
  const watchOff = Boolean(session.noWatch);
  return `
    <div class="stack">
      <div class="matrix-row">
        <div class="q"><strong>How was the workout?</strong> <span class="req">required</span> <span class="small muted">1 = awful · 10 = best ever</span></div>
        ${scale('score', session.score, 10, 'score')}
      </div>
      <div class="two">
        <div>
          <label for="avg-hr">Avg heart rate (bpm) ${watchOff ? '' : '<span class="req">required</span>'}</label>
          <input id="avg-hr" class="input" type="number" inputmode="numeric" min="40" max="220" placeholder="${watchOff ? 'not recorded' : 'e.g. 128'}" value="${esc(session.avgHeartRate ?? '')}" data-change="avgHeartRate" ${locked || watchOff ? 'disabled' : ''} />
        </div>
        <div>
          <label for="active-kcal">Active calories (kcal) ${watchOff ? '' : '<span class="req">required</span>'}</label>
          <input id="active-kcal" class="input" type="number" inputmode="numeric" min="1" max="3000" placeholder="${watchOff ? 'not recorded' : 'e.g. 320'}" value="${esc(session.activeCalories ?? '')}" data-change="activeCalories" ${locked || watchOff ? 'disabled' : ''} />
        </div>
      </div>
      <div class="card flush inset"><label class="check switch">
        <span><b>The watch did not record it</b><span>Heart rate and calories are then not needed</span></span>
        <input type="checkbox" data-action="noWatch" ${watchOff ? 'checked' : ''} ${locked ? 'disabled' : ''} />
      </label></div>
      ${questions()
        .map(
          (q) => `
        <div class="matrix-row">
          <div class="q">${esc(q)} <span class="small muted">1 = poor · 5 = great</span></div>
          ${scale(q, sat[q], 5, 'rate')}
        </div>`,
        )
        .join('')}
    </div>`;
}

function renderHistory() {
  // Workouts and missed days in one list, newest first.
  const rows = [...sortedHistory().map((s) => ({ date: s.date, s })), ...state.missed.map((m) => ({ date: m.date, m }))].sort((a, b) =>
    (b.date || '').localeCompare(a.date || ''),
  );
  const day = (iso) => `${WEEKDAYS[new Date(Date.parse(iso)).getUTCDay()]?.slice(0, 3) || ''} ${formatDate(iso, false)}`;
  const row = ({ s, m }) =>
    m
      ? `<button type="button" class="lrow missed" data-action="missedReason" data-id="${esc(m.id)}" data-edit="1">${appIcon('cross', m.reason ? 'grey' : 'red')}
          <span class="tx"><b>${esc(m.dayType)} · missed</b><span>${esc(day(m.date))} · ${m.reason ? esc(m.reason) : 'tap to add the reason'}${m.note ? ` · ${esc(m.note)}` : ''}</span></span>
          ${m.reason ? '' : tag('No reason', 'bad')}</button>`
      : `<button type="button" class="lrow" data-action="openSession" data-id="${esc(s.id)}">${appIcon('dumbbell', 'saffron')}
          <span class="tx"><b>${esc(s.dayType)}</b><span>${esc(
            [day(s.date), `${s.sets.length} set${s.sets.length === 1 ? '' : 's'}`, fmtVolume(sessionVolume(s)), s.score ? `${s.score}/10` : ''].filter(Boolean).join(' · '),
          )}</span></span>
          ${s.synced ? '' : tag('Not synced', 'warn')}${CHEV}</button>`;
  // One group per month, newest first.
  const months = [];
  for (const r of rows) {
    const key = (r.date || '').slice(0, 7);
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, rows: [] });
    months[months.length - 1].rows.push(r);
  }
  const monthName = (key) => (/^\d{4}-\d{2}$/.test(key) ? `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}` : 'No date');
  const waiting = state.history.filter((s) => !s.synced).length;
  const open = state.missed.filter((m) => !m.reason).length;
  return `
    ${topbar('History', { href: 'more', label: 'More' })}
    <p class="sub">${esc(
      [`${state.history.length} workout${state.history.length === 1 ? '' : 's'}`, state.missed.length ? `${state.missed.length} missed` : '', waiting ? `${waiting} not synced` : '', open ? `${open} without a reason` : '']
        .filter(Boolean)
        .join(' · '),
    )}</p>
    ${
      rows.length
        ? months
            .map((g) => {
              const n = g.rows.filter((r) => r.s).length;
              return group(monthName(g.key), `<span class="note">${n} workout${n === 1 ? '' : 's'}</span>`, `<div class="card flush">${g.rows.map(row).join('')}</div>`);
            })
            .join('')
        : group('Workouts', '', '<div class="card"><p class="empty">No workouts yet.</p></div>')
    }
    <p class="hint gnote syncline">${icon('sync')}<span>${
      state.ui.syncing ? 'Fetching from the Sheet…' : esc(state.ui.historySync || `Pulled from the Sheet automatically (last ${pulledAgo('history')})`)
    }</span><button type="button" class="btn link small" data-action="syncHistory" ${state.ui.syncing ? 'disabled' : ''}>Sync now</button></p>`;
}

function renderHistoryDetail(id) {
  const s = state.history.find((x) => x.id === id);
  if (!s) return `${topbar('History', { href: 'history', label: 'History' })}<p class="empty">This workout is not on this phone.</p>`;
  const groups = groupByExercise(s.sets);
  const how = wellbeingRows(s);
  return `
    ${topbar(s.dayType, { href: 'history', label: 'History' })}
    <p class="sub">${esc(WEEKDAYS[new Date(Date.parse(s.date)).getUTCDay()] || '')}, ${esc(formatDate(s.date))} · ${s.synced ? tag('✓ In the Sheet', 'ok') : tag('Not synced yet', 'warn')}</p>
    ${group('Summary', '', renderSummary(s))}
    ${how ? group('How it went', '', how) : ''}
    ${group('Progress insight', '', `<section class="card">${renderInsight(s) || '<p class="empty" style="padding:8px">No working sets to compare.</p>'}</section>`)}
    ${group(
      'Sets',
      `<span class="note">${s.sets.length}</span>`,
      `<div class="card flush">${[...groups.entries()]
        .map(([name, list]) => `<div class="xblock"><b>${esc(name)}</b>${list.map((x) => `<div class="setline">${setLine(x)}</div>`).join('')}</div>`)
        .join('')}</div>`,
    )}`;
}

function renderSettings() {
  const s = state.settings;
  const ui = state.ui;
  const day = manageDays().includes(ui.manageDay) ? ui.manageDay : manageDays()[0];
  const list = state.exercises[day] || [];
  return `
    <section class="secpage" data-sec="sheet">
      <p class="sub">Workouts, measurements and settings go to your Google Sheet through its Apps Script web app.</p>
      ${group(
        'Connection',
        haveApi() ? tag('Set up', 'ok') : tag('Not set up', 'warn'),
        `<section class="card stack">
        <div>
          <label for="script-url">Apps Script web app URL</label>
          <input id="script-url" class="input" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.scriptUrl)}" data-change="scriptUrl" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div>
          <label for="token">Secret token</label>
          <div class="input-row">
            <input id="token" class="input" type="${ui.showToken ? 'text' : 'password'}" value="${esc(s.token)}" data-change="token" autocomplete="off" autocapitalize="off" spellcheck="false" />
            <button type="button" class="btn" data-action="toggleToken" aria-pressed="${ui.showToken}">${ui.showToken ? 'Hide' : 'Show'}</button>
          </div>
        </div>
        <button type="button" class="btn secondary" data-action="ping" ${ui.syncing ? 'disabled' : ''}>Test connection</button>
        ${ui.ping ? `<div class="status ${ui.ping.ok === null ? '' : ui.ping.ok ? 'ok' : 'rejected'}" role="status">${esc(ui.ping.message)}</div>` : ''}
      </section>`,
      )}
    </section>

    <section class="secpage" data-sec="logging">
      <p class="sub">What the logging panel offers and how long you rest.</p>
      ${group(
        'Rest timer',
        '',
        `<div class="card flush">${frow(
          'rest-seconds',
          'Default rest',
          'Seconds, after each saved set',
          `<input id="rest-seconds" class="input fnum" type="number" inputmode="numeric" min="10" max="900" step="5" value="${esc(s.restSeconds)}" data-change="restSeconds" />`,
        )}</div>`,
      )}
      ${group(
        'Reps buttons',
        `<span class="note">${repsChips().filter((c) => typeof c === 'number').length}</span>`,
        `<section class="card stack">
        <div class="pills" id="reps-pills">${repsChips()
          .filter((c) => typeof c === 'number')
          .map((n) => `<span class="pill">${n}<button type="button" class="pill-x" data-action="removeRep" data-value="${n}" aria-label="Remove the ${n} reps button">×</button></span>`)
          .join('')}</div>
        <div class="input-row">
          <label for="rep-new" class="sr-only">New reps button</label>
          <input id="rep-new" class="input" type="number" inputmode="numeric" min="1" max="999" placeholder="Add a reps button, e.g. 11" value="${esc(ui.newRep)}" data-input="newRep" />
          <button type="button" class="btn" data-action="addRep">Add</button>
        </div>
        <p class="hint" style="margin:0">Shown in number order. "Other" (any number) and "Failure" always follow them.</p>
      </section>`,
      )}
      ${group(
        'Reps in reserve',
        '',
        `<div class="card flush"><label class="check switch">
          <span><b>Ask on every working set</b><span>0, 1, 2 or 3+ reps left; progression uses it</span></span>
          <input type="checkbox" data-change="requireRir" ${s.requireRir ? 'checked' : ''} />
        </label></div>`,
      )}
    </section>

    ${renderScheduleSettings()}
    ${renderProgressionSettings()}
    ${renderRecoverySettings()}
    ${renderBodySettings()}
    ${renderCalorieSettings()}
    ${renderRecoveryScoreSettings()}

    <section class="secpage" data-sec="questions">
      <p class="sub">Optional, each rated 1–5 after a workout. "How was the workout" (1–10), heart rate and calories are always asked.</p>
      ${group(
        'Questions',
        `<span class="note">${questions().length}</span>`,
        `<div class="card flush">
        ${
          questions().length
            ? `<div id="question-list">${questions()
                .map((q, i) =>
                  erow(
                    q,
                    '',
                    ibtn('up', `data-action="moveQuestion" data-index="${i}" data-dir="-1"`, `Move ${q} up`, i === 0) +
                      ibtn('down', `data-action="moveQuestion" data-index="${i}" data-dir="1"`, `Move ${q} down`, i === questions().length - 1) +
                      ibtn('edit', `data-action="renameQuestion" data-index="${i}"`, `Rename ${q}`) +
                      ibtn('trash', `data-action="removeQuestion" data-index="${i}"`, `Remove ${q}`),
                  ),
                )
                .join('')}</div>`
            : '<p class="empty pad">No questions. The score out of 10 still shows.</p>'
        }
        <div class="addrow input-row">
          <label for="question-new" class="sr-only">New question</label>
          <input id="question-new" class="input" placeholder="New question, e.g. Sleep" value="${esc(ui.newQuestion)}" data-input="newQuestion" autocomplete="off" />
          <button type="button" class="btn" data-action="addQuestion">Add</button>
        </div>
      </div>`,
      )}
    </section>

    <section class="secpage" data-sec="exercises">
      <p class="sub">Each day's exercises in order, with the plan shown while you log.</p>
      ${group(
        'Day',
        '',
        `<div class="card flush">${frow(
          'manage-day',
          'Editing',
          '',
          `<select id="manage-day" class="select fsel" data-change="manageDay">
          ${manageDays()
            .map((d) => `<option value="${esc(d)}" ${d === day ? 'selected' : ''}>${esc(d)}</option>`)
            .join('')}
        </select>`,
        )}</div>`,
      )}
      ${group(
        `${day} exercises`,
        `<span class="note">${list.length}</span>`,
        `<div class="card flush">
        ${
          list.length
            ? `<div id="exercise-list">${list
                .map((name, i) =>
                  erow(
                    name,
                    [
                      state.targets[day]?.[name] ? `Plan ${state.targets[day][name]}` : '',
                      muscleOf(name),
                      state.settings.steps?.[name] ? `step ${fmtKg(state.settings.steps[name])} kg` : '',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    ibtn('up', `data-action="moveExercise" data-index="${i}" data-dir="-1"`, `Move ${name} up`, i === 0) +
                      ibtn('down', `data-action="moveExercise" data-index="${i}" data-dir="1"`, `Move ${name} down`, i === list.length - 1) +
                      ibtn('edit', `data-action="renameExercise" data-index="${i}"`, `Rename ${name}`) +
                      ibtn('trash', `data-action="removeExercise" data-index="${i}"`, `Remove ${name}`),
                  ),
                )
                .join('')}</div>`
            : '<p class="empty pad">No exercises for this day yet.</p>'
        }
        <div class="addrow input-row">
          <label for="manage-new" class="sr-only">New exercise</label>
          <input id="manage-new" class="input" placeholder="New exercise" value="${esc(ui.manageNew)}" data-input="manageNew" autocomplete="off" />
          <button type="button" class="btn" data-action="manageAdd">Add</button>
        </div>
      </div>`,
      )}
      ${group(
        'After lifting',
        '',
        `<section class="card stack">
        <label for="cardio-note" class="sr-only">After lifting (cardio or finisher)</label>
        <input id="cardio-note" class="input" placeholder="e.g. Incline walk, 15 min" value="${esc(state.cardio[day] || '')}" data-change="cardioNote" autocomplete="off" />
        <p class="hint" style="margin:0">Cardio or a finisher, shown at the end of the ${esc(day)} workout.</p>
      </section>`,
      )}
    </section>

    ${renderSettingsCopy()}

    <section class="secpage" data-sec="backup">
      <p class="sub">A file with everything except photos, for moving to a new phone.</p>
      ${group(
        'Export and import',
        '',
        `<section class="card stack">
        <button type="button" class="btn secondary" data-action="exportData">Export local data (JSON)</button>
        <button type="button" class="btn secondary" data-action="importData">Import from JSON…</button>
        <input id="import-file" type="file" accept="application/json,.json" class="sr-only" data-change="importFile" />
        <p class="hint" style="margin:0">The export includes workouts, measurements, settings, your script URL and token so a new phone can be set up from it. Keep the file private. Photos are not in it: they have their own encrypted backup on the Photos screen.</p>
      </section>`,
      )}
      <p class="version">Bhimlekha v${esc(APP_VERSION)} · भीमलेखा</p>
    </section>`;
}

/** Weekly schedule (drives "today's workout" and missed days) and the reasons offered for a missed day. */
function renderScheduleSettings() {
  const sched = state.settings.schedule || DEFAULT_SCHEDULE;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const options = [...new Set([...manageDays().filter((d) => d !== 'Custom'), ...Object.values(sched).filter(Boolean)])];
  return `
    <section class="secpage" data-sec="schedule">
      <p class="sub">Today suggests the day's workout. A scheduled day that passes with no workout is marked missed (you don't make it up; the next day's workout follows), asks for a reason, and goes to the Sheet's Missed tab.</p>
      ${group(
        'Week',
        `<span class="note">${days.filter((d) => sched[d]).length} training days</span>`,
        `<div class="card flush">${days
          .map((d) =>
            frow(
              `sched-${d}`,
              WEEKDAYS[d],
              '',
              `<select id="sched-${d}" class="select fsel" data-change="scheduleDay" data-dow="${d}">
                <option value="" ${!sched[d] ? 'selected' : ''}>Rest</option>
                ${options.map((o) => `<option value="${esc(o)}" ${sched[d] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
              </select>`,
            ),
          )
          .join('')}</div>
        <p class="hint gnote">Missed days are counted from ${esc(formatDate(state.settings.scheduleFrom || todayISO()))}. Each one pauses its exercises' clocks and pushes the lighter week back (see Progression).</p>`,
      )}
      ${group(
        'Reasons for a missed day',
        '',
        `<section class="card stack">
        <div class="pills">${missReasons()
          .map((r, i) => `<span class="pill">${esc(r)}<button type="button" class="pill-x" data-action="removeReason" data-index="${i}" aria-label="Remove ${esc(r)}">×</button></span>`)
          .join('')}</div>
        <div class="input-row">
          <label for="reason-new" class="sr-only">New reason</label>
          <input id="reason-new" class="input" placeholder="e.g. Exams" value="${esc(state.ui.newReason)}" data-input="newReason" autocomplete="off" />
          <button type="button" class="btn" data-action="addReason">Add</button>
        </div>
        <p class="hint" style="margin:0">"Other" asks for your own words. Changing the list never changes reasons already given.</p>
      </section>`,
      )}
    </section>`;
}

/** One line on where the settings copy stands. */
function settingsCopyStatus() {
  const b = state.backup;
  let status;
  if (!haveApi()) status = 'Add the script URL and token above to keep a copy of these settings in the Sheet.';
  else if (!b.linked && b.remoteAt) status = `<strong>The Sheet has settings saved ${esc(formatDate(String(b.remoteAt).slice(0, 10)))}.</strong> Use them, or make this phone's settings the copy.`;
  else if (b.error && b.error !== 'offline') status = `⚠️ The Sheet said: ${esc(b.error)}${/unknown action/.test(b.error) ? '. Paste the new Code.gs and deploy a new version.' : ''}`;
  else if (b.dirty) status = b.error === 'offline' ? 'Changes waiting: will save when online.' : 'Saving…';
  else status = b.sentAt ? `✓ Saved in the Sheet ${esc(formatDate(b.sentAt.slice(0, 10)))}, ${esc(new Date(b.sentAt).toTimeString().slice(0, 5))}.` : 'Not saved yet.';
  return status;
}

/** Status of the settings copy in the Sheet's Settings tab, with save and restore. */
function renderSettingsCopy() {
  const b = state.backup;
  const status = settingsCopyStatus();
  return `
    <section class="secpage" data-sec="copy">
      <p class="sub">Exercises, plans, schedule, buttons, questions, progression, recovery and lighter weeks are saved to the Sheet's Settings tab after every change, so a new phone gets them back. The Sheet URL and token are not in it; photos never are.</p>
      ${group(
        'Status',
        b.linked && !b.dirty && b.sentAt ? tag('Saved', 'ok') : b.dirty ? tag('Waiting', 'warn') : '',
        `<section class="card stack">
        <p class="small" style="margin:0" id="backup-status">${status}</p>
        ${
          !b.linked && b.remoteAt
            ? `<button type="button" class="btn primary" data-action="restoreSettings">Use the Sheet's settings</button>
               <button type="button" class="btn secondary" data-action="keepPhoneSettings">Keep this phone's settings</button>`
            : `<button type="button" class="btn secondary" data-action="backupSettingsNow" ${haveApi() ? '' : 'disabled'}>Save to Sheet now</button>
               <button type="button" class="btn secondary" data-action="restoreSettings" ${haveApi() ? '' : 'disabled'}>Restore from the Sheet…</button>`
        }
      </section>`,
      )}
    </section>`;
}

// Every progression assumption, editable. [key, label, hint, step]
const PROGRESSION_FIELDS = [
  ['readyRir', 'Reps in reserve needed on every set', 'A set counts as "easy" with at least this many reps left.', 1],
  ['topTolerance', 'Reps below the top still counted', '1 means 11 of 12 counts as reaching the top.', 1],
  ['readySessions', 'Sessions in a row at the target', 'How many times the target must be hit before adding weight.', 1],
  ['readyMinDays', 'Week timer (days)', 'The first and last of those sessions must be at least this far apart.', 1],
  ['stepUpper', 'Weight step, upper body (kg)', 'An exercise’s own step (Exercises & plans) overrides it.', 0.5],
  ['stepLower', 'Weight step, lower body (kg)', 'Legs, glutes, calves, lower back.', 0.5],
  ['maintainBand', 'Maintained band (± %)', 'Changes in estimated max smaller than this count as maintained.', 0.5],
  ['avgWindow', 'Sessions in the rolling average', 'Each workout is also compared with this many earlier sessions.', 1],
  ['stallSessions', 'Stall warning after (sessions)', 'Same weight and no extra reps for this many sessions.', 1],
  ['dropSessions', 'Drop warning after (sessions)', 'Estimated max falling this many sessions in a row.', 1],
  ['watchDays', 'Watch period after adding weight (days)', 'Checks that reps stay inside the range at the new weight.', 1],
  ['shortfallDays', 'Shortfall warning after (days)', 'A set below its earlier level for this long gets ⚠️ above Save set.', 1],
  ['stagnantDays', 'Stagnant warning after (days)', 'A set with no new best for longer than this is called stagnant.', 1],
  ['muscleSetsMin', 'Weekly hard sets per muscle, low end', '', 1],
  ['muscleSetsMax', 'Weekly hard sets per muscle, high end', '', 1],
  ['missedPauseDays', 'Clock pause per missed workout (days)', 'Shortfall, stagnant and new-weight clocks of that day’s exercises skip this many days.', 1],
  ['missedSchedDays', 'Lighter week pushed back per missed workout (days)', '0 keeps the lighter-week schedule fixed.', 1],
  ['neglectDays', 'Flag a muscle not trained for over (days)', 'Shown on Home. 0 turns it off.', 1],
];

// The progression fields in groups on their settings page.
const PROGRESSION_GROUPS = [
  ['Adding weight', ['readyRir', 'topTolerance', 'readySessions', 'readyMinDays', 'stepUpper', 'stepLower', 'watchDays']],
  ['Comparing workouts', ['maintainBand', 'avgWindow']],
  ['Warnings', ['shortfallDays', 'stagnantDays', 'stallSessions', 'dropSessions', 'neglectDays']],
  ['Weekly hard sets per muscle', ['muscleSetsMin', 'muscleSetsMax']],
  ['Missed workouts', ['missedPauseDays', 'missedSchedDays']],
];

function renderProgressionSettings() {
  const p = state.settings.progression;
  const byKey = Object.fromEntries(PROGRESSION_FIELDS.map((f) => [f[0], f]));
  const field = ([key, label, hint, step]) =>
    frow(`prog-${key}`, label, hint, `<input id="prog-${key}" class="input fnum" type="number" inputmode="decimal" min="0" step="${step}" value="${esc(p[key])}" data-change="progression" data-key="${key}" />`);
  return `
    <section class="secpage" data-sec="progression">
      <p class="sub">Double progression: keep the weight until every set reaches the top of the plan's rep range with reps in reserve, in enough sessions spread over the week timer, then add a step. Rep ranges come from each exercise's plan (Exercises &amp; plans).</p>
      ${PROGRESSION_GROUPS.map(([title, keys]) => group(title, '', `<div class="card flush">${keys.map((k) => field(byKey[k])).join('')}</div>`)).join('')}
      <div class="sgroup"><button type="button" class="btn secondary" data-action="resetProgression">Restore the defaults</button></div>
    </section>`;
}

// Recovery triggers: [switch key, title, [[number key, label, step], …]]
const RECOVERY_TRIGGERS = [
  ['schedOn', 'A · On a schedule', [['schedWeeks', 'Every (weeks)', 1]]],
  ['strengthOn', 'B · Overall strength falling', [['strengthWeeks', 'Weeks in a row', 1], ['strengthPct', 'Down more than (%)', 0.5]]],
  ['dropOn', 'C · Several exercises dropping', [['dropCount', 'At least (exercises)', 1]]],
  ['feelOn', 'D · Feeling run down', [['feelMax', 'Energy & Strength ≤ (of 5)', 0.5], ['feelWorkouts', 'Over the last (workouts)', 1]]],
];

function renderRecoverySettings() {
  const r = state.settings.recovery;
  const num = (key, label, step) =>
    frow(`rec-${key}`, label, '', `<input id="rec-${key}" class="input fnum" type="number" inputmode="decimal" min="0" step="${step}" value="${esc(r[key])}" data-change="recoveryNum" data-key="${key}" />`);
  return `
    <section class="secpage" data-sec="recovery">
      <p class="sub">The lighter-week alert fires when any switched-on trigger is met. Workouts during a lighter week are left out of progress, so they never set off warnings.</p>
      ${RECOVERY_TRIGGERS.map(([on, title, fields]) =>
        group(
          title,
          '',
          `<div class="card flush ${r[on] ? '' : 'off'}">
            <label class="check switch"><span><b>${r[on] ? 'On' : 'Off'}</b></span><input type="checkbox" data-change="recoveryToggle" data-key="${on}" ${r[on] ? 'checked' : ''} aria-label="${esc(title)}" /></label>
            ${fields.map(([k, l, s]) => num(k, l, s)).join('')}
          </div>`,
        ),
      ).join('')}
      ${group('Lighter week', '', `<div class="card flush">${num('lengthDays', 'Length (days)', 1)}${num('snoozeDays', '"Not now" hides it for (days)', 1)}</div>`)}
      <div class="sgroup"><button type="button" class="btn secondary" data-action="resetRecovery">Restore the defaults</button></div>
    </section>`;
}

function renderBodySettings() {
  const s = state.settings;
  const ui = state.ui;
  const listEditor = (items, removeAction, moveAction) =>
    items
      .map((f, i) =>
        erow(
          f,
          '',
          ibtn('up', `data-action="${moveAction}" data-index="${i}" data-dir="-1"`, `Move ${f} up`, i === 0) +
            ibtn('down', `data-action="${moveAction}" data-index="${i}" data-dir="1"`, `Move ${f} down`, i === items.length - 1) +
            ibtn('trash', `data-action="${removeAction}" data-index="${i}"`, `Remove ${f}`),
        ),
      )
      .join('');
  return `
    <section class="secpage" data-sec="body">
      <p class="sub">The weekly check-in, its measurements and the progress photo poses.</p>
      ${group(
        'Weekly check-in',
        '',
        `<div class="card flush">
        ${frow(
          'checkin-day',
          'Check-in day',
          'Photo folders run to this day: Sunday makes each week Monday to Sunday',
          `<select id="checkin-day" class="select fsel" data-change="checkinDay">
          ${WEEKDAYS.map((d, i) => `<option value="${i}" ${Number(s.checkinDay) === i ? 'selected' : ''}>${d}</option>`).join('')}
        </select>`,
        )}
        ${frow(
          'program-start',
          'Week 1 starts',
          `${s.programStart ? 'Clear it to count from your first logged workout.' : `Blank: your first logged workout${programStart() ? ` (${formatDate(programStart())})` : ''}.`} Names the Files folders, e.g. "${photoWeek(todayISO()).folder}".`,
          `<input id="program-start" class="input fdate" type="date" value="${esc(s.programStart || '')}" data-change="programStart" />`,
        )}
      </div>`,
      )}
      ${group(
        'Measurements',
        `<span class="note">${measureFields().length}</span>`,
        `<div class="card flush">
        ${listEditor(measureFields(), 'removeField', 'moveField')}
        <div class="addrow input-row">
          <label for="field-new" class="sr-only">New measurement</label>
          <input id="field-new" class="input" placeholder="e.g. Calf (cm)" value="${esc(ui.newField)}" data-input="newField" autocomplete="off" />
          <button type="button" class="btn" data-action="addField">Add</button>
        </div>
      </div>
      <p class="hint gnote">Put the unit in brackets. A field with "weight" in its name is the bodyweight. Each one becomes a column in the Sheet's Measurements tab.</p>`,
      )}
      ${group(
        'Photo poses',
        `<span class="note">${poses().length}</span>`,
        `<div class="card flush">
        ${listEditor(poses(), 'removePose', 'movePose')}
        <div class="addrow input-row">
          <label for="pose-new" class="sr-only">New pose</label>
          <input id="pose-new" class="input" placeholder="e.g. Front flexed" value="${esc(ui.newPose)}" data-input="newPose" autocomplete="off" />
          <button type="button" class="btn" data-action="addPose">Add</button>
        </div>
      </div>`,
      )}
      ${group(
        'Camera & vault',
        '',
        `<div class="card flush">
        ${frow('cam-timer', 'Camera timer', 'Seconds, 0 = off', `<input id="cam-timer" class="input fnum" type="number" inputmode="numeric" min="0" max="30" value="${esc(s.cameraTimer)}" data-change="cameraTimer" />`)}
        ${frow('auto-lock', 'Vault auto-lock', 'Minutes without a tap', `<input id="auto-lock" class="input fnum" type="number" inputmode="numeric" min="1" max="60" value="${esc(s.autoLockMinutes)}" data-change="autoLockMinutes" />`)}
      </div>`,
      )}
    </section>`;
}

const CALORIE_FIELDS = [
  ['ratePct', 'Rate (% of bodyweight a week)', 0.1, 0, 1.5, 'Loss or gain per week. 0.5–1% keeps strength while losing.'],
  ['lifeFactor', 'Daily-life factor', 0.05, 1.1, 1.6, 'Resting burn × this = a day without workouts. 1.2 mostly sitting, 1.375 on your feet a lot.'],
  ['watchDiscountPct', 'Watch calories discount (%)', 5, 0, 60, 'Logged active calories are cut by this much: watches read high.'],
  ['workoutDays', 'Average workouts over (days)', 1, 7, 42, ''],
  ['bfMaxAgeDays', 'Use body fat up to (days old)', 1, 7, 60, 'Older than this: Mifflin-St Jeor (age, height, weight) instead of Katch-McArdle.'],
  ['changeKcal', 'Move the target when it differs by (kcal)', 10, 0, 500, 'Checked once a week, so daily wobbles never change MyFitnessPal.'],
  ['recalcKg', 'Or at once after a weight change of (kg)', 0.5, 1, 20, 'A new body fat reading also moves it at once.'],
];

function renderCalorieSettings() {
  const p = state.settings.profile || {};
  const c = state.settings.calories;
  return `
    <section class="secpage" data-sec="calories">
      <p class="sub">Body fat: US Navy tape method from the check-in (men: neck and abdomen at the navel; women: neck, waist and hips). Calories: Katch-McArdle with a recent body fat reading, else Mifflin-St Jeor.</p>
      ${group(
        'About you',
        '',
        `<div class="card flush">
        ${frow(
          'pf-sex',
          'Sex',
          'For the formulas',
          `<select id="pf-sex" class="select fsel" data-change="profileSex">
            <option value="male" ${p.sex !== 'female' ? 'selected' : ''}>Male</option>
            <option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option>
          </select>`,
        )}
        ${frow('pf-height', 'Height', 'cm', `<input id="pf-height" class="input fnum" type="number" inputmode="decimal" step="0.5" min="120" max="230" value="${esc(p.heightCm ?? '')}" data-change="profileHeight" />`)}
        ${frow('pf-dob', 'Date of birth', '', `<input id="pf-dob" class="input fdate" type="date" value="${esc(p.dob || '')}" data-change="profileDob" />`)}
      </div>`,
      )}
      ${group(
        'Goal',
        '',
        `<div class="card flush">
        ${frow(
          'cal-goal',
          'Goal',
          '',
          `<select id="cal-goal" class="select fsel" data-change="calorieGoal">
          ${['lose', 'maintain', 'gain'].map((g) => `<option value="${g}" ${c.goal === g ? 'selected' : ''}>${g[0].toUpperCase() + g.slice(1)} weight</option>`).join('')}
        </select>`,
        )}
        ${CALORIE_FIELDS.slice(0, 1)
          .map(([key, label, step, min, max, hint]) =>
            frow(`cal-${key}`, label, hint, `<input id="cal-${key}" class="input fnum" type="number" inputmode="decimal" step="${step}" min="${min}" max="${max}" value="${esc(c[key])}" data-key="${key}" data-min="${min}" data-max="${max}" data-change="calorieNum" />`),
          )
          .join('')}
        <label class="check switch"><span><b>Never below my resting burn</b><span>Off: never below 1,200 kcal</span></span><input type="checkbox" data-change="calorieFloor" ${c.floorBmr !== false ? 'checked' : ''} /></label>
      </div>`,
      )}
      ${group(
        'How it is worked out',
        '',
        `<div class="card flush">${CALORIE_FIELDS.slice(1)
          .map(([key, label, step, min, max, hint]) =>
            frow(`cal-${key}`, label, hint, `<input id="cal-${key}" class="input fnum" type="number" inputmode="decimal" step="${step}" min="${min}" max="${max}" value="${esc(c[key])}" data-key="${key}" data-min="${min}" data-max="${max}" data-change="calorieNum" />`),
          )
          .join('')}</div>`,
      )}
      <div class="sgroup"><button type="button" class="btn secondary" data-action="resetCalories">Reset to defaults</button></div>
    </section>`;
}

const RECOVERY_SCORE_FIELDS = [
  ['sleepTargetH', 'Sleep target (hours)', 0.25, 5, 10],
  ['wSleep', 'Weight: sleep', 5, 0, 100],
  ['wHrv', 'Weight: HRV', 5, 0, 100],
  ['wRhr', 'Weight: resting HR', 5, 0, 100],
  ['wSoreness', 'Weight: soreness', 5, 0, 100],
  ['green', 'Green from (score)', 1, 1, 100],
  ['amber', 'Amber from (score)', 1, 0, 99],
  ['baselineDays', 'Baseline (days)', 1, 7, 90],
  ['minBaseline', 'Days needed before HRV / RHR count', 1, 3, 30],
];

function renderRecoveryScoreSettings() {
  const r = state.settings.recoveryScore;
  return `
    <section class="secpage" data-sec="recoveryScore">
      <p class="sub">Each morning: sleep, HRV and resting HR come from an iPhone Shortcut; soreness and the Watch sleep score you tap on Today. HRV and resting HR are judged against your own last ${esc(r.baselineDays)} days, not fixed numbers. Advice only: nothing is locked.</p>
      ${[
        ['Sleep', ['sleepTargetH']],
        ['Weights', ['wSleep', 'wHrv', 'wRhr', 'wSoreness']],
        ['Bands', ['green', 'amber']],
        ['Baseline', ['baselineDays', 'minBaseline']],
      ]
        .map(([title, keys]) =>
          group(
            title,
            title === 'Weights' ? '<span class="note">rescaled to what is present</span>' : '',
            `<div class="card flush">${RECOVERY_SCORE_FIELDS.filter((f) => keys.includes(f[0]))
              .map(([key, label, step, min, max]) =>
                frow(`rs-${key}`, label.replace(/^Weight: /, ''), '', `<input id="rs-${key}" class="input fnum" type="number" inputmode="decimal" step="${step}" min="${min}" max="${max}" value="${esc(r[key])}" data-key="${key}" data-min="${min}" data-max="${max}" data-change="recoveryScoreNum" />`),
              )
              .join('')}</div>`,
          ),
        )
        .join('')}
      <div class="sgroup"><button type="button" class="btn secondary" data-action="resetRecoveryScore">Reset to defaults</button></div>
      ${group('Morning Shortcut', '', `<div class="card">
      <details class="shortcut-help">
        <summary><strong>Set up the morning Shortcut (once)</strong></summary>
        <p class="small">Shortcuts app → <strong>Automation</strong> → <strong>+</strong> → <strong>Time of Day</strong> (e.g. 9:00 AM, Daily) → <strong>Run Immediately</strong> → New Blank Automation. Add these actions in order:</p>
        <ol class="small">
          <li><strong>Find Health Samples</strong>: Type <em>Sleep</em>, Start Date <em>is in the last 18 hours</em>, Value <em>is not</em> In Bed, Value <em>is not</em> Awake. (Turn off Limit.)</li>
          <li><strong>Repeat with Each</strong> item in Health Samples. Inside the repeat: <strong>Text</strong> = <em>Start Date</em> | <em>End Date</em> (tap each date → Date Format: <em>ISO 8601</em>, Include ISO 8601 Time on), with a <code>|</code> between them. Then <strong>Add to Variable</strong> <code>Spans</code>.</li>
          <li>After the repeat: <strong>Combine Text</strong> <code>Spans</code> with Custom separator <code>;</code></li>
          <li><strong>Find Health Samples</strong>: Type <em>Resting Heart Rate</em>, Start Date <em>is in the last 1 day</em>, Sort by Start Date Latest First, Limit 1.</li>
          <li><strong>Find Health Samples</strong>: Type <em>Heart Rate Variability</em>, Start Date <em>is in the last 12 hours</em>. Then <strong>Calculate Statistics</strong>: Average of those samples.</li>
          <li><strong>Get Contents of URL</strong>: your Apps Script URL (More → Google Sheet), Method <em>POST</em>, Request Body <em>JSON</em> with fields:
            <code>token</code> (Text, your token) · <code>action</code> (Text: <code>recovery</code>) · <code>sleep</code> (Text: Combined Text) · <code>rhr</code> (Number: the Resting Heart Rate sample) · <code>hrv</code> (Number: the Average).</li>
        </ol>
        <p class="small">Run it once by hand and allow Health access. The Sheet's <strong>Recovery</strong> tab gets today's row and Home shows "From your Watch". The Watch and the iPhone often both record a night; the overlap is counted once.</p>
      </details></div>`)}
    </section>`;
}

/* -------------------------------------------------------------- rest timer */

let timerHandle = null;
let clockHandle = null; // the workout screen's running clock

function startTimer() {
  const total = Math.max(5, Number(state.settings.restSeconds) || 90);
  state.ui.timer = { endsAt: Date.now() + total * 1000, total };
  tickTimer();
}

function tickTimer() {
  clearInterval(timerHandle);
  if (!state.ui.timer) return;
  const update = () => {
    const el = document.getElementById('timer-value');
    const box = document.getElementById('timer');
    if (!el || !box || !state.ui.timer) return clearInterval(timerHandle);
    const remaining = (state.ui.timer.endsAt - Date.now()) / 1000;
    el.textContent = remaining <= 0 ? 'Go' : fmtClock(remaining);
    box.classList.toggle('done', remaining <= 0);
    if (remaining <= 0) clearInterval(timerHandle);
  };
  update();
  timerHandle = setInterval(update, 250);
}

/* ---------------------------------------------------------------- actions */

const actions = {
  resume() {
    go('entry');
  },

  async discardDraft() {
    const ok = await openModal({
      title: 'Discard this workout?',
      message: `${state.draft.sets.length} logged set(s) will be lost. This cannot be undone.`,
      confirmText: 'Discard',
      danger: true,
    });
    if (!ok) return;
    state.draft = null;
    state.ui.form = null;
    state.ui.timer = null;
    saveDraft();
    render();
  },

  async startWorkout() {
    const st = state.ui.start;
    const dayType = st.dayType === 'Custom' ? st.custom.trim() : st.dayType;
    if (!dayType) return toast('Give the custom day a name', 'error');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date)) return toast('Pick a date', 'error');
    if (state.draft) {
      const ok = await openModal({
        title: 'Start a new workout?',
        message: 'The current workout will be discarded.',
        confirmText: 'Start new',
        danger: true,
      });
      if (!ok) return;
    }
    if (!state.exercises[dayType]) {
      state.exercises[dayType] = [];
      save(KEYS.exercises, state.exercises);
    }
    state.draft = {
      id: uuid(),
      date: st.date,
      dayType,
      startedAt: nowISO(),
      finishedAt: null,
      notes: '',
      avgHeartRate: null,
      activeCalories: null,
      satisfaction: {},
      score: null,
      synced: false,
      sets: [],
    };
    state.ui.form = null;
    state.ui.timer = null;
    state.ui.sheet = false;
    saveDraft();
    go('entry');
  },

  retryNow() {
    syncOutbox({ manual: true });
  },

  reps(el) {
    const f = form();
    const v = el.dataset.value;
    const value = v === 'other' || v === 'failure' ? v : Number(v);
    f.reps = f.reps === value ? null : value;
    render();
    if (f.reps === 'other') document.getElementById('other-reps')?.focus();
  },

  rir(el) {
    const f = form();
    const v = Number(el.dataset.value);
    f.rir = f.rir === v ? null : v;
    render();
  },

  toggleWarmup() {
    const f = form();
    f.warmup = !f.warmup;
    render();
  },

  moreSets() {
    const f = form();
    f.visibleSets += 1;
    f.setNo = f.visibleSets;
    render();
  },

  addExercise() {
    const name = state.ui.newExercise.trim();
    if (!name) return toast('Type the exercise name', 'error');
    const day = state.draft.dayType;
    if (!state.exercises[day]) state.exercises[day] = [];
    if (!state.exercises[day].includes(name)) {
      state.exercises[day].push(name);
      save(KEYS.exercises, state.exercises);
    }
    state.ui.newExercise = '';
    const f = form();
    f.addingExercise = false;
    f.exercise = name;
    f.setNo = nextSetNo(name);
    f.visibleSets = Math.max(4, f.setNo);
    f.weight = lastWeight(name);
    render();
  },

  saveSet() {
    const f = form();
    const problems = [];
    if (!f.exercise) problems.push('exercise');
    let reps = null;
    let toFailure = false;
    if (f.reps === 'failure') {
      toFailure = true;
      if (f.failureReps !== '') {
        reps = Number(f.failureReps);
        if (!Number.isInteger(reps) || reps < 0) problems.push('reps');
      }
    } else if (f.reps === 'other') {
      reps = Number(f.otherReps);
      if (!Number.isInteger(reps) || reps < 1) problems.push('reps');
    } else if (typeof f.reps === 'number') {
      reps = f.reps;
    } else {
      problems.push('reps');
    }
    const weight = f.weight === '' ? NaN : Number(f.weight);
    if (!Number.isFinite(weight) || weight < 0) problems.push('weight');
    // Reps in reserve: failure means 0; otherwise asked for on working sets when Settings says so.
    const rir = toFailure ? 0 : f.rir ?? null;
    if (!problems.length && rir === null && !f.warmup && state.settings.requireRir) problems.push('rir');
    if (problems.length) {
      for (const id of ['exercise', 'weight', 'other-reps']) document.getElementById(id)?.removeAttribute('aria-invalid');
      if (problems.includes('exercise')) document.getElementById('exercise')?.setAttribute('aria-invalid', 'true');
      if (problems.includes('weight')) document.getElementById('weight')?.setAttribute('aria-invalid', 'true');
      if (problems.includes('reps')) document.getElementById('other-reps')?.setAttribute('aria-invalid', 'true');
      return toast(
        problems.includes('exercise')
          ? 'Choose an exercise'
          : problems.includes('reps')
            ? 'Pick the reps (or Failure)'
            : problems.includes('weight')
              ? 'Enter the weight (0 for bodyweight)'
              : 'How many reps were left in the tank? (RIR)',
        'error',
      );
    }

    const existing = f.editingId ? state.draft.sets.find((s) => s.id === f.editingId) : null;
    const set = {
      id: existing ? existing.id : uuid(),
      exercise: f.exercise,
      setNo: f.setNo,
      reps,
      toFailure,
      rir: rir === null || rir === undefined ? null : rir,
      warmup: Boolean(f.warmup),
      weightKg: weight,
      loggedAt: existing ? existing.loggedAt : nowISO(),
    };
    if (existing) Object.assign(existing, set);
    else state.draft.sets.push(set);
    saveDraft();

    // Keep exercise and weight, advance the set number, clear the reps, start resting.
    const next = nextSetNo(f.exercise);
    state.ui.form = {
      ...f,
      setNo: next,
      visibleSets: Math.max(4, next),
      reps: null,
      otherReps: '',
      failureReps: '',
      rir: null,
      warmup: false,
      editingId: null,
    };
    if (!existing) startTimer();
    state.ui.sheet = false; // back to the list, with the rest timer running
    toast(existing ? `Set ${set.setNo} updated` : `Set ${set.setNo} saved`);
    render();
  },

  cancelEdit() {
    state.ui.form = newForm(form().exercise);
    render();
  },

  editSet(el) {
    const s = state.draft.sets.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const chip = repsChips().includes(s.reps) ? s.reps : 'other';
    state.ui.form = {
      exercise: s.exercise,
      setNo: s.setNo,
      visibleSets: Math.max(4, s.setNo),
      reps: s.toFailure ? 'failure' : chip,
      otherReps: !s.toFailure && chip === 'other' ? String(s.reps) : '',
      failureReps: s.toFailure && s.reps != null ? String(s.reps) : '',
      rir: Number.isFinite(s.rir) ? s.rir : null,
      warmup: Boolean(s.warmup),
      weight: fmtKg(s.weightKg),
      editingId: s.id,
      addingExercise: false,
    };
    state.ui.sheet = true;
    render();
  },

  async deleteSet(el) {
    const s = state.draft.sets.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const ok = await openModal({
      title: 'Delete this set?',
      message: `${s.exercise} · ${describeSet(s)}`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    state.draft.sets = state.draft.sets.filter((x) => x.id !== s.id);
    saveDraft();
    if (state.ui.form?.editingId === s.id) state.ui.form = newForm(s.exercise);
    else if (state.ui.form && state.ui.form.exercise === s.exercise && !state.ui.form.editingId) {
      state.ui.form.setNo = nextSetNo(s.exercise);
    }
    render();
  },

  /** Open the logging panel for an exercise ('' = choose or add one). Editing a set keeps its values. */
  openLog(el) {
    const name = el.dataset.name || '';
    const f = state.ui.form;
    if (!f || f.editingId || f.exercise !== name || !name) state.ui.form = newForm(name);
    state.ui.sheet = true;
    render();
  },

  closeSheet() {
    state.ui.sheet = false;
    if (state.ui.form?.editingId) state.ui.form = newForm(state.ui.form.exercise);
    render();
  },

  /** −/+ on the weight: the exercise's own step (Settings → Exercises) or 2.5 kg; never below 0. */
  weightStep(el) {
    const f = form();
    const step = Number(state.settings.steps?.[f.exercise]) || 2.5;
    const now = Number(f.weight) || 0;
    f.weight = fmtKg(Math.max(0, Math.round((now + Number(el.dataset.dir) * step) * 100) / 100));
    const input = document.getElementById('weight');
    if (input) input.value = f.weight;
    refreshSetCompare();
  },

  finishWorkout() {
    if (!state.draft.sets.length) return toast('Log at least one set first', 'error');
    state.ui.sheet = false;
    // The workout closes here: the clock stops now, not when the review is filled in and sent (v1.7).
    state.draft.finishedAt = nowISO();
    state.ui.form = null;
    state.ui.timer = null;
    saveDraft();
    go('review');
  },

  /** Today's "Start <day>": the scheduled day for today, no questions asked. */
  /** One tap on a day on the Workout tab starts it on the chosen date (today unless changed). */
  quickStart(el) {
    const st = state.ui.start;
    state.ui.start = { ...st, dayType: el.dataset.day, custom: '', date: /^\d{4}-\d{2}-\d{2}$/.test(st.date) ? st.date : todayISO() };
    state.ui.startPicked = true;
    return actions.startWorkout();
  },

  startCustomDay() {
    state.ui.start.dayType = 'Custom';
    state.ui.startPicked = true;
    return actions.startWorkout();
  },

  startToday() {
    const today = todayISO();
    const planned = scheduledDay(today);
    if (!planned) return go('workout');
    const known = DAY_TYPES.includes(planned);
    state.ui.start = { dayType: known ? planned : 'Custom', custom: known ? '' : planned, date: today };
    state.ui.startPicked = true;
    return actions.startWorkout();
  },

  /** "+ Log" on a small workout: now, no note (both can be changed on Body). */
  smallNow() {
    const entry = { id: uuid(), date: todayISO(), time: nowTime(), note: '', savedAt: nowISO() };
    state.small = [...state.small, entry];
    save(KEYS.small, state.small);
    queueSmall(entry);
    toast(`Small workout logged · ${entry.time}`);
    render();
  },

  async resetCalories() {
    const ok = await openModal({ title: 'Reset calorie settings?', message: 'Rate, factors and thresholds go back to the defaults. Height, sex and date of birth stay.', confirmText: 'Reset' });
    if (!ok) return;
    state.settings.calories = { ...Body.CALORIE_DEFAULTS };
    calorieSettingsChanged();
    render();
  },

  async resetRecoveryScore() {
    const ok = await openModal({ title: 'Reset recovery score settings?', confirmText: 'Reset' });
    if (!ok) return;
    state.settings.recoveryScore = { ...Body.RECOVERY_SCORE_DEFAULTS };
    save(KEYS.settings, state.settings);
    storeRecoveryScore(todayISO());
    render();
  },

  /** One tap answers the morning check: the soreness is saved at once, with any sleep score typed above it. */
  morningSoreness(el) {
    const v = Number(el.dataset.value);
    const box = document.getElementById('sleep-score');
    if (box) state.ui.morning.sleepScore = box.value;
    state.ui.morning.soreness = v;
    actions.morningSave();
  },

  morningSave() {
    const ui = state.ui.morning;
    const today = todayISO();
    const e = recoveryEntry(today) || {};
    const soreness = ui.soreness ?? (Number.isFinite(e.soreness) ? e.soreness : null);
    if (soreness === null) return toast('Tap how sore you are (1–10)', 'error');
    const raw = String(ui.sleepScore ?? '').trim();
    const sleepScore = raw === '' ? (Number.isFinite(e.sleepScore) ? e.sleepScore : null) : Number(raw);
    if (sleepScore !== null && !(sleepScore >= 0 && sleepScore <= 100)) return toast('Sleep score is 0–100', 'error');
    putRecovery(today, { soreness, sleepScore });
    const r = recoveryResult(today);
    if (r && r.score !== null) putRecovery(today, { score: r.score });
    queueRecovery(today, { soreness, ...(sleepScore !== null ? { sleepScore } : {}), ...(r && r.score !== null ? { score: r.score } : {}) });
    state.ui.morning = { soreness: null, sleepScore: '' };
    render();
    refreshRecovery(true); // the Shortcut may have run since the app opened
  },

  morningEdit() {
    state.ui.morning = { soreness: null, sleepScore: '', editing: true };
    render();
  },

  calorieSeen() {
    if (state.settings.calorieLock) state.settings.calorieLock.seen = true;
    save(KEYS.settings, state.settings);
    render();
  },

  async reopenWorkout() {
    const ok = await openModal({
      title: 'Reopen this workout?',
      message: 'You can log more sets. The clock runs again and the finish time is set when you tap Finish workout again.',
      confirmText: 'Reopen',
    });
    if (!ok || !state.draft) return;
    state.draft.finishedAt = null;
    saveDraft();
    go('entry');
  },

  noWatch(el) {
    if (!state.draft) return;
    state.draft.noWatch = !state.draft.noWatch;
    if (state.draft.noWatch) state.draft.avgHeartRate = state.draft.activeCalories = null;
    saveDraft();
    render();
  },

  timerMinus() {
    const t = state.ui.timer;
    if (t) {
      t.endsAt = Math.max(Date.now(), t.endsAt - 15000);
      tickTimer();
    }
  },

  timerPlus() {
    const t = state.ui.timer;
    if (t) {
      t.endsAt = Math.max(Date.now(), t.endsAt) + 15000;
      tickTimer();
    }
  },

  timerSkip() {
    state.ui.timer = null;
    render();
  },

  submitWorkout() {
    submitWorkout();
  },

  submitDone() {
    state.ui.submit = { status: 'idle', message: '', session: null };
    go('home');
  },

  openSession(el) {
    go('history', el.dataset.id);
  },

  syncHistory() {
    syncHistoryFromSheet();
  },

  toggleToken() {
    state.ui.showToken = !state.ui.showToken;
    render();
  },

  async ping() {
    if (!haveApi()) {
      state.ui.ping = { ok: false, message: 'Enter the script URL and token first.' };
      return render();
    }
    state.ui.ping = { ok: null, message: 'Testing…' };
    render();
    try {
      const data = await apiGet({ action: 'ping' });
      state.ui.ping = { ok: true, message: `OK — connected to sheet "${data.sheet || 'Log'}".` };
    } catch (err) {
      state.ui.ping = { ok: false, message: describeError(err) };
    }
    render();
    // A new phone: offer the settings saved in the Sheet before anything overwrites them.
    if (state.ui.ping.ok && !state.backup.linked) {
      saveBackupState({ remoteAt: null });
      await linkSettingsBackup({ ask: true });
    }
  },

  async restoreSettings() {
    if (!haveApi()) return toast('Add the script URL and token first', 'error');
    let remote;
    try {
      remote = await apiGet({ action: 'settings' });
    } catch (err) {
      return toast(describeError(err), 'error');
    }
    if (!remote.data) return toast('No settings saved in the Sheet yet', 'error');
    const ok = await openModal({
      title: 'Replace this phone’s settings?',
      message: `With the copy saved ${remote.savedAt ? formatDate(String(remote.savedAt).slice(0, 10)) : 'earlier'}: exercises, plans, schedule, buttons, progression and recovery. Workouts, measurements and photos are not touched.`,
      confirmText: 'Restore',
      danger: true,
    });
    if (!ok) return;
    applySettingsSnapshot(remote.data);
    saveBackupState({ linked: true, remoteAt: null });
    await syncMissedFromSheet();
    await syncSmallFromSheet();
    toast('Settings restored from the Sheet');
    render();
  },

  async keepPhoneSettings() {
    saveBackupState({ linked: true, dirty: true, remoteAt: null });
    const ok = await uploadSettings();
    toast(ok ? 'This phone’s settings are now the Sheet’s copy' : 'Will save to the Sheet when online', ok ? 'ok' : 'error');
    render();
  },

  async backupSettingsNow() {
    if (!haveApi()) return toast('Add the script URL and token first', 'error');
    if (!state.backup.linked) return linkSettingsBackup({ ask: true });
    saveBackupState({ dirty: true });
    const ok = await uploadSettings();
    toast(ok ? 'Settings saved to the Sheet' : state.backup.error === 'offline' ? 'Offline: will retry' : `The Sheet said: ${state.backup.error}`, ok ? 'ok' : 'error');
    render();
  },

  async missedReason(el) {
    const id = el.dataset.id;
    const reason = el.dataset.reason;
    const m = state.missed.find((x) => x.id === id);
    if (!m) return;
    if (reason === 'Other' || el.dataset.edit) {
      const values = await openModal({
        title: `${m.dayType} · ${formatDate(m.date)}`,
        message: 'Why was it missed? The reason and note go to the Missed tab in the Sheet.',
        fields: [
          { key: 'reason', label: 'Reason', value: reason === 'Other' ? 'Other' : m.reason || '' },
          { key: 'note', label: 'Note (optional)', value: m.note || '' },
        ],
        confirmText: 'Save',
      });
      if (!values) return;
      setMissedReason(id, (values.reason || 'Other').trim(), (values.note || '').trim());
    } else {
      setMissedReason(id, reason);
    }
    toast(`${m.dayType}: ${m.reason}`);
    render();
  },

  moveExercise(el) {
    const day = state.ui.manageDay;
    const list = state.exercises[day];
    const i = Number(el.dataset.index);
    const j = i + Number(el.dataset.dir);
    if (!list || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save(KEYS.exercises, state.exercises);
    render();
  },

  async renameExercise(el) {
    const day = state.ui.manageDay;
    const oldName = state.exercises[day]?.[Number(el.dataset.index)];
    if (!oldName) return;
    const values = await openModal({
      title: 'Edit exercise',
      message: 'The new name is used on every day it appears and in the workouts saved on this phone.',
      fields: [
        { key: 'name', label: 'Name', value: oldName },
        { key: 'target', label: 'Plan (sets × reps range, e.g. 3 × 8-12)', value: state.targets[day]?.[oldName] || '', placeholder: 'e.g. 3 × 8-12' },
        { key: 'step', label: 'Weight step when progressing (kg, blank = default)', value: state.settings.steps?.[oldName] ?? '', placeholder: 'e.g. 2.5' },
        { key: 'muscle', label: 'Muscle group', value: muscleOf(oldName), placeholder: MUSCLE_GROUPS.slice(0, 4).join(', ') + '…' },
      ],
      confirmText: 'Save',
    });
    if (!values) return;
    const newName = values.name;
    if (!newName) return toast('The name cannot be empty', 'error');
    const step = values.step === '' ? null : Number(values.step);
    if (step !== null && !(step > 0)) return toast('Weight step must be a number above 0', 'error');
    if (newName !== oldName) renameEverywhere(oldName, newName);
    if (!state.targets[day]) state.targets[day] = {};
    if (values.target) state.targets[day][newName] = values.target;
    else delete state.targets[day][newName];
    save(KEYS.targets, state.targets);
    state.settings.steps = { ...(state.settings.steps || {}) };
    if (step === null) delete state.settings.steps[newName];
    else state.settings.steps[newName] = step;
    state.settings.muscles = { ...(state.settings.muscles || {}) };
    const muscle = MUSCLE_GROUPS.find((m) => m.toLowerCase() === values.muscle.toLowerCase()) || values.muscle;
    if (muscle) state.settings.muscles[newName] = muscle;
    else delete state.settings.muscles[newName];
    save(KEYS.settings, state.settings);
    toast(newName === oldName ? 'Plan updated' : `Renamed to ${newName}`);
    render();
  },

  async removeExercise(el) {
    const day = state.ui.manageDay;
    const name = state.exercises[day]?.[Number(el.dataset.index)];
    if (!name) return;
    const ok = await openModal({
      title: `Remove ${name} from ${day}?`,
      message: 'Logged workouts keep it. You can add it back any time.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    state.exercises[day] = state.exercises[day].filter((n) => n !== name);
    if (state.targets[day]) delete state.targets[day][name];
    save(KEYS.exercises, state.exercises);
    save(KEYS.targets, state.targets);
    render();
  },

  rate(el) {
    const s = state.draft;
    if (!s) return;
    const q = el.dataset.q;
    const v = Number(el.dataset.value);
    s.satisfaction = { ...(s.satisfaction || {}) };
    if (s.satisfaction[q] === v) delete s.satisfaction[q];
    else s.satisfaction[q] = v;
    saveDraft();
    render();
  },

  score(el) {
    const s = state.draft;
    if (!s) return;
    const v = Number(el.dataset.value);
    s.score = s.score === v ? null : v;
    saveDraft();
    render();
  },

  moveQuestion(el) {
    const list = [...questions()];
    const i = Number(el.dataset.index);
    const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    state.settings.questions = list;
    save(KEYS.settings, state.settings);
    render();
  },

  async renameQuestion(el) {
    const list = [...questions()];
    const i = Number(el.dataset.index);
    if (!list[i]) return;
    const values = await openModal({
      title: 'Rename question',
      fields: [{ key: 'name', label: 'Question', value: list[i] }],
      confirmText: 'Save',
    });
    if (!values || !values.name) return;
    list[i] = values.name;
    state.settings.questions = list;
    save(KEYS.settings, state.settings);
    render();
  },

  async removeQuestion(el) {
    const list = [...questions()];
    const i = Number(el.dataset.index);
    if (!list[i]) return;
    const ok = await openModal({ title: `Remove "${list[i]}"?`, message: 'Past workouts keep their answers.', confirmText: 'Remove', danger: true });
    if (!ok) return;
    list.splice(i, 1);
    state.settings.questions = list;
    save(KEYS.settings, state.settings);
    render();
  },

  addReason() {
    const r = state.ui.newReason.trim();
    if (!r) return toast('Type the reason', 'error');
    if (missReasons().some((x) => x.toLowerCase() === r.toLowerCase())) return toast('Already in the list', 'error');
    const list = [...missReasons()];
    const other = list.indexOf('Other');
    list.splice(other === -1 ? list.length : other, 0, r); // keep "Other" last
    state.settings.missReasons = list;
    state.ui.newReason = '';
    save(KEYS.settings, state.settings);
    render();
  },

  removeReason(el) {
    const list = missReasons().filter((_, i) => i !== Number(el.dataset.index));
    if (!list.length) return toast('Keep at least one reason', 'error');
    state.settings.missReasons = list;
    save(KEYS.settings, state.settings);
    render();
  },

  addQuestion() {
    const q = state.ui.newQuestion.trim();
    if (!q) return toast('Type the question', 'error');
    if (questions().includes(q)) return toast('Already in the list', 'error');
    state.settings.questions = [...questions(), q];
    state.ui.newQuestion = '';
    save(KEYS.settings, state.settings);
    render();
    document.getElementById('question-new')?.focus();
  },

  manageAdd() {
    const day = state.ui.manageDay;
    const name = state.ui.manageNew.trim();
    if (!name) return toast('Type the exercise name', 'error');
    if (!state.exercises[day]) state.exercises[day] = [];
    if (state.exercises[day].includes(name)) return toast('Already in this day', 'error');
    state.exercises[day].push(name);
    state.ui.manageNew = '';
    save(KEYS.exercises, state.exercises);
    render();
    document.getElementById('manage-new')?.focus();
  },

  addRep() {
    const n = Number(state.ui.newRep);
    if (!Number.isInteger(n) || n < 1 || n > 999) return toast('Enter a whole number of reps', 'error');
    const list = repsChips().filter((c) => typeof c === 'number');
    if (list.includes(n)) return toast('That button is already there', 'error');
    state.settings.repsChips = [...list, n].sort((a, b) => a - b);
    state.ui.newRep = '';
    save(KEYS.settings, state.settings);
    render();
    document.getElementById('rep-new')?.focus();
  },

  removeRep(el) {
    const n = Number(el.dataset.value);
    const list = repsChips().filter((c) => typeof c === 'number' && c !== n);
    if (!list.length) return toast('Keep at least one reps button', 'error');
    state.settings.repsChips = list;
    save(KEYS.settings, state.settings);
    render();
  },

  async resetProgression() {
    const ok = await openModal({ title: 'Restore the progression defaults?', message: 'Per-exercise weight steps and muscle groups are kept.', confirmText: 'Restore' });
    if (!ok) return;
    state.settings.progression = { ...Progress.PROGRESSION_DEFAULTS };
    save(KEYS.settings, state.settings);
    render();
  },

  async resetRecovery() {
    const ok = await openModal({ title: 'Restore the recovery defaults?', confirmText: 'Restore' });
    if (!ok) return;
    state.settings.recovery = { ...Progress.RECOVERY_DEFAULTS };
    save(KEYS.settings, state.settings);
    render();
  },

  /** Start a lighter week today; its workouts are left out of progress until it ends. */
  startDeload() {
    const today = todayISO();
    const len = Math.max(1, Math.round(Number(state.settings.recovery.lengthDays) || 7));
    state.settings.deloads = [...deloadWindows().filter((w) => w.end < today), { start: today, end: Progress.addDays(today, len - 1) }];
    state.settings.snoozeUntil = null;
    save(KEYS.settings, state.settings);
    toast(`Lighter week started: ${len} days`);
    render();
  },

  async endDeload() {
    const today = todayISO();
    const ok = await openModal({ title: 'End the lighter week now?', message: "From today, workouts count for progress again.", confirmText: 'End it' });
    if (!ok) return;
    // Started today: drop it. Otherwise it ended yesterday, so today's workout counts.
    state.settings.deloads = deloadWindows()
      .filter((w) => !(w.start === today && w.end >= today))
      .map((w) => (w.start < today && today <= w.end ? { ...w, end: Progress.addDays(today, -1) } : w));
    save(KEYS.settings, state.settings);
    render();
  },

  snoozeRecovery() {
    const days = Math.max(1, Math.round(Number(state.settings.recovery.snoozeDays) || 3));
    state.settings.snoozeUntil = Progress.addDays(todayISO(), days);
    save(KEYS.settings, state.settings);
    toast(`Reminder again on ${formatDate(state.settings.snoozeUntil, false)}`);
    render();
  },

  addField() {
    addToList('measureFields', measureFields(), state.ui.newField, 'newField', 'field-new');
  },
  removeField(el) {
    removeFromList('measureFields', measureFields(), el, 'Past entries keep their values.');
  },
  moveField(el) {
    moveInList('measureFields', measureFields(), el);
  },
  addPose() {
    addToList('photoPoses', poses(), state.ui.newPose, 'newPose', 'pose-new');
  },
  removePose(el) {
    removeFromList('photoPoses', poses(), el, 'Photos already taken keep their pose name.');
  },
  movePose(el) {
    moveInList('photoPoses', poses(), el);
  },

  exportData() {
    const data = {
      app: 'bhimlekha',
      version: APP_VERSION,
      exportedAt: nowISO(),
      settings: state.settings,
      exercises: state.exercises,
      targets: state.targets,
      cardio: state.cardio,
      draft: state.draft,
      outbox: state.outbox,
      history: state.history,
      measurements: state.measurements,
      mOutbox: state.mOutbox,
      missed: state.missed,
      missedOutbox: state.missedOutbox,
      small: state.small,
      smallOutbox: state.smallOutbox,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bhimlekha-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Backup file ready');
  },

  importData() {
    document.getElementById('import-file')?.click();
  },
};

const changes = {
  /** The weigh-in saves when the keyboard closes (Done), so the Save button is only a fallback. */
  weighInCommit(el) {
    state.ui.body.weighIn = el.value;
    const v = Number(el.value);
    if (el.value !== '' && Number.isFinite(v) && v > 0) actions.saveWeighIn();
  },
  startDay(el) {
    state.ui.start.dayType = el.value;
    state.ui.startPicked = true;
    render();
    if (el.value === 'Custom') document.getElementById('custom-day')?.focus();
  },
  startDate(el) {
    state.ui.start.date = el.value;
    if (!state.ui.startPicked) render(); // the suggested day follows the date
  },
  exercise(el) {
    const f = form();
    if (el.value === '__new__') {
      f.addingExercise = true;
      render();
      document.getElementById('new-exercise')?.focus();
      return;
    }
    f.addingExercise = false;
    f.exercise = el.value;
    f.setNo = nextSetNo(el.value);
    f.visibleSets = Math.max(4, f.setNo);
    f.weight = lastWeight(el.value);
    f.editingId = null;
    render();
  },
  setNo(el) {
    form().setNo = Number(el.value);
    render();
  },
  scriptUrl(el) {
    state.settings.scriptUrl = el.value.trim();
    save(KEYS.settings, state.settings);
  },
  token(el) {
    state.settings.token = el.value.trim();
    save(KEYS.settings, state.settings);
  },
  restSeconds(el) {
    const v = Math.min(900, Math.max(10, Number(el.value) || 90));
    state.settings.restSeconds = v;
    el.value = v;
    save(KEYS.settings, state.settings);
  },
  manageDay(el) {
    state.ui.manageDay = el.value;
    render();
  },
  repsChips(el) {
    const nums = el.value
      .split(/[,\s]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 999);
    const unique = [...new Set(nums)];
    if (!unique.length) {
      toast('Enter at least one number, e.g. 5, 6, 7', 'error');
      el.value = repsChips().filter((c) => typeof c === 'number').join(', ');
      return;
    }
    state.settings.repsChips = unique;
    save(KEYS.settings, state.settings);
    render();
  },
  recoveryToggle(el) {
    state.settings.recovery = { ...state.settings.recovery, [el.dataset.key]: el.checked };
    save(KEYS.settings, state.settings);
    render(); // the trigger's card shows On / Off
  },
  recoveryNum(el) {
    const key = el.dataset.key;
    const v = Number(el.value);
    const min = ['schedWeeks', 'strengthWeeks', 'dropCount', 'feelWorkouts', 'lengthDays'].includes(key) ? 1 : 0;
    if (!Number.isFinite(v) || v < min) {
      el.value = state.settings.recovery[key];
      return toast(`Enter a number of ${min} or more`, 'error');
    }
    state.settings.recovery = { ...state.settings.recovery, [key]: v };
    save(KEYS.settings, state.settings);
  },
  requireRir(el) {
    state.settings.requireRir = el.checked;
    save(KEYS.settings, state.settings);
  },
  progression(el) {
    const key = el.dataset.key;
    const v = Number(el.value);
    if (!Number.isFinite(v) || v < 0) {
      el.value = state.settings.progression[key];
      return toast('Enter a number of 0 or more', 'error');
    }
    state.settings.progression = { ...state.settings.progression, [key]: v };
    save(KEYS.settings, state.settings);
  },
  scheduleDay(el) {
    state.settings.schedule = { ...(state.settings.schedule || DEFAULT_SCHEDULE), [el.dataset.dow]: el.value };
    save(KEYS.settings, state.settings);
    render();
  },
  checkinDay(el) {
    state.settings.checkinDay = Number(el.value);
    save(KEYS.settings, state.settings);
    render();
  },
  programStart(el) {
    state.settings.programStart = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '';
    save(KEYS.settings, state.settings);
    render();
  },
  cameraTimer(el) {
    const v = Math.min(30, Math.max(0, Math.round(Number(el.value) || 0)));
    state.settings.cameraTimer = v;
    el.value = v;
    save(KEYS.settings, state.settings);
  },
  autoLockMinutes(el) {
    const v = Math.min(60, Math.max(1, Math.round(Number(el.value) || 3)));
    state.settings.autoLockMinutes = v;
    el.value = v;
    save(KEYS.settings, state.settings);
  },
  avgHeartRate(el) {
    if (!state.draft) return;
    const v = Number(el.value);
    state.draft.avgHeartRate = el.value === '' || !Number.isFinite(v) ? null : Math.round(v);
    saveDraft();
    render(); // refresh "Still needed"
  },
  activeCalories(el) {
    if (!state.draft) return;
    const v = Number(el.value);
    state.draft.activeCalories = el.value === '' || !Number.isFinite(v) ? null : Math.round(v);
    saveDraft();
    render();
  },
  profileSex(el) {
    state.settings.profile = { ...(state.settings.profile || {}), sex: el.value === 'female' ? 'female' : 'male' };
    calorieSettingsChanged();
  },
  profileHeight(el) {
    const v = Number(el.value);
    state.settings.profile = { ...(state.settings.profile || {}), heightCm: el.value !== '' && v >= 120 && v <= 230 ? v : null };
    calorieSettingsChanged();
  },
  profileDob(el) {
    state.settings.profile = { ...(state.settings.profile || {}), dob: /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '' };
    calorieSettingsChanged();
  },
  calorieGoal(el) {
    state.settings.calories.goal = ['lose', 'maintain', 'gain'].includes(el.value) ? el.value : 'lose';
    calorieSettingsChanged();
  },
  calorieNum(el) {
    const v = boundedNumber(el);
    if (v === null) return;
    state.settings.calories[el.dataset.key] = v;
    calorieSettingsChanged();
  },
  calorieFloor(el) {
    state.settings.calories.floorBmr = el.checked;
    calorieSettingsChanged();
    render();
  },
  recoveryScoreNum(el) {
    const v = boundedNumber(el);
    if (v === null) return;
    state.settings.recoveryScore[el.dataset.key] = v;
    save(KEYS.settings, state.settings);
    storeRecoveryScore(todayISO());
  },
  cardioNote(el) {
    const day = state.ui.manageDay;
    const v = el.value.trim();
    if (v) state.cardio[day] = v;
    else delete state.cardio[day];
    save(KEYS.cardio, state.cardio);
  },
  importFile(el) {
    const file = el.files && el.files[0];
    if (file) importFromFile(file);
    el.value = '';
  },
};

const inputs = {
  startCustom(el) {
    state.ui.start.custom = el.value;
  },
  newExercise(el) {
    state.ui.newExercise = el.value;
  },
  manageNew(el) {
    state.ui.manageNew = el.value;
  },
  newQuestion(el) {
    state.ui.newQuestion = el.value;
  },
  newReason(el) {
    state.ui.newReason = el.value;
  },
  newRep(el) {
    state.ui.newRep = el.value;
  },
  newField(el) {
    state.ui.newField = el.value;
  },
  newPose(el) {
    state.ui.newPose = el.value;
  },
  otherReps(el) {
    form().otherReps = el.value;
    refreshSetCompare();
  },
  failureReps(el) {
    form().failureReps = el.value;
    refreshSetCompare();
  },
  weight(el) {
    form().weight = el.value;
    el.removeAttribute('aria-invalid');
    refreshSetCompare();
  },
  morningSleepScore(el) {
    state.ui.morning.sleepScore = el.value;
  },
  notes(el) {
    if (state.draft) {
      state.draft.notes = el.value;
      saveDraft();
    }
  },
};

/** A number input's value within its data-min / data-max, or null (the field is put back) when it is not a number. */
function boundedNumber(el) {
  const v = Number(el.value);
  if (el.value === '' || !Number.isFinite(v)) {
    toast('Enter a number', 'error');
    return null;
  }
  const out = Math.min(Number(el.dataset.max), Math.max(Number(el.dataset.min), v));
  el.value = out;
  return out;
}

/** Profile or calorie settings changed: the target applies at once (and Home says so if the number moved). */
function calorieSettingsChanged() {
  save(KEYS.settings, state.settings);
  updateCalorieTarget({ force: true });
}

/* Small list editors for settings arrays (measurement fields, photo poses). */
function addToList(key, current, raw, uiKey, focusId) {
  const value = String(raw || '').trim();
  if (!value) return toast('Type a name first', 'error');
  if (current.includes(value)) return toast('Already in the list', 'error');
  state.settings[key] = [...current, value];
  state.ui[uiKey] = '';
  save(KEYS.settings, state.settings);
  render();
  document.getElementById(focusId)?.focus();
}

async function removeFromList(key, current, el, message) {
  const i = Number(el.dataset.index);
  if (!current[i]) return;
  if (current.length === 1) return toast('Keep at least one', 'error');
  const ok = await openModal({ title: `Remove "${current[i]}"?`, message, confirmText: 'Remove', danger: true });
  if (!ok) return;
  state.settings[key] = current.filter((_, j) => j !== i);
  save(KEYS.settings, state.settings);
  render();
}

function moveInList(key, current, el) {
  const list = [...current];
  const i = Number(el.dataset.index);
  const j = i + Number(el.dataset.dir);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  state.settings[key] = list;
  save(KEYS.settings, state.settings);
  render();
}

function renameEverywhere(oldName, newName) {
  for (const day of Object.keys(state.exercises)) {
    const list = state.exercises[day];
    const i = list.indexOf(oldName);
    if (i === -1) continue;
    if (list.includes(newName)) list.splice(i, 1);
    else list[i] = newName;
    if (state.targets[day]?.[oldName] !== undefined) {
      state.targets[day][newName] = state.targets[day][oldName];
      delete state.targets[day][oldName];
    }
  }
  const rename = (session) => {
    for (const s of session.sets) if (s.exercise === oldName) s.exercise = newName;
  };
  if (state.draft) rename(state.draft);
  state.outbox.forEach(rename);
  state.history.forEach(rename);
  if (state.ui.form?.exercise === oldName) state.ui.form.exercise = newName;
  for (const key of ['steps', 'muscles']) {
    const map = state.settings[key];
    if (map && map[oldName] !== undefined) {
      if (map[newName] === undefined) map[newName] = map[oldName];
      delete map[oldName];
    }
  }
  save(KEYS.settings, state.settings);
  save(KEYS.exercises, state.exercises);
  save(KEYS.targets, state.targets);
  saveDraft();
  save(KEYS.outbox, state.outbox);
  save(KEYS.history, state.history);
}

async function importFromFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('That file is not valid JSON', 'error');
  }
  const known = ['settings', 'exercises', 'targets', 'cardio', 'draft', 'outbox', 'history', 'measurements'];
  if (!data || typeof data !== 'object' || !known.some((k) => k in data)) return toast('Not a Bhimlekha backup', 'error');
  const ok = await openModal({
    title: 'Replace the data on this phone?',
    message: `From ${data.exportedAt ? formatDate(data.exportedAt.slice(0, 10)) : 'an unknown date'}: ${
      Array.isArray(data.history) ? data.history.length : 0
    } workouts, ${Array.isArray(data.outbox) ? data.outbox.length : 0} waiting to sync.`,
    confirmText: 'Import',
    danger: true,
  });
  if (!ok) return;
  if (data.settings && typeof data.settings === 'object') {
    state.settings = {
      ...state.settings,
      ...data.settings,
      progression: { ...Progress.PROGRESSION_DEFAULTS, ...(data.settings.progression || state.settings.progression) },
      recovery: { ...Progress.RECOVERY_DEFAULTS, ...(data.settings.recovery || state.settings.recovery) },
    };
  }
  if (Array.isArray(data.measurements)) state.measurements = data.measurements;
  if (Array.isArray(data.mOutbox)) state.mOutbox = data.mOutbox;
  if (Array.isArray(data.missed)) state.missed = data.missed;
  if (Array.isArray(data.missedOutbox)) state.missedOutbox = data.missedOutbox;
  save(KEYS.missed, state.missed);
  save(KEYS.missedOutbox, state.missedOutbox);
  if (Array.isArray(data.small)) state.small = data.small;
  if (Array.isArray(data.smallOutbox)) state.smallOutbox = data.smallOutbox;
  save(KEYS.small, state.small);
  save(KEYS.smallOutbox, state.smallOutbox);
  save(KEYS.measurements, state.measurements);
  save(KEYS.mOutbox, state.mOutbox);
  if (data.exercises && typeof data.exercises === 'object') state.exercises = data.exercises;
  if (data.targets && typeof data.targets === 'object') state.targets = data.targets;
  if (data.cardio && typeof data.cardio === 'object') state.cardio = data.cardio;
  if ('draft' in data) state.draft = data.draft || null;
  if (Array.isArray(data.outbox)) state.outbox = data.outbox;
  if (Array.isArray(data.history)) state.history = data.history.slice(0, HISTORY_LIMIT);
  save(KEYS.settings, state.settings);
  save(KEYS.exercises, state.exercises);
  save(KEYS.targets, state.targets);
  save(KEYS.cardio, state.cardio);
  saveDraft();
  save(KEYS.outbox, state.outbox);
  save(KEYS.history, state.history);
  state.ui.form = null;
  toast('Imported');
  render();
}

/* -------------------------------------------------------------------- API */

class ApiError extends Error {}

function haveApi() {
  return Boolean(state.settings.scriptUrl && state.settings.token);
}

function describeError(err) {
  if (err instanceof ApiError) return `The script said: ${err.message}`;
  if (err?.name === 'AbortError') return 'Timed out after 15 s. Check the signal and try again.';
  return 'Could not reach Google. Check the URL and your connection.';
}

async function apiFetch(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, redirect: 'follow', signal: ctrl.signal });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(
        res.ok ? 'reply was not JSON (is this the /exec URL, deployed for Anyone?)' : `HTTP ${res.status}`,
      );
    }
    if (!data.ok) throw new ApiError(data.error || 'request rejected');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// POST as text/plain with a JSON string: a "simple" request, so the browser sends no CORS preflight,
// which Apps Script cannot answer. No other headers.
function apiPost(body) {
  return apiFetch(state.settings.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, token: state.settings.token }),
  });
}

function apiGet(params) {
  const url = new URL(state.settings.scriptUrl);
  for (const [k, v] of Object.entries({ ...params, token: state.settings.token })) url.searchParams.set(k, v);
  return apiFetch(url.toString(), { method: 'GET' });
}

/* --------------------------------------------------- submit / outbox sync */

function addToHistory(session) {
  state.history = [session, ...state.history.filter((s) => s.id !== session.id)].slice(0, HISTORY_LIMIT);
  save(KEYS.history, state.history);
}

function markSynced(id) {
  state.outbox = state.outbox.filter((s) => s.id !== id);
  save(KEYS.outbox, state.outbox);
  const h = state.history.find((s) => s.id === id);
  if (h) {
    h.synced = true;
    save(KEYS.history, state.history);
  }
}

/** Upload one session. Returns { kind: 'ok' | 'offline' | 'rejected', message, rows }. The session stays in the
    outbox unless the Sheet confirmed it; the script is idempotent by Session ID, so retries are safe. */
async function uploadSession(session) {
  if (!haveApi()) {
    return { kind: 'offline', message: 'No script URL or token yet. Saved on this phone; add them in Settings and tap Retry now.' };
  }
  try {
    const data = await apiPost({ action: 'submit', session });
    markSynced(session.id);
    const rows = Number(data.rows) || 0;
    return {
      kind: 'ok',
      rows,
      message: data.duplicate ? 'Already in the Sheet (no duplicate rows added)' : `Saved to Sheet (${rows} rows)`,
    };
  } catch (err) {
    if (err instanceof ApiError) return { kind: 'rejected', message: `${describeError(err)} The workout is saved here and waits in the outbox.` };
    return { kind: 'offline', message: 'Offline — saved, will sync automatically' };
  }
}

async function submitWorkout() {
  const session = state.draft;
  if (!session || !session.sets.length) return toast('Log at least one set first');
  const missing = reviewMissing(session);
  if (missing.length) return toast(`Add ${missing[0]} first`, 'error');
  session.finishedAt = session.finishedAt || nowISO(); // set when Finish workout was tapped (older drafts: now)
  session.synced = false;

  // Outbox first, then history, then clear the draft: nothing is ever lost between these steps.
  state.outbox = [...state.outbox.filter((s) => s.id !== session.id), session];
  save(KEYS.outbox, state.outbox);
  addToHistory(session);
  updateCalorieTarget(); // workout calories are part of the daily burn
  state.draft = null;
  saveDraft();
  detectMissed(); // a late entry for a day already marked missed takes the mark back
  state.ui.form = null;
  state.ui.timer = null;
  state.ui.submit = { status: 'sending', message: '', session };
  render();

  const result = await uploadSession(session);
  state.ui.submit = { status: result.kind, message: result.message, session };
  render();
  if (result.kind === 'ok' && state.missedOutbox.length) syncOutbox(); // e.g. a missed mark this workout took back
  if (result.kind === 'ok') {
    setTimeout(() => {
      if (route().name === 'review' && state.ui.submit.status === 'ok') {
        state.ui.submit = { status: 'idle', message: '', session: null };
        toast(result.message);
        go('home');
      }
    }, 1400);
  }
}

/** Send waiting measurements (same idempotent pattern as workouts: the Sheet ignores an Entry ID it already has). */
async function syncMeasurementOutbox() {
  let sent = 0;
  for (const entry of [...state.mOutbox]) {
    try {
      await apiPost({ action: 'measure', entry });
    } catch {
      break;
    }
    state.mOutbox = state.mOutbox.filter((m) => m.id !== entry.id);
    const local = state.measurements.find((m) => m.id === entry.id);
    if (local) local.synced = true;
    save(KEYS.mOutbox, state.mOutbox);
    save(KEYS.measurements, state.measurements);
    sent++;
  }
  return sent;
}

/** Send missed-day changes; the Sheet updates a row with the same Entry ID instead of adding one. */
async function syncMissedOutbox() {
  let sent = 0;
  for (const item of [...state.missedOutbox]) {
    try {
      await apiPost({ action: 'missed', entry: item.entry });
    } catch {
      break; // offline, or the Apps Script is older than v1.5: kept for later
    }
    // Only drop it if no newer change for this id arrived meanwhile.
    state.missedOutbox = state.missedOutbox.filter((x) => x !== item);
    save(KEYS.missedOutbox, state.missedOutbox);
    sent++;
  }
  return sent;
}

async function syncOutbox({ manual = false } = {}) {
  if (
    !state.ui.syncing &&
    haveApi() &&
    (state.mOutbox.length || state.missedOutbox.length || state.smallOutbox.length || state.recoveryOutbox.length || !state.backup.linked || state.backup.dirty)
  ) {
    state.ui.syncing = true;
    try {
      const m = state.mOutbox.length ? await syncMeasurementOutbox() : 0;
      if (state.missedOutbox.length) await syncMissedOutbox();
      if (state.smallOutbox.length) await syncSmallOutbox();
      if (state.recoveryOutbox.length) await syncRecoveryOutbox();
      // A copy found in the Sheet but not answered yet waits for Settings → Settings copy (never overwritten here).
      if (!state.backup.linked && !state.backup.remoteAt) await linkSettingsBackup({ ask: false });
      else if (state.backup.dirty) await uploadSettings();
      if (m) render();
    } finally {
      state.ui.syncing = false;
    }
  }
  if (state.ui.syncing || !state.outbox.length) {
    if (manual && !state.outbox.length) toast('Nothing waiting to sync');
    return;
  }
  if (!haveApi()) {
    if (manual) toast('Add the script URL and token in Settings', 'error');
    return;
  }
  state.ui.syncing = true;
  if (manual) render();
  let sent = 0;
  let last = null;
  try {
    for (const session of [...state.outbox]) {
      last = await uploadSession(session);
      if (last.kind !== 'ok') break; // offline or rejected: the rest would fail the same way
      sent += 1;
    }
  } finally {
    state.ui.syncing = false;
  }
  if (manual) {
    if (last && last.kind !== 'ok') toast(last.kind === 'offline' ? 'Still offline — will retry later' : last.message, 'error');
    else toast(`Synced ${sent} workout${sent === 1 ? '' : 's'}`);
  } else if (sent) {
    toast(`Synced ${sent} workout${sent === 1 ? '' : 's'} to the Sheet`);
  }
  render();
}

async function syncHistoryFromSheet(quiet = false) {
  if (!haveApi()) return toast('Add the script URL and token in More → Google Sheet', 'error');
  if (state.ui.syncing) return;
  state.ui.syncing = true;
  state.ui.historySync = quiet ? '' : 'Fetching from the Sheet…';
  render();
  try {
    const data = await apiGet({ action: 'history', days: 400 });
    const incoming = Array.isArray(data.sessions) ? data.sessions : [];
    const byId = new Map(state.history.map((s) => [s.id, s]));
    for (const raw of incoming) {
      const s = normaliseSession(raw);
      if (!s) continue;
      s.synced = true;
      // A workout already on this phone keeps its local copy, which can hold more detail than the Sheet rows.
      const local = byId.get(s.id);
      if (local) local.synced = true;
      else byId.set(s.id, s);
    }
    state.history = [...byId.values()]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.finishedAt || '').localeCompare(a.finishedAt || ''))
      .slice(0, HISTORY_LIMIT);
    save(KEYS.history, state.history);
    await syncMissedFromSheet();
    await syncSmallFromSheet();
    detectMissed();
    state.ui.historySync = quiet ? '' : `Loaded ${incoming.length} workout${incoming.length === 1 ? '' : 's'} from the last 400 days.`;
  } catch (err) {
    state.ui.historySync = quiet ? '' : describeError(err);
  } finally {
    state.ui.syncing = false;
  }
  render();
}

async function syncMeasurementsFromSheet(quiet = false) {
  if (!haveApi()) return toast('Add the script URL and token in More → Google Sheet', 'error');
  if (state.ui.syncing) return;
  state.ui.syncing = true;
  render();
  try {
    const data = await apiGet({ action: 'measurements' });
    const incoming = Array.isArray(data.entries) ? data.entries : [];
    const byId = new Map(state.measurements.map((m) => [m.id, m]));
    for (const e of incoming) {
      if (!e || !e.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) continue;
      const values = {};
      for (const [k, v] of Object.entries(e.values || {})) if (v !== '' && Number.isFinite(Number(v))) values[k] = Number(v);
      byId.set(String(e.id), { id: String(e.id), date: String(e.date), kind: e.kind === 'weighin' ? 'weighin' : 'checkin', values, notes: String(e.notes || ''), savedAt: e.savedAt || '', synced: true });
    }
    state.measurements = [...byId.values()];
    save(KEYS.measurements, state.measurements);
    if (!quiet) toast(`Loaded ${incoming.length} measurement entr${incoming.length === 1 ? 'y' : 'ies'}`);
  } catch (err) {
    if (!quiet) toast(describeError(err), 'error');
  } finally {
    state.ui.syncing = false;
  }
  render();
}

function normaliseSession(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id || !Array.isArray(raw.sets)) return null;
  return {
    id: String(raw.id),
    date: String(raw.date || '').slice(0, 10),
    dayType: String(raw.dayType || 'Workout'),
    startedAt: raw.startedAt || null,
    finishedAt: raw.finishedAt || null,
    notes: String(raw.notes || ''),
    avgHeartRate: raw.avgHeartRate ? Number(raw.avgHeartRate) : null,
    activeCalories: raw.activeCalories ? Number(raw.activeCalories) : null,
    satisfaction: raw.satisfaction && typeof raw.satisfaction === 'object' ? raw.satisfaction : {},
    score: raw.score ? Number(raw.score) : null,
    synced: true,
    sets: raw.sets.map((s, i) => ({
      id: s.id || `${raw.id}-${i}`,
      exercise: String(s.exercise || ''),
      setNo: Number(s.setNo) || i + 1,
      reps: s.reps === null || s.reps === '' || s.reps === undefined ? null : Number(s.reps),
      toFailure: Boolean(s.toFailure),
      rir: s.rir === null || s.rir === '' || s.rir === undefined || !Number.isFinite(Number(s.rir)) ? null : Number(s.rir),
      warmup: Boolean(s.warmup),
      weightKg: Number(s.weightKg) || 0,
      loggedAt: s.loggedAt || raw.startedAt || '',
    })),
  };
}

/* ------------------------------------------------------------------- boot */

// The Progress / Body / Photos screens (track.js) bring their own handlers.
Object.assign(actions, trackActions);
Object.assign(changes, trackChanges);
Object.assign(inputs, trackInputs);

function bindEvents() {
  const app = document.getElementById('app');
  Charts.bind(app);
  document.getElementById('camera').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (b) camAction(b.dataset.cam);
  });
  // Any tap on the photo screen restarts the vault's auto-lock countdown.
  app.addEventListener('pointerdown', () => {
    if (route().name === 'photos') touchVault();
  });
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  app.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    const fn = el && changes[el.dataset.change];
    if (fn) fn(el, e);
  });
  app.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    const fn = el && inputs[el.dataset.input];
    if (fn) fn(el, e);
  });
  // The file pickers live outside #app (index.html) so a re-render while the iPhone camera or Files is open
  // cannot replace the input and drop the chosen file.
  for (const el of document.querySelectorAll('#pickers [data-change]')) {
    el.addEventListener('change', (e) => changes[el.dataset.change]?.(el, e));
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('online', () => syncOutbox());
  document.addEventListener('visibilitychange', () => {
    // Leaving the app (home screen, app switcher, lock) locks the vault and clears decrypted photos at once.
    // Not while the Face ID sheet is up: iOS may report the page hidden behind it, and setup needs the open vault.
    if (document.visibilityState === 'hidden' && !faceIdBusy && (Vault.isUnlocked() || state.ui.vault.items.length)) {
      lockVault();
      if (route().name === 'photos') render();
    }
    if (document.visibilityState === 'visible') {
      if (detectMissed() && route().name === 'home') render(); // a new day may have passed
      syncOutbox();
      refreshRecovery();
      refreshExercises();
      if (route().name === 'entry') tickTimer();
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* offline shell is a nicety; the app works without it */
  });
}

/** Fetch the Shortcut's numbers and redraw Home if they arrived. */
function refreshRecovery(force = false) {
  fetchRecovery({ force }).then((got) => {
    if (got && route().name === 'home') render();
  });
}

bindEvents();
detectMissed();
updateCalorieTarget();
render();
registerServiceWorker();
syncOutbox();
refreshRecovery();
refreshExercises();
