'use strict';

/* Bhimlekha (भीमलेखा, "Bhima's record") — vanilla JS, no build step.
   One `state` object; each screen is re-rendered from it after every change.
   Everything the user does is saved to localStorage at once, so killing Safari loses nothing. */

const APP_VERSION = '1.4.0';
const HISTORY_LIMIT = 400;
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_REPS = [6, 8, 10, 12, 14]; // even numbers 5–15 (owner's choice); editable in Settings; Other and Failure always follow
const DEFAULT_QUESTIONS = ['Energy', 'Strength', 'Focus', 'Pump', 'Enjoyment']; // satisfaction matrix, 1–5 each
const RIR_CHOICES = [0, 1, 2, 3]; // reps in reserve; 3 means "3 or more"
const DEFAULT_MEASURE_FIELDS = ['Bodyweight (kg)', 'Waist (cm)', 'Chest (cm)', 'Arm L (cm)', 'Arm R (cm)', 'Thigh L (cm)', 'Thigh R (cm)', 'Hips (cm)', 'Neck (cm)'];
const DEFAULT_POSES = ['Front', 'Side', 'Back'];
const MUSCLE_GROUPS = ['Chest', 'Shoulders', 'Triceps', 'Back', 'Rear delts', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Lower back'];
const LOWER_MUSCLES = ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Lower back'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
};

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

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
    cameraTimer: 10, // seconds of countdown on the in-app camera
    autoLockMinutes: 3,
    lastDeload: null, // YYYY-MM-DD of the last lighter week (v1.1; kept as a fallback for `deloads`)
    deloads: [], // [{ start, end }] lighter weeks; their workouts are left out of the progress maths
    snoozeUntil: null, // "Not now" on the recovery alert hides it until this date
    ...savedSettings,
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
  ui: {
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
  const next = base ? Progress.addDays(base, r.schedWeeks * 7) : null;
  const out = { active: null, reasons: [], due: false, snoozed: false, next, last: lastEnd, base };
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
    return `<div class="alert recovery-active" role="status">
      <p class="alert-title">🟢 Lighter week · day ${Math.min(a.day, a.length)} of ${a.length}</p>
      <p class="small" style="margin:0">Ends ${esc(formatDate(a.end))}. ${esc(DELOAD_PLAN)} These workouts are not counted in progress.</p>
      ${buttons ? '<div class="actions"><button type="button" class="btn" data-action="endDeload">End lighter week now</button></div>' : ''}
    </div>`;
  }
  if (rs.due && !rs.snoozed) {
    return `<div class="alert recovery-due" role="alert">
      <p class="alert-title">⚠️ Recovery: lighter week now</p>
      <ul class="reasons">${rs.reasons.map((x) => `<li><strong class="lead">${esc(x.lead)}</strong> ${esc(x.text)}</li>`).join('')}</ul>
      <p class="small" style="margin:0">${esc(r.lengthDays)} days: ${esc(DELOAD_PLAN)}</p>
      ${
        buttons
          ? `<div class="actions">
              <button type="button" class="btn primary-alert" data-action="startDeload">Start lighter week</button>
              <button type="button" class="btn" data-action="snoozeRecovery">Not now (${esc(r.snoozeDays)} days)</button>
            </div>`
          : ''
      }
    </div>`;
  }
  if (where === 'entry') return '';
  if (!rs.next) return `<p class="next-deload">🗓 Lighter week: every ${esc(r.schedWeeks)} weeks, counted from your first workout.</p>`;
  const left = Progress.daysBetween(todayISO(), rs.next);
  const weeksLeft = Math.max(0, Math.ceil(left / 7));
  return `<p class="next-deload">🗓 <strong>Next lighter week:</strong> ${esc(formatDate(rs.next))} · ${
    left <= 0 ? 'due now' : `in ${weeksLeft} week${weeksLeft === 1 ? '' : 's'}`
  }${rs.last ? ` · last one ${esc(formatDate(rs.last, false))}` : ''}${
    rs.snoozed ? ` · alert snoozed until ${esc(formatDate(state.settings.snoozeUntil, false))}` : ''
  }${!r.schedOn ? ' · schedule off' : ''}</p>`;
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
        <h2 id="modal-title">${esc(title)}</h2>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${fields
          .map(
            (f) => `
          <div class="field">
            <label for="modal-${esc(f.key)}">${esc(f.label)}</label>
            <input id="modal-${esc(f.key)}" class="input" value="${esc(f.value ?? '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="off" />
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
      html = renderEntry();
      break;
    case 'review':
      if (!state.draft && !state.ui.submit.session) return go('home');
      html = renderReview();
      break;
    case 'history':
      html = arg ? renderHistoryDetail(arg) : renderHistory();
      break;
    case 'settings':
      html = renderSettings();
      break;
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
  app.innerHTML = html;
  if (name === 'photos') afterPhotosRender();
  if (name === 'entry') tickTimer();
  if (name !== 'review' && state.ui.submit.status !== 'idle' && state.ui.submit.status !== 'sending') {
    state.ui.submit = { status: 'idle', message: '', session: null };
  }
}

function topbar(title, back = null, links = []) {
  return `
    <div class="topbar">
      <div class="row">
        ${back ? `<a class="btn link" href="#${esc(back.href)}">‹ ${esc(back.label)}</a>` : ''}
        ${title ? `<h1 class="card-title">${esc(title)}</h1>` : ''}
      </div>
      <div class="links">${links.map((l) => `<a class="btn link" href="#${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>
    </div>`;
}

function renderHome() {
  const d = state.draft;
  const st = state.ui.start;
  const waiting = state.outbox.length;
  return `
    <div class="topbar">
      <div class="brand">
        <img src="./icons/icon.svg" alt="" width="32" height="32" />
        <h1 class="card-title">Bhimlekha</h1>
      </div>
      <a class="btn link" href="#settings">Settings</a>
    </div>
    <nav class="tabs" aria-label="Sections">
      <a class="btn" href="#history">History</a>
      <a class="btn" href="#progress">Progress</a>
      <a class="btn" href="#body">Body</a>
    </nav>
    ${homeBanners()}
    ${
      d
        ? `<div class="banner">
            <p class="title">Resume workout — ${esc(d.dayType)} · ${d.sets.length} set${d.sets.length === 1 ? '' : 's'} logged</p>
            <p class="small muted" style="margin:0">${esc(formatDate(d.date))}</p>
            <div class="actions">
              <button type="button" class="btn" data-action="resume">Resume</button>
              <button type="button" class="btn danger" data-action="discardDraft">Discard</button>
            </div>
          </div>`
        : ''
    }
    ${
      waiting
        ? `<div class="banner warn">
            <p class="title">${waiting} workout${waiting === 1 ? '' : 's'} waiting to sync</p>
            <p class="small muted" style="margin:0">${
              haveApi() ? 'Will retry when the app opens or comes back online.' : 'Add the script URL and token in Settings first.'
            }</p>
            <div class="actions">
              <button type="button" class="btn" data-action="retryNow" ${state.ui.syncing ? 'disabled' : ''}>${state.ui.syncing ? 'Syncing…' : 'Retry now'}</button>
            </div>
          </div>`
        : ''
    }
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Start workout</h2>
      <fieldset>
        <legend>Day</legend>
        <div class="segments">
          ${DAY_TYPES.map(
            (day) => `
            <label class="seg ${st.dayType === day ? 'selected' : ''}">
              <input type="radio" name="dayType" value="${esc(day)}" data-change="startDay" ${st.dayType === day ? 'checked' : ''} />
              ${esc(day)}
            </label>`,
          ).join('')}
        </div>
      </fieldset>
      ${
        st.dayType === 'Custom'
          ? `<div>
              <label for="custom-day">Day name</label>
              <input id="custom-day" class="input" value="${esc(st.custom)}" placeholder="e.g. Arms" data-input="startCustom" autocomplete="off" />
            </div>`
          : ''
      }
      <div>
        <label for="start-date">Date</label>
        <input id="start-date" type="date" class="input" value="${esc(st.date)}" data-change="startDate" />
      </div>
      <button type="button" class="btn primary" data-action="startWorkout">${d ? 'Start a new workout' : 'Start workout'}</button>
      ${d ? '<p class="hint" style="text-align:center">Starting a new workout keeps the current one until you discard it.</p>' : ''}
    </section>`;
}

/** Weight increases due, the weekly check-in, and photos waiting for a backup. */
function homeBanners() {
  const out = [];
  const all = trackedExercises()
    .map((n) => analyse(n))
    .filter(Boolean);
  out.push(recoveryCard('home'));
  const due = recoveryState().active ? [] : all.filter((a) => a.status.kind === 'increase');
  if (due.length) {
    out.push(`<div class="banner">
      <p class="title">Time to add weight</p>
      ${due.map((a) => `<p class="small" style="margin:2px 0 0">${esc(a.exercise)}: ${esc(fmtKg(a.status.weight))} → ${esc(fmtKg(a.status.nextWeight))} kg</p>`).join('')}
    </div>`);
  }
  const check = checkinState();
  if (check.due) {
    out.push(`<div class="banner">
      <p class="title">${esc(check.title)}</p>
      <p class="small muted" style="margin:0">Measurements and photos, same time and conditions as last week.</p>
      <div class="actions"><a class="btn" href="#body">Open check-in</a></div>
    </div>`);
  }
  const v = state.vaultInfo;
  const weeks = unsavedWeeks();
  // Before the vault is first unlocked in v1.4 the week list is unknown, so fall back to the old photo/backup dates.
  if (weeks.length || (!v.weeksChanged && v.lastPhotoAt && (!v.lastBackupAt || v.lastBackupAt < v.lastPhotoAt))) {
    out.push(`<div class="banner warn">
      <p class="title">Photos not saved to Files yet</p>
      <p class="small muted" style="margin:0">${
        weeks.length ? `${esc(weeks.map((f) => f.split(' - ')[0]).join(', '))}: save the week folder to Files → iCloud Drive → Bhimlekha.` : 'Save your week folders to Files → iCloud Drive → Bhimlekha.'
      }</p>
      <div class="actions"><a class="btn" href="#photos">Open Photos</a></div>
    </div>`);
  }
  return out.join('');
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

function renderEntry() {
  const d = state.draft;
  const f = form();
  const target = state.targets[d.dayType]?.[f.exercise];
  const hint = f.exercise ? lastTimeHint(f.exercise) : '';
  const groups = groupByExercise(d.sets);
  const chips = repsChips().map((c) => {
    const label = c === 'other' ? 'Other' : c === 'failure' ? 'Failure' : c;
    return `<button type="button" class="chip" data-action="reps" data-value="${c}" aria-pressed="${f.reps === c}">${label}</button>`;
  }).join('');
  const sets = [];
  for (let i = 1; i <= f.visibleSets; i++) {
    sets.push(`
      <label class="seg ${f.setNo === i ? 'selected' : ''}">
        <input type="radio" name="setNo" value="${i}" data-change="setNo" ${f.setNo === i ? 'checked' : ''} />
        Set ${i}
      </label>`);
  }
  const cardio = state.cardio[d.dayType];

  return `
    ${topbar('', { href: 'home', label: 'Home' })}
    ${recoveryCard('entry')}
    <section class="card stack">
      <div>
        <h1 class="card-title">Workout entry</h1>
        <p class="subtitle">${esc(d.dayType)} day · ${d.date === todayISO() ? 'Today' : esc(formatDate(d.date))}</p>
      </div>
      <div>
        <label for="exercise">Exercise</label>
        <select id="exercise" class="select" data-change="exercise">${exerciseOptions(f)}</select>
        ${
          f.addingExercise
            ? `<div class="input-row" style="margin-top:8px">
                <input id="new-exercise" class="input" placeholder="New exercise name" value="${esc(state.ui.newExercise)}" data-input="newExercise" autocomplete="off" />
                <button type="button" class="btn" data-action="addExercise">Add</button>
              </div>`
            : ''
        }
        ${target ? `<p class="hint">Plan: ${esc(target)}</p>` : ''}
        ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
        ${f.exercise ? entryStatus(f.exercise) : ''}
      </div>
      <fieldset>
        <legend>Set number</legend>
        <div class="segments">
          ${sets.join('')}
          <button type="button" class="seg plus" data-action="moreSets" aria-label="Add another set number">+</button>
        </div>
      </fieldset>
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
      <div>
        <label for="weight">Weight (kg)</label>
        <input id="weight" class="input" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0 for bodyweight" value="${esc(f.weight)}" data-input="weight" />
      </div>
      <button type="button" class="chip toggle" data-action="toggleWarmup" aria-pressed="${f.warmup}">Warm-up set${f.warmup ? ' ✓' : ''}</button>
      <div id="set-compare" aria-live="polite">${setCompareHtml()}</div>
      <button type="button" class="btn primary" data-action="saveSet">${f.editingId ? 'Update set' : 'Save set'}</button>
      ${f.editingId ? '<button type="button" class="btn ghost secondary" data-action="cancelEdit">Cancel edit</button>' : ''}
    </section>

    ${state.ui.timer ? renderTimer() : ''}

    <section class="card">
      <h2 class="section-title">Logged this workout</h2>
      ${
        groups.size
          ? [...groups.entries()]
              .map(
                ([name, list]) => `
            <div class="group">
              <h3>${esc(name)}</h3>
              ${list
                .map(
                  (s) => `
                <div class="set-row">
                  <div class="what">${esc(describeSet(s))}</div>
                  <button type="button" class="btn icon ghost" data-action="editSet" data-id="${s.id}" aria-label="Edit set ${s.setNo} of ${esc(name)}">✎</button>
                  <button type="button" class="btn icon ghost" data-action="deleteSet" data-id="${s.id}" aria-label="Delete set ${s.setNo} of ${esc(name)}">🗑</button>
                </div>`,
                )
                .join('')}
            </div>`,
              )
              .join('')
          : '<p class="empty">No sets yet. Save your first set above.</p>'
      }
      ${cardio ? `<p class="hint">After lifting: ${esc(cardio)}</p>` : ''}
    </section>

    <button type="button" class="btn secondary" data-action="finishWorkout">Finish workout</button>`;
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
  if (inDeload(state.draft.date)) return '<div class="set-compare"><div class="small">🟢 Lighter week: comparisons are paused. Go easy, with 3–4 reps in reserve.</div></div>';
  const weight = f.weight === '' ? NaN : Number(f.weight);
  const sessions = statsHistory().filter((s) => s.id !== state.draft.id);
  const c = Progress.setComparison(sessions, f.exercise, f.setNo, { weight, reps: formReps(f) }, state.draft.date || todayISO(), state.settings.progression);
  if (!c) return '';
  const delta = (n, unit) => (n > 0 ? `<span class="up">▲ +${esc(fmtKg(n))}${unit}</span>` : n < 0 ? `<span class="down">▼ −${esc(fmtKg(-n))}${unit}</span>` : '<span class="same">● same</span>');
  const parts = [];
  if (c.weightDelta !== null) parts.push(`weight ${delta(c.weightDelta, ' kg')}`);
  parts.push(c.repsDelta !== null ? `reps ${delta(c.repsDelta, '')}` : '<span class="muted">pick reps to compare</span>');
  const warn = [];
  if (c.shortfall) {
    const r = c.shortfall.ref;
    warn.push({ cls: 'shortfall', html: `<strong class="lead">⚠️ ${c.shortfall.days} days below</strong> your ${esc(fmtKg(r.weight))} kg × ${r.reps} of ${esc(formatDate(r.date, false))} on this set` });
  }
  const plan = Progress.parsePlan(planText(state.draft.dayType, f.exercise));
  const capped = c.stagnant && plan && !plan.timed && c.stagnant.best.reps >= plan.max - state.settings.progression.topTolerance;
  if (capped) {
    // Already at the top of the rep range: no more reps are expected until the weight goes up, so not "stagnant".
    warn.push({ cls: 'info', html: `ℹ️ This set is at the top of its range (${c.stagnant.best.reps} reps; the range tops out at ${plan.max}). It moves on when the weight goes up.` });
  } else if (c.stagnant) {
    const b = c.stagnant.best;
    warn.push({ cls: 'stagnant', html: `<strong class="lead">⚠️ Stagnant ${c.stagnant.days} days</strong> no new best on this set since ${esc(fmtKg(b.weight))} kg × ${b.reps} (${esc(formatDate(c.stagnant.since, false))})` });
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
    <div class="timer ${remaining <= 0 ? 'done' : ''}" id="timer" role="timer" aria-label="Rest timer">
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
    <div class="totals">
      <div class="stat"><div class="value">${s.totalSets}</div><div class="label">Sets</div></div>
      <div class="stat"><div class="value">${esc(fmtVolume(s.totalVolume))}</div><div class="label">Volume</div></div>
      <div class="stat"><div class="value">${esc(fmtDuration(s.duration))}</div><div class="label">Duration</div></div>
    </div>
    <table class="summary" style="margin-top:12px">
      <thead><tr><th>Exercise</th><th class="num">Sets</th><th class="num">Best</th><th class="num">Volume</th></tr></thead>
      <tbody>
        ${s.rows
          .map(
            (r) => `<tr>
          <td>${esc(r.name)}</td>
          <td class="num">${r.sets}</td>
          <td class="num">${esc(fmtKg(r.best.weightKg))} kg × ${r.best.toFailure && r.best.reps == null ? 'F' : r.best.reps}</td>
          <td class="num">${esc(fmtVolume(r.volume))}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
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
    return `<div class="insight stack"><h2 class="section-title" style="margin:0">Progress insight</h2>
      <p class="small" style="margin:0">🟢 Lighter-week workout: not compared and not counted in progress, so it cannot set off warnings.</p></div>`;
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
      <h2 class="section-title" style="margin:0">Progress insight</h2>
      <p class="insight-head">${esc(headline.join(' · '))}${totals.length ? `<br /><span class="small muted">vs last time: ${esc(totals.join(', '))}</span>` : ''}</p>
      ${
        rs.due
          ? `<div class="alert recovery-due"><p class="alert-title">⚠️ Recovery: lighter week now</p>
              <ul class="reasons">${rs.reasons.map((x) => `<li><strong class="lead">${esc(x.lead)}</strong> ${esc(x.text)}</li>`).join('')}</ul>
              <p class="small" style="margin:0">Start it from the Home screen.</p></div>`
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
            .map((x) => `<p class="flag">⚠️ ${esc(x)}</p>`)
            .join('');
          return `
          <div class="insight-row">
            <div class="row between"><strong>${esc(a.exercise)}</strong><span class="trend ${t.cls}">${t.icon} ${esc(t.label)}</span></div>
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
    ok: `✅ ${sub.message}`,
    offline: `⚠️ ${sub.message}`,
    rejected: `⚠️ ${sub.message}`,
  }[sub.status];
  return `
    ${topbar('', done || busy ? null : { href: 'entry', label: 'Back to editing' })}
    <section class="card stack">
      <div>
        <h1 class="card-title">Review &amp; submit</h1>
        <p class="subtitle">${esc(session.dayType)} day · ${esc(formatDate(session.date))}</p>
      </div>
      ${renderSummary(session)}
      ${renderInsight(session)}
      ${renderWellbeing(session, busy || done)}
      <div>
        <label for="notes">Notes (optional)</label>
        <textarea id="notes" class="textarea" placeholder="How did it go?" data-input="notes" ${busy || done ? 'disabled' : ''}>${esc(session.notes || '')}</textarea>
      </div>
      ${statusText ? `<div class="status ${esc(sub.status)}" role="status">${esc(statusText)}</div>` : ''}
      ${
        done
          ? '<button type="button" class="btn primary" data-action="submitDone">Done</button>'
          : `<button type="button" class="btn primary" data-action="submitWorkout" ${busy ? 'disabled' : ''}>${busy ? 'Sending…' : 'Submit workout'}</button>`
      }
    </section>`;
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
  return `
    <div class="stack">
      <h2 class="section-title" style="margin:0">How was it?</h2>
      <div class="two">
        <div>
          <label for="avg-hr">Avg heart rate (bpm)</label>
          <input id="avg-hr" class="input" type="number" inputmode="numeric" min="30" max="250" placeholder="e.g. 128" value="${esc(session.avgHeartRate ?? '')}" data-change="avgHeartRate" ${locked ? 'disabled' : ''} />
        </div>
        <div>
          <label for="active-kcal">Active calories (kcal)</label>
          <input id="active-kcal" class="input" type="number" inputmode="numeric" min="0" max="5000" placeholder="e.g. 320" value="${esc(session.activeCalories ?? '')}" data-change="activeCalories" ${locked ? 'disabled' : ''} />
        </div>
      </div>
      ${questions()
        .map(
          (q) => `
        <div class="matrix-row">
          <div class="q">${esc(q)} <span class="small muted">1 = poor · 5 = great</span></div>
          ${scale(q, sat[q], 5, 'rate')}
        </div>`,
        )
        .join('')}
      <div class="matrix-row">
        <div class="q">Overall score <span class="small muted">out of 10</span></div>
        ${scale('score', session.score, 10, 'score')}
      </div>
    </div>`;
}

function wellbeingSummary(session) {
  const bits = [];
  if (session.avgHeartRate) bits.push(`${session.avgHeartRate} bpm`);
  if (session.activeCalories) bits.push(`${session.activeCalories} kcal`);
  if (session.score) bits.push(`${session.score}/10`);
  const sat = session.satisfaction || {};
  const rated = Object.entries(sat).filter(([, v]) => v);
  if (rated.length) bits.push(rated.map(([q, v]) => `${q} ${v}`).join(' · '));
  return bits;
}

function renderHistory() {
  const sessions = sortedHistory();
  return `
    ${topbar('History', { href: 'home', label: 'Home' })}
    <section class="card">
      ${
        sessions.length
          ? `<ul class="list">${sessions
              .map(
                (s) => `
            <li>
              <button type="button" class="list-item" data-action="openSession" data-id="${s.id}">
                <div>
                  <div class="primary-text">${esc(formatDate(s.date))} · ${esc(s.dayType)}</div>
                  <div class="secondary-text">${s.sets.length} set${s.sets.length === 1 ? '' : 's'} · ${esc(fmtVolume(sessionVolume(s)))}${s.score ? ` · ${s.score}/10` : ''}</div>
                </div>
                <span class="badge ${s.synced ? 'ok' : 'pending'}">${s.synced ? '✅ synced' : '⏳ pending'}</span>
              </button>
            </li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">No workouts yet.</p>'
      }
    </section>
    <section class="card stack">
      <button type="button" class="btn secondary" data-action="syncHistory" ${state.ui.syncing ? 'disabled' : ''}>Sync history from Sheet</button>
      ${state.ui.historySync ? `<p class="hint" style="text-align:center">${esc(state.ui.historySync)}</p>` : ''}
    </section>`;
}

function renderHistoryDetail(id) {
  const s = state.history.find((x) => x.id === id);
  if (!s) return `${topbar('History', { href: 'history', label: 'History' })}<p class="empty">This workout is not on this phone.</p>`;
  const groups = groupByExercise(s.sets);
  return `
    ${topbar('', { href: 'history', label: 'History' })}
    <section class="card stack">
      <div class="row between">
        <div>
          <h1 class="card-title">${esc(s.dayType)}</h1>
          <p class="subtitle">${esc(formatDate(s.date))}</p>
        </div>
        <span class="badge ${s.synced ? 'ok' : 'pending'}">${s.synced ? '✅ synced' : '⏳ pending'}</span>
      </div>
      ${renderSummary(s)}
      ${wellbeingSummary(s).length ? `<p class="small">${wellbeingSummary(s).map(esc).join(' · ')}</p>` : ''}
      ${s.notes ? `<p class="small"><strong>Notes:</strong> ${esc(s.notes)}</p>` : ''}
    </section>
    <section class="card">${renderInsight(s) || '<p class="empty">No working sets to compare.</p>'}</section>
    <section class="card">
      <h2 class="section-title">Sets</h2>
      ${[...groups.entries()]
        .map(
          ([name, list]) => `
        <div class="group">
          <h3>${esc(name)}</h3>
          ${list.map((x) => `<div class="set-row"><div class="what">${esc(describeSet(x))}</div></div>`).join('')}
        </div>`,
        )
        .join('')}
    </section>`;
}

function renderSettings() {
  const s = state.settings;
  const ui = state.ui;
  const day = manageDays().includes(ui.manageDay) ? ui.manageDay : manageDays()[0];
  const list = state.exercises[day] || [];
  return `
    ${topbar('Settings', { href: 'home', label: 'Home' })}
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Google Sheet</h2>
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
    </section>

    <section class="card stack">
      <h2 class="section-title" style="margin:0">Logging</h2>
      <div>
        <label for="rest-seconds">Default rest (seconds)</label>
        <input id="rest-seconds" class="input" type="number" inputmode="numeric" min="10" max="900" step="5" value="${esc(s.restSeconds)}" data-change="restSeconds" />
      </div>
      <fieldset>
        <legend>Reps buttons</legend>
        <div class="pills" id="reps-pills">${repsChips()
          .filter((c) => typeof c === 'number')
          .map((n) => `<span class="pill">${n}<button type="button" class="pill-x" data-action="removeRep" data-value="${n}" aria-label="Remove the ${n} reps button">×</button></span>`)
          .join('')}</div>
        <div class="input-row" style="margin-top:8px">
          <label for="rep-new" class="sr-only">New reps button</label>
          <input id="rep-new" class="input" type="number" inputmode="numeric" min="1" max="999" placeholder="Add a reps button, e.g. 11" value="${esc(ui.newRep)}" data-input="newRep" />
          <button type="button" class="btn" data-action="addRep">Add</button>
        </div>
        <p class="hint">Shown in number order. "Other" (any number) and "Failure" always follow them.</p>
      </fieldset>
      <label class="check">
        <input type="checkbox" data-change="requireRir" ${s.requireRir ? 'checked' : ''} />
        Ask for reps in reserve (RIR) on every working set
      </label>
    </section>

    ${renderProgressionSettings()}
    ${renderRecoverySettings()}
    ${renderBodySettings()}

    <section class="card stack">
      <h2 class="section-title" style="margin:0">End-of-workout questions</h2>
      <p class="hint" style="margin:0">Each is rated 1–5 on the Review screen, next to heart rate, calories and the score out of 10.</p>
      ${
        questions().length
          ? `<ul class="list" id="question-list">${questions()
              .map(
                (q, i) => `
            <li>
              <div class="exercise-row">
                <div class="name">${esc(q)}</div>
                <button type="button" class="btn icon ghost" data-action="moveQuestion" data-index="${i}" data-dir="-1" aria-label="Move ${esc(q)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn icon ghost" data-action="moveQuestion" data-index="${i}" data-dir="1" aria-label="Move ${esc(q)} down" ${i === questions().length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn icon ghost" data-action="renameQuestion" data-index="${i}" aria-label="Rename ${esc(q)}">✎</button>
                <button type="button" class="btn icon ghost" data-action="removeQuestion" data-index="${i}" aria-label="Remove ${esc(q)}">🗑</button>
              </div>
            </li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">No questions. The score out of 10 still shows.</p>'
      }
      <div class="input-row">
        <label for="question-new" class="sr-only">New question</label>
        <input id="question-new" class="input" placeholder="New question, e.g. Sleep" value="${esc(ui.newQuestion)}" data-input="newQuestion" autocomplete="off" />
        <button type="button" class="btn" data-action="addQuestion">Add</button>
      </div>
    </section>

    <section class="card stack">
      <h2 class="section-title" style="margin:0">Exercises</h2>
      <div>
        <label for="manage-day">Day</label>
        <select id="manage-day" class="select" data-change="manageDay">
          ${manageDays()
            .map((d) => `<option value="${esc(d)}" ${d === day ? 'selected' : ''}>${esc(d)}</option>`)
            .join('')}
        </select>
      </div>
      ${
        list.length
          ? `<ul class="list" id="exercise-list">${list
              .map(
                (name, i) => `
            <li>
              <div class="exercise-row">
                <div class="name">
                  ${esc(name)}
                  ${state.targets[day]?.[name] ? `<span class="small muted">Plan: ${esc(state.targets[day][name])}</span>` : ''}
                  ${
                    muscleOf(name) || state.settings.steps?.[name]
                      ? `<span class="small muted">${esc([muscleOf(name), state.settings.steps?.[name] ? `step ${fmtKg(state.settings.steps[name])} kg` : ''].filter(Boolean).join(' · '))}</span>`
                      : ''
                  }
                </div>
                <button type="button" class="btn icon ghost" data-action="moveExercise" data-index="${i}" data-dir="-1" aria-label="Move ${esc(name)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn icon ghost" data-action="moveExercise" data-index="${i}" data-dir="1" aria-label="Move ${esc(name)} down" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn icon ghost" data-action="renameExercise" data-index="${i}" aria-label="Rename ${esc(name)}">✎</button>
                <button type="button" class="btn icon ghost" data-action="removeExercise" data-index="${i}" aria-label="Remove ${esc(name)}">🗑</button>
              </div>
            </li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">No exercises for this day yet.</p>'
      }
      <div class="input-row">
        <label for="manage-new" class="sr-only">New exercise</label>
        <input id="manage-new" class="input" placeholder="New exercise" value="${esc(ui.manageNew)}" data-input="manageNew" autocomplete="off" />
        <button type="button" class="btn" data-action="manageAdd">Add</button>
      </div>
      <div>
        <label for="cardio-note">After lifting (cardio or finisher)</label>
        <input id="cardio-note" class="input" placeholder="e.g. Incline walk, 15 min" value="${esc(state.cardio[day] || '')}" data-change="cardioNote" autocomplete="off" />
      </div>
    </section>

    <section class="card stack">
      <h2 class="section-title" style="margin:0">Backup</h2>
      <button type="button" class="btn secondary" data-action="exportData">Export local data (JSON)</button>
      <button type="button" class="btn secondary" data-action="importData">Import from JSON…</button>
      <input id="import-file" type="file" accept="application/json,.json" class="sr-only" data-change="importFile" />
      <p class="hint">The export includes workouts, measurements, settings, your script URL and token so a new phone can be set up from it. Keep the file private. Photos are not in it: they have their own encrypted backup on the Photos screen.</p>
    </section>
    <p class="version">Bhimlekha v${esc(APP_VERSION)} · भीमलेखा</p>`;
}

// Every progression assumption, editable. [key, label, hint, step]
const PROGRESSION_FIELDS = [
  ['readyRir', 'Reps in reserve needed on every set', 'A set counts as "easy" with at least this many reps left.', 1],
  ['topTolerance', 'Reps below the top still counted', '1 means 11 of 12 counts as reaching the top.', 1],
  ['readySessions', 'Sessions in a row at the target', 'How many times the target must be hit before adding weight.', 1],
  ['readyMinDays', 'Week timer (days)', 'The first and last of those sessions must be at least this far apart.', 1],
  ['stepUpper', 'Weight step, upper body (kg)', 'Override per exercise in Exercises below.', 0.5],
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
];

function renderProgressionSettings() {
  const p = state.settings.progression;
  return `
    <section class="card stack">
      <div>
        <h2 class="section-title" style="margin:0">Progression</h2>
        <p class="hint">Double progression: keep the weight until every set reaches the top of the plan's rep range with reps in reserve, in enough sessions spread over the week timer, then add a step. Rep ranges come from each exercise's plan (Exercises below).</p>
      </div>
      <div class="two">
        ${PROGRESSION_FIELDS.map(
          ([key, label, hint, step]) => `<div>
            <label for="prog-${key}">${esc(label)}</label>
            <input id="prog-${key}" class="input" type="number" inputmode="decimal" min="0" step="${step}" value="${esc(p[key])}" data-change="progression" data-key="${key}" />
            ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
          </div>`,
        ).join('')}
      </div>
      <button type="button" class="btn secondary" data-action="resetProgression">Restore the defaults</button>
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
  const num = (key, label, step) => `<div>
      <label for="rec-${key}">${esc(label)}</label>
      <input id="rec-${key}" class="input" type="number" inputmode="decimal" min="0" step="${step}" value="${esc(r[key])}" data-change="recoveryNum" data-key="${key}" />
    </div>`;
  return `
    <section class="card stack">
      <div>
        <h2 class="section-title" style="margin:0">Recovery (lighter week)</h2>
        <p class="hint">The alert fires when any switched-on trigger is met. Workouts during a lighter week are left out of progress, so they never set off warnings.</p>
      </div>
      ${RECOVERY_TRIGGERS.map(
        ([on, title, fields]) => `<fieldset class="trigger">
          <label class="check"><input type="checkbox" data-change="recoveryToggle" data-key="${on}" ${r[on] ? 'checked' : ''} /> ${esc(title)}</label>
          <div class="two">${fields.map(([k, l, s]) => num(k, l, s)).join('')}</div>
        </fieldset>`,
      ).join('')}
      <div class="two">
        ${num('lengthDays', 'Lighter week length (days)', 1)}
        ${num('snoozeDays', '"Not now" hides it for (days)', 1)}
      </div>
      <button type="button" class="btn secondary" data-action="resetRecovery">Restore the defaults</button>
    </section>`;
}

function renderBodySettings() {
  const s = state.settings;
  const ui = state.ui;
  const listEditor = (items, removeAction, moveAction) =>
    `<ul class="list">${items
      .map(
        (f, i) => `<li><div class="exercise-row">
          <div class="name">${esc(f)}</div>
          <button type="button" class="btn icon ghost" data-action="${moveAction}" data-index="${i}" data-dir="-1" aria-label="Move ${esc(f)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn icon ghost" data-action="${moveAction}" data-index="${i}" data-dir="1" aria-label="Move ${esc(f)} down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn icon ghost" data-action="${removeAction}" data-index="${i}" aria-label="Remove ${esc(f)}">🗑</button>
        </div></li>`,
      )
      .join('')}</ul>`;
  return `
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Body & photos</h2>
      <div>
        <label for="checkin-day">Check-in day</label>
        <select id="checkin-day" class="select" data-change="checkinDay">
          ${WEEKDAYS.map((d, i) => `<option value="${i}" ${Number(s.checkinDay) === i ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
        <p class="hint">Photo folders run to this day: a Sunday check-in makes each week Monday to Sunday.</p>
      </div>
      <div>
        <label for="program-start">Week 1 starts in the week of</label>
        <input id="program-start" class="input" type="date" value="${esc(s.programStart || '')}" data-change="programStart" />
        <p class="hint">${
          s.programStart ? 'Clear it to count from your first logged workout.' : `Blank: your first logged workout${programStart() ? ` (${esc(formatDate(programStart()))})` : ''}.`
        } Names the Files folders, e.g. "${esc(photoWeek(todayISO()).folder)}".</p>
      </div>
      <fieldset>
        <legend>Measurements</legend>
        ${listEditor(measureFields(), 'removeField', 'moveField')}
        <div class="input-row" style="margin-top:8px">
          <label for="field-new" class="sr-only">New measurement</label>
          <input id="field-new" class="input" placeholder="e.g. Calf (cm)" value="${esc(ui.newField)}" data-input="newField" autocomplete="off" />
          <button type="button" class="btn" data-action="addField">Add</button>
        </div>
        <p class="hint">Put the unit in brackets. A field with "weight" in its name is the bodyweight. Each one becomes a column in the Sheet's Measurements tab.</p>
      </fieldset>
      <fieldset>
        <legend>Photo poses</legend>
        ${listEditor(poses(), 'removePose', 'movePose')}
        <div class="input-row" style="margin-top:8px">
          <label for="pose-new" class="sr-only">New pose</label>
          <input id="pose-new" class="input" placeholder="e.g. Front flexed" value="${esc(ui.newPose)}" data-input="newPose" autocomplete="off" />
          <button type="button" class="btn" data-action="addPose">Add</button>
        </div>
      </fieldset>
      <div class="two">
        <div>
          <label for="cam-timer">Camera timer (s)</label>
          <input id="cam-timer" class="input" type="number" inputmode="numeric" min="0" max="30" value="${esc(s.cameraTimer)}" data-change="cameraTimer" />
        </div>
        <div>
          <label for="auto-lock">Vault auto-lock (min)</label>
          <input id="auto-lock" class="input" type="number" inputmode="numeric" min="1" max="60" value="${esc(s.autoLockMinutes)}" data-change="autoLockMinutes" />
        </div>
      </div>
    </section>`;
}

/* -------------------------------------------------------------- rest timer */

let timerHandle = null;

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
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  finishWorkout() {
    if (!state.draft.sets.length) return toast('Log at least one set first', 'error');
    go('review');
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
  startDay(el) {
    state.ui.start.dayType = el.value;
    render();
    if (el.value === 'Custom') document.getElementById('custom-day')?.focus();
  },
  startDate(el) {
    state.ui.start.date = el.value;
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
  },
  activeCalories(el) {
    if (!state.draft) return;
    const v = Number(el.value);
    state.draft.activeCalories = el.value === '' || !Number.isFinite(v) ? null : Math.round(v);
    saveDraft();
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
  notes(el) {
    if (state.draft) {
      state.draft.notes = el.value;
      saveDraft();
    }
  },
};

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
  session.finishedAt = nowISO();
  session.synced = false;

  // Outbox first, then history, then clear the draft: nothing is ever lost between these steps.
  state.outbox = [...state.outbox.filter((s) => s.id !== session.id), session];
  save(KEYS.outbox, state.outbox);
  addToHistory(session);
  state.draft = null;
  saveDraft();
  state.ui.form = null;
  state.ui.timer = null;
  state.ui.submit = { status: 'sending', message: '', session };
  render();

  const result = await uploadSession(session);
  state.ui.submit = { status: result.kind, message: result.message, session };
  render();
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

async function syncOutbox({ manual = false } = {}) {
  if (!state.ui.syncing && state.mOutbox.length && haveApi()) {
    state.ui.syncing = true;
    try {
      if (await syncMeasurementOutbox()) render();
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

async function syncHistoryFromSheet() {
  if (!haveApi()) return toast('Add the script URL and token in Settings', 'error');
  if (state.ui.syncing) return;
  state.ui.syncing = true;
  state.ui.historySync = 'Fetching from the Sheet…';
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
    state.ui.historySync = `Loaded ${incoming.length} workout${incoming.length === 1 ? '' : 's'} from the last 400 days.`;
  } catch (err) {
    state.ui.historySync = describeError(err);
  } finally {
    state.ui.syncing = false;
  }
  render();
}

async function syncMeasurementsFromSheet() {
  if (!haveApi()) return toast('Add the script URL and token in Settings', 'error');
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
    toast(`Loaded ${incoming.length} measurement entr${incoming.length === 1 ? 'y' : 'ies'}`);
  } catch (err) {
    toast(describeError(err), 'error');
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
      syncOutbox();
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

bindEvents();
render();
registerServiceWorker();
syncOutbox();
