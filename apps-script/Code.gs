/**
 * Bhimlekha (workout tracker) — Google Apps Script backend.
 *
 * Paste this whole file into the Apps Script editor bound to your Google Sheet (Extensions → Apps Script),
 * run setup() once, set the TOKEN script property, then deploy as a Web app (Execute as Me, access: Anyone).
 *
 * The web app accepts:
 *   POST {scriptUrl}                       body: { token, action: "submit", session: {...} }
 *   POST {scriptUrl}                       body: { token, action: "measure", entry: {...} }
 *   GET  {scriptUrl}?action=ping&token=…
 *   GET  {scriptUrl}?action=history&token=…&days=120
 *   GET  {scriptUrl}?action=measurements&token=…
 *   POST {scriptUrl}                       body: { token, action: "missed", entry: {...} }
 *   GET  {scriptUrl}?action=missed&token=…
 *   POST {scriptUrl}                       body: { token, action: "small", entry: {...} }
 *   GET  {scriptUrl}?action=small&token=…
 *   POST {scriptUrl}                       body: { token, action: "settings", data: {...}, savedAt }
 *   GET  {scriptUrl}?action=settings&token=…
 *   POST {scriptUrl}                       body: { token, action: "recovery", entry: {...} }       (the app)
 *   POST {scriptUrl}                       body: { token, action: "recovery", sleep, rhr, hrv }    (iPhone Shortcut)
 *   GET  {scriptUrl}?action=recovery&token=…&days=60
 *   POST {scriptUrl}                       body: { token, action: "exercises", rows: [...] }  (seed, empty tab only)
 *   GET  {scriptUrl}?action=exercises&token=…
 *   POST {scriptUrl}                       body: { token, action: "exerciseUpsert", row: {...} }   (add or update a row)
 *   POST {scriptUrl}                       body: { token, action: "exerciseAlias", name, alias }  (another name for a row)
 *   POST {scriptUrl}                       body: { token, action: "exerciseSetup", muscles: [...] } (muscle dropdowns)
 *
 * Log: one row per set. Writing is idempotent by Session ID: submitting the same session twice adds
 * nothing and returns { ok: true, duplicate: true, rows: 0 }.
 * Measurements: one row per check-in or weigh-in, idempotent by Entry ID. Each measurement field (e.g.
 * "Waist (cm)") has its own column; a field added in the app's Settings gets a new column automatically.
 * Missed: one row per scheduled workout day with no workout, with the reason. Rewritten in place when the
 * reason changes (same Entry ID), deleted when the app takes it back (a workout was logged for that date).
 * Small workouts: one row per "Small workout" check-in (date, time, optional notes), rewritten in place when
 * edited in the app (same Entry ID) and deleted when deleted there.
 * Settings: one row holding the app's settings as JSON (exercises, plans, schedule…; never the URL or token),
 * so a new phone can restore them.
 * Progress photos never come here: they stay encrypted on the phone.
 */

var SHEET_NAME = 'Log';
var M_SHEET_NAME = 'Measurements';
var M_FIXED = ['Timestamp', 'Date', 'Entry ID', 'Type', 'Notes'];
var X_SHEET_NAME = 'Missed';
var X_HEADERS = ['Timestamp', 'Date', 'Weekday', 'Day', 'Reason', 'Note', 'Entry ID'];
var W_SHEET_NAME = 'Small workouts';
var W_HEADERS = ['Timestamp', 'Date', 'Time', 'Notes', 'Entry ID'];
var S_SHEET_NAME = 'Settings';
var S_HEADERS = ['Saved at', 'Settings (JSON, written by the app)'];
var HEADERS = [
  'Timestamp',
  'Date',
  'Session ID',
  'Day',
  'Exercise',
  'Set #',
  'Reps',
  'To failure',
  'Weight (kg)',
  'Volume (kg)',
  'Session notes',
  'Avg HR (bpm)',
  'Active kcal',
  'Score /10',
  'Satisfaction',
  'RIR',
  'Warm-up',
  'Duration (min)',
  // v2.8: so a reinstalled phone gets every workout back exactly (first row of a session only).
  'Light day',
  'Made up (JSON)',
  'No watch',
];
var R_SHEET_NAME = 'Recovery';
// One row per day. The iPhone Shortcut writes sleep, resting HR and HRV each morning; the app adds the Watch sleep
// score, soreness and the recovery score it works out. Each writer only fills the cells it sends.
var R_HEADERS = ['Date', 'Sleep (h)', 'Sleep score', 'Resting HR (bpm)', 'HRV (ms)', 'Soreness (1-10)', 'Recovery score', 'Updated at', 'Source'];
var R_FIELDS = { sleepHours: 2, sleepScore: 3, rhr: 4, hrv: 5, soreness: 6, score: 7 };
var E_SHEET_NAME = 'Exercises';
// The exercise database for the muscle map: one row per exercise. Muscles are written by their gym names, separated
// by commas. The app writes its starting list once (only into an empty tab); after that the owner edits it here.
// "Also called" (v2.2): other names the owner uses for the same exercise, separated by commas; the app matches them
// to this row. The app adds rows and aliases here itself (exerciseUpsert / exerciseAlias) and sets a dropdown of the
// muscle names on the two muscle columns (exerciseSetup).
// v2.3: 'Tertiary muscles' (a quarter set each) is the last column, so older tabs keep their columns.
var E_HEADERS = ['Exercise', 'Equipment', 'Main muscles', 'Helping muscles', 'Notes', 'Also called', 'Tertiary muscles'];
// Column numbers (1-based) used below. Notes to Satisfaction are per-session and filled on a session's first row
// only; RIR (reps in reserve, 3 = "3 or more") and Warm-up are per set and were added after the first version.
var COL = {
  timestamp: 1, date: 2, sessionId: 3, day: 4, exercise: 5, setNo: 6, reps: 7, toFailure: 8, weight: 9, volume: 10,
  notes: 11, avgHr: 12, kcal: 13, score: 14, satisfaction: 15, rir: 16, warmup: 17, duration: 18,
  light: 19, madeUp: 20, noWatch: 21,
};

/**
 * Run this once from the editor. Creates the Log sheet with its header row and prints the next steps.
 */
function setup() {
  var sheet = getLogSheet_();
  Logger.log('Sheet "%s" is ready with %s columns.', sheet.getName(), HEADERS.length);
  var m = getMeasureSheet_();
  Logger.log('Sheet "%s" is ready.', m.getName());
  Logger.log('Sheet "%s" is ready.', getMissedSheet_().getName());
  Logger.log('Sheet "%s" is ready.', getSmallSheet_().getName());
  Logger.log('Sheet "%s" is ready.', getSettingsSheet_().getName());
  Logger.log('Sheet "%s" is ready.', getRecoverySheet_().getName());
  Logger.log('Sheet "%s" is ready.', getExerciseSheet_().getName());
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (token) {
    Logger.log('TOKEN is set. Deploy → New deployment → Web app (Execute as Me, Anyone) and copy the /exec URL.');
  } else {
    Logger.log('Next: Project Settings (gear icon) → Script Properties → Add property: TOKEN = a long random string.');
    Logger.log('Then Deploy → New deployment → Web app → Execute as Me → Who has access: Anyone → copy the /exec URL.');
  }
}

/** The Log sheet, created with a bold frozen header row if it does not exist yet. */
function getLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    if (sheet.getMaxColumns() < HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, COL.date, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@'); // keep dates as text
  } else {
    ensureHeaders_(sheet);
  }
  return sheet;
}

/**
 * When a newer Code.gs adds columns, an existing Log sheet gets the missing header cells filled in automatically
 * (only blank cells are written; headers you renamed yourself are left alone). Old rows simply stay blank there.
 */
function ensureHeaders_(sheet) {
  if (sheet.getMaxColumns() < HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  var range = sheet.getRange(1, 1, 1, HEADERS.length);
  var current = range.getValues()[0];
  var changed = false;
  for (var i = 0; i < HEADERS.length; i++) {
    if (current[i] === '' || current[i] === null || current[i] === undefined) {
      current[i] = HEADERS[i];
      changed = true;
    }
  }
  if (changed) range.setValues([current]).setFontWeight('bold');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return Boolean(expected) && typeof token === 'string' && token === expected;
}

/** GET: ping and history. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!authorized_(p.token)) return json_({ ok: false, error: 'unauthorized' });
  try {
    if (p.action === 'ping') return json_({ ok: true, sheet: SHEET_NAME });
    if (p.action === 'history') return json_({ ok: true, sessions: history_(Number(p.days) || 120) });
    if (p.action === 'measurements') return json_({ ok: true, entries: measurements_() });
    if (p.action === 'missed') return json_({ ok: true, entries: missedList_() });
    if (p.action === 'small') return json_({ ok: true, entries: smallList_() });
    if (p.action === 'settings') return json_(readSettings_());
    if (p.action === 'recovery') return json_({ ok: true, entries: recoveryList_(Number(p.days) || 60) });
    if (p.action === 'exercises') return json_({ ok: true, rows: exerciseRows_() });
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** POST: submit a finished session. The body is a JSON string sent as text/plain (no CORS preflight). */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  if (!authorized_(body.token)) return json_({ ok: false, error: 'unauthorized' });
  if (body.action === 'measure') return measure_(body.entry);
  if (body.action === 'missed') return missed_(body.entry);
  if (body.action === 'small') return small_(body.entry);
  if (body.action === 'settings') return writeSettings_(body.data, body.savedAt);
  if (body.action === 'draft') return writeDraft_(body.draft, body.savedAt); // v2.8: the open workout, after every set
  // The iPhone Shortcut sends a flat body ({ token, action, sleep, rhr, hrv }); the app sends { entry: {...} }.
  if (body.action === 'recovery') return recovery_(body.entry || body, body.entry ? 'app' : 'shortcut');
  if (body.action === 'exercises') return seedExercises_(body.rows);
  if (body.action === 'exerciseUpsert') return upsertExercise_(body.row);
  if (body.action === 'exerciseAlias') return aliasExercise_(body.name, body.alias);
  if (body.action === 'exerciseSetup') return setupExercises_(body.muscles);
  if (body.action !== 'submit') return json_({ ok: false, error: 'unknown action' });

  var session = body.session;
  if (!session || typeof session.id !== 'string' || !session.id || !Array.isArray(session.sets)) {
    return json_({ ok: false, error: 'bad session' });
  }
  if (!session.sets.length) return json_({ ok: false, error: 'no sets' });

  // One writer at a time, so two retries of the same session cannot both pass the duplicate check.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getLogSheet_();
    if (hasSession_(sheet, session.id)) return json_({ ok: true, duplicate: true, rows: 0 });
    var rows = buildRows_(session);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    return json_({ ok: true, duplicate: false, rows: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/** True when a row with this Session ID is already in column C. */
function hasSession_(sheet, sessionId) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var ids = sheet.getRange(2, COL.sessionId, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === sessionId) return true;
  }
  return false;
}

/** "Energy 4 · Strength 3" from { Energy: 4, Strength: 3 }: one cell, readable, and the questions can change. */
function satisfactionText_(sat) {
  if (!sat || typeof sat !== 'object') return '';
  return Object.keys(sat)
    .filter(function (k) { return sat[k] !== null && sat[k] !== '' && sat[k] !== undefined; })
    .map(function (k) { return k + ' ' + sat[k]; })
    .join(' · ');
}

function parseSatisfaction_(text) {
  var out = {};
  String(text || '')
    .split(' · ')
    .forEach(function (part) {
      var i = part.lastIndexOf(' ');
      if (i > 0) {
        var v = Number(part.slice(i + 1));
        if (!isNaN(v)) out[part.slice(0, i)] = v;
      }
    });
  return out;
}

function numberOrBlank_(v) {
  var n = Number(v);
  return v === null || v === undefined || v === '' || isNaN(n) ? '' : n;
}

/** Minutes from the first logged set (or the start) to finishedAt, or blank. */
function durationMinutes_(session) {
  var times = session.sets.map(function (s) { return Date.parse(s.loggedAt); }).filter(function (t) { return !isNaN(t); });
  var start = times.length ? Math.min.apply(null, times) : Date.parse(session.startedAt);
  var end = Date.parse(session.finishedAt);
  if (isNaN(start) || isNaN(end) || end < start) return '';
  return Math.round((end - start) / 60000);
}

/** One row per set, in the column order of HEADERS. Notes, heart rate, calories, score and satisfaction go on
    the first row of the session only. */
function buildRows_(session) {
  var notes = String(session.notes || '');
  var rows = [];
  for (var i = 0; i < session.sets.length; i++) {
    var s = session.sets[i];
    var reps = s.reps === null || s.reps === undefined || s.reps === '' ? null : Number(s.reps);
    var weight = Number(s.weightKg) || 0;
    var volume = reps === null ? 0 : reps * weight;
    var logged = s.loggedAt ? new Date(s.loggedAt) : new Date();
    if (isNaN(logged.getTime())) logged = new Date();
    rows.push([
      logged, // Timestamp
      String(session.date || ''), // Date (YYYY-MM-DD, kept as text by the column format)
      String(session.id), // Session ID
      String(session.dayType || ''), // Day
      String(s.exercise || ''), // Exercise
      Number(s.setNo) || i + 1, // Set #
      reps === null ? '' : reps, // Reps (blank when "to failure" with no count)
      Boolean(s.toFailure), // To failure
      weight, // Weight (kg)
      volume, // Volume (kg)
      i === 0 ? notes : '', // Session notes, first row only
      i === 0 ? numberOrBlank_(session.avgHeartRate) : '', // Avg HR (bpm)
      i === 0 ? numberOrBlank_(session.activeCalories) : '', // Active kcal
      i === 0 ? numberOrBlank_(session.score) : '', // Score /10
      i === 0 ? satisfactionText_(session.satisfaction) : '', // Satisfaction
      numberOrBlank_(s.toFailure ? 0 : s.rir), // RIR (blank when not logged)
      Boolean(s.warmup), // Warm-up
      i === 0 ? durationMinutes_(session) : '', // Duration (min): first set to the Finish workout tap
      i === 0 ? String(session.light || '') : '', // Light day: 'amber' (one set fewer) or 'red' (light day, left out of progress)
      i === 0 && session.merge ? JSON.stringify(session.merge) : '', // Made up: the missed day this workout mixed in
      i === 0 ? Boolean(session.noWatch) : '', // No watch: heart rate and calories were not recorded
    ]);
  }
  return rows;
}

/** Sessions from the last `days` days, rebuilt by grouping rows by Session ID. Newest first. */
function history_(days) {
  var sheet = getLogSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var cutoffText = isoDate_(cutoff);
  var tz = Session.getScriptTimeZone();

  var byId = {};
  var order = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var date = r[COL.date - 1];
    var dateText = date instanceof Date ? Utilities.formatDate(date, tz, 'yyyy-MM-dd') : String(date || '').slice(0, 10);
    if (dateText < cutoffText) continue;
    var id = String(r[COL.sessionId - 1] || '');
    if (!id) continue;
    var ts = r[COL.timestamp - 1];
    var loggedAt = ts instanceof Date ? ts.toISOString() : String(ts || '');
    if (!byId[id]) {
      byId[id] = {
        id: id, date: dateText, dayType: String(r[COL.day - 1] || ''), startedAt: loggedAt, finishedAt: loggedAt,
        notes: '', avgHeartRate: null, activeCalories: null, score: null, satisfaction: {}, synced: true, sets: [],
      };
      order.push(id);
    }
    var session = byId[id];
    var notes = r[COL.notes - 1];
    if (notes && !session.notes) session.notes = String(notes);
    if (r[COL.avgHr - 1] !== '' && session.avgHeartRate === null) session.avgHeartRate = Number(r[COL.avgHr - 1]) || null;
    if (r[COL.kcal - 1] !== '' && session.activeCalories === null) session.activeCalories = Number(r[COL.kcal - 1]) || null;
    if (r[COL.score - 1] !== '' && session.score === null) session.score = Number(r[COL.score - 1]) || null;
    if (r[COL.satisfaction - 1] && !Object.keys(session.satisfaction).length) session.satisfaction = parseSatisfaction_(r[COL.satisfaction - 1]);
    if (r[COL.light - 1] && !session.light) session.light = String(r[COL.light - 1]);
    if (r[COL.madeUp - 1] && !session.merge) {
      try { session.merge = JSON.parse(String(r[COL.madeUp - 1])); } catch (ignore) {}
    }
    if ((r[COL.noWatch - 1] === true || String(r[COL.noWatch - 1]).toLowerCase() === 'true') && !session.noWatch) session.noWatch = true;
    if (loggedAt && (!session.startedAt || loggedAt < session.startedAt)) session.startedAt = loggedAt;
    if (loggedAt && (!session.finishedAt || loggedAt > session.finishedAt)) session.finishedAt = loggedAt;
    var reps = r[COL.reps - 1];
    session.sets.push({
      id: id + '-' + (i + 2),
      exercise: String(r[COL.exercise - 1] || ''),
      setNo: Number(r[COL.setNo - 1]) || session.sets.length + 1,
      reps: reps === '' || reps === null || reps === undefined ? null : Number(reps),
      toFailure: r[COL.toFailure - 1] === true || String(r[COL.toFailure - 1]).toLowerCase() === 'true',
      rir: r[COL.rir - 1] === '' || r[COL.rir - 1] === null || r[COL.rir - 1] === undefined ? null : Number(r[COL.rir - 1]),
      warmup: r[COL.warmup - 1] === true || String(r[COL.warmup - 1]).toLowerCase() === 'true',
      weightKg: Number(r[COL.weight - 1]) || 0,
      loggedAt: loggedAt,
    });
  }
  var sessions = order.map(function (id) {
    return byId[id];
  });
  sessions.sort(function (a, b) {
    return b.date < a.date ? -1 : b.date > a.date ? 1 : b.finishedAt < a.finishedAt ? -1 : 1;
  });
  return sessions;
}

/* ------------------------------------------------------------ Measurements */

/** The Measurements sheet, created with its fixed header cells if missing. Field columns follow the fixed ones. */
function getMeasureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(M_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(M_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, M_FIXED.length).setValues([M_FIXED]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@'); // keep dates as text
  }
  return sheet;
}

/** Header row as an array of strings (trailing blanks dropped). */
function measureHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), M_FIXED.length);
  var row = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  while (row.length && row[row.length - 1] === '') row.pop();
  return row;
}

/** Append one check-in / weigh-in row. Unknown field names get a new column at the end. */
function measure_(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ''))) {
    return json_({ ok: false, error: 'bad entry' });
  }
  var values = entry.values && typeof entry.values === 'object' ? entry.values : {};
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getMeasureSheet_();
    var last = sheet.getLastRow();
    if (last >= 2) {
      var ids = sheet.getRange(2, 3, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === entry.id) return json_({ ok: true, duplicate: true, rows: 0 });
    }
    var headers = measureHeaders_(sheet);
    var fields = Object.keys(values);
    var added = fields.filter(function (f) { return headers.indexOf(f) === -1; });
    if (added.length) {
      if (sheet.getMaxColumns() < headers.length + added.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length + added.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, headers.length + 1, 1, added.length).setValues([added]).setFontWeight('bold');
      headers = headers.concat(added);
    }
    var row = headers.map(function (h, i) {
      if (i === 0) return new Date();
      if (i === 1) return String(entry.date);
      if (i === 2) return entry.id;
      if (i === 3) return entry.kind === 'weighin' ? 'Weigh-in' : 'Check-in';
      if (i === 4) return String(entry.notes || '');
      return values.hasOwnProperty(h) ? numberOrBlank_(values[h]) : '';
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    return json_({ ok: true, duplicate: false, rows: 1 });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/** Every measurement entry, rebuilt from the rows (values keyed by column header). */
function measurements_() {
  var sheet = getMeasureSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var headers = measureHeaders_(sheet);
  var rows = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var tz = Session.getScriptTimeZone();
  return rows
    .filter(function (r) { return r[2]; })
    .map(function (r) {
      var values = {};
      for (var i = M_FIXED.length; i < headers.length; i++) {
        if (r[i] !== '' && r[i] !== null && !isNaN(Number(r[i]))) values[headers[i]] = Number(r[i]);
      }
      var date = r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1] || '').slice(0, 10);
      return {
        id: String(r[2]),
        date: date,
        kind: String(r[3]).toLowerCase().indexOf('weigh') === 0 ? 'weighin' : 'checkin',
        notes: String(r[4] || ''),
        savedAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ''),
        values: values,
      };
    });
}

/* ------------------------------------------------------------------ Missed */

function getMissedSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(X_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(X_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, X_HEADERS.length).setValues([X_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@'); // keep dates as text
  }
  return sheet;
}

/** Row number (2+) holding this Entry ID, or 0. */
function missedRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, 7, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

/** Add, update (same Entry ID) or delete (entry.deleted) one missed day. */
function missed_(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) return json_({ ok: false, error: 'bad entry' });
  if (!entry.deleted && !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ''))) return json_({ ok: false, error: 'bad entry' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getMissedSheet_();
    var row = missedRow_(sheet, entry.id);
    if (entry.deleted) {
      if (row) sheet.deleteRow(row);
      return json_({ ok: true, rows: row ? -1 : 0 });
    }
    var weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var p = String(entry.date).split('-');
    var weekday = weekdays[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()];
    var values = [[new Date(), String(entry.date), weekday, String(entry.dayType || ''), String(entry.reason || ''), String(entry.note || ''), entry.id]];
    if (row) sheet.getRange(row, 1, 1, X_HEADERS.length).setValues(values);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, X_HEADERS.length).setValues(values);
    return json_({ ok: true, rows: row ? 0 : 1 });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function missedList_() {
  var sheet = getMissedSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var tz = Session.getScriptTimeZone();
  return sheet
    .getRange(2, 1, last - 1, X_HEADERS.length)
    .getValues()
    .filter(function (r) { return r[6]; })
    .map(function (r) {
      return {
        id: String(r[6]),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1] || '').slice(0, 10),
        dayType: String(r[3] || ''),
        reason: String(r[4] || ''),
        note: String(r[5] || ''),
      };
    });
}

/* ---------------------------------------------------------- Small workouts */

function getSmallSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(W_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(W_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, W_HEADERS.length).setValues([W_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 2).setNumberFormat('@'); // date and time as text
  }
  return sheet;
}

/** Add, update (same Entry ID) or delete (entry.deleted) one small workout. */
function small_(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) return json_({ ok: false, error: 'bad entry' });
  if (!entry.deleted && (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || '')) || !/^\d{2}:\d{2}$/.test(String(entry.time || '')))) {
    return json_({ ok: false, error: 'bad entry' });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getSmallSheet_();
    var row = 0;
    var last = sheet.getLastRow();
    if (last >= 2) {
      var ids = sheet.getRange(2, 5, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === entry.id) row = i + 2;
    }
    if (entry.deleted) {
      if (row) sheet.deleteRow(row);
      return json_({ ok: true, rows: row ? -1 : 0 });
    }
    var values = [[new Date(), String(entry.date), String(entry.time), String(entry.note || ''), entry.id]];
    if (row) sheet.getRange(row, 1, 1, W_HEADERS.length).setValues(values);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, W_HEADERS.length).setValues(values);
    return json_({ ok: true, rows: row ? 0 : 1 });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function smallList_() {
  var sheet = getSmallSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var tz = Session.getScriptTimeZone();
  return sheet
    .getRange(2, 1, last - 1, W_HEADERS.length)
    .getValues()
    .filter(function (r) { return r[4]; })
    .map(function (r) {
      return {
        id: String(r[4]),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1] || '').slice(0, 10),
        time: r[2] instanceof Date ? Utilities.formatDate(r[2], tz, 'HH:mm') : String(r[2] || '').slice(0, 5),
        note: String(r[3] || ''),
      };
    });
}

/* ---------------------------------------------------------------- Recovery */

function getRecoverySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(R_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(R_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, R_HEADERS.length).setValues([R_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@'); // dates as text
  }
  return sheet;
}

/** The average of every number in a value: the Shortcut may send "52", "52 count/min" or a list of readings. */
function average_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var found = String(v === null || v === undefined ? '' : v).match(/-?\d+(?:\.\d+)?/g);
  if (!found) return null;
  var sum = 0;
  for (var i = 0; i < found.length; i++) sum += Number(found[i]);
  return sum / found.length;
}

/** Sleep hours from "start|end;start|end" pairs (ISO dates, one per sleep stage), overlaps merged so the Watch and
    the iPhone recording the same night count once. Same rule as Body.sleepHoursFromSpans in the app. */
function sleepHours_(text) {
  var spans = String(text || '')
    .split(/[;\n]/)
    .map(function (p) {
      var parts = p.split('|');
      return [Date.parse(String(parts[0] || '').trim()), Date.parse(String(parts[1] || '').trim())];
    })
    .filter(function (s) { return !isNaN(s[0]) && !isNaN(s[1]) && s[1] > s[0]; })
    .sort(function (a, b) { return a[0] - b[0]; });
  if (!spans.length) return null;
  var total = 0;
  var cur = null;
  for (var i = 0; i < spans.length; i++) {
    if (!cur || spans[i][0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [spans[i][0], spans[i][1]];
    } else cur[1] = Math.max(cur[1], spans[i][1]);
  }
  total += cur[1] - cur[0];
  return Math.round((total / 3600000) * 100) / 100;
}

/** Add or fill in one day's row. Only the fields sent are written, so the Shortcut and the app never wipe each
    other's numbers. Date defaults to today (the Shortcut runs in the morning). */
function recovery_(entry, source) {
  if (!entry || typeof entry !== 'object') return json_({ ok: false, error: 'bad entry' });
  var date = String(entry.date || '').slice(0, 10);
  if (!date) date = isoDate_(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'bad date' });
  var values = {};
  if (entry.sleep !== undefined && entry.sleep !== '') {
    var h = sleepHours_(entry.sleep);
    if (h !== null) values.sleepHours = h;
  }
  for (var key in R_FIELDS) {
    if (entry[key] === undefined || entry[key] === null || entry[key] === '') continue;
    var n = average_(entry[key]);
    if (n !== null) values[key] = Math.round(n * 100) / 100;
  }
  if (!Object.keys(values).length) return json_({ ok: false, error: 'nothing to save' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getRecoverySheet_();
    var last = sheet.getLastRow();
    var row = 0;
    if (last >= 2) {
      var dates = sheet.getRange(2, 1, last - 1, 1).getValues();
      var tz = Session.getScriptTimeZone();
      for (var i = 0; i < dates.length; i++) {
        var d = dates[i][0] instanceof Date ? Utilities.formatDate(dates[i][0], tz, 'yyyy-MM-dd') : String(dates[i][0]).slice(0, 10);
        if (d === date) row = i + 2;
      }
    }
    var current = row ? sheet.getRange(row, 1, 1, R_HEADERS.length).getValues()[0] : R_HEADERS.map(function () { return ''; });
    current[0] = date;
    for (var k in values) if (values[k] !== null) current[R_FIELDS[k] - 1] = values[k];
    current[7] = new Date();
    var sources = String(current[8] || '').split(', ').filter(String);
    if (sources.indexOf(source) < 0) sources.push(source);
    current[8] = sources.join(', ');
    sheet.getRange(row || last + 1, 1, 1, R_HEADERS.length).setValues([current]);
    return json_({ ok: true, date: date, saved: values });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function recoveryList_(days) {
  var sheet = getRecoverySheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var cutoffText = isoDate_(cutoff);
  var tz = Session.getScriptTimeZone();
  var cell = function (v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); };
  return sheet
    .getRange(2, 1, last - 1, R_HEADERS.length)
    .getValues()
    .map(function (r) {
      var d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0] || '').slice(0, 10);
      return { date: d, sleepHours: cell(r[1]), sleepScore: cell(r[2]), rhr: cell(r[3]), hrv: cell(r[4]), soreness: cell(r[5]), score: cell(r[6]) };
    })
    .filter(function (e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= cutoffText; });
}

/* ---------------------------------------------------------------- Exercises */

function getExerciseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(E_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(E_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, E_HEADERS.length).setValues([E_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    // A tab made by an older Code.gs gets the new header cells ("Also called"); headers you renamed stay.
    if (sheet.getMaxColumns() < E_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), E_HEADERS.length - sheet.getMaxColumns());
    var head = sheet.getRange(1, 1, 1, E_HEADERS.length);
    var cur = head.getValues()[0];
    var changed = false;
    for (var i = 0; i < E_HEADERS.length; i++) if (cur[i] === '' || cur[i] === null) { cur[i] = E_HEADERS[i]; changed = true; }
    if (changed) head.setValues([cur]).setFontWeight('bold');
  }
  return sheet;
}

/** Same matching as the app: case, punctuation and a plural s are ignored. */
function normName_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(function (w) {
      if (w.length > 4 && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
      return w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w;
    })
    .join(' ');
}

/** Row number (2…) of an exercise by its name, or 0. */
function exerciseRow_(sheet, name) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var names = sheet.getRange(2, 1, last - 1, 1).getValues();
  var want = normName_(name);
  for (var i = 0; i < names.length; i++) if (normName_(names[i][0]) === want) return i + 2;
  return 0;
}

/** Add an exercise made in the app, or update the cells it sends (blank ones are left alone). Aliases are merged. */
function upsertExercise_(row) {
  if (!row || !String(row.name || '').trim()) return json_({ ok: false, error: 'no name' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getExerciseSheet_();
    var r = exerciseRow_(sheet, row.name);
    var fields = [String(row.name).trim(), row.equipment, row.main, row.helps, row.notes];
    if (!r) {
      r = sheet.getLastRow() + 1;
      sheet.getRange(r, 1, 1, E_HEADERS.length).setValues([[fields[0], String(row.equipment || ''), String(row.main || ''), String(row.helps || ''), String(row.notes || ''), String(row.aliases || ''), String(row.minor || '')]]);
      return json_({ ok: true, added: true });
    }
    // row.replace (an edit in the app): equipment and both muscle columns are written even when blank, so a muscle
    // taken off in the app is taken off here too. Otherwise blank cells are left alone.
    for (var c = 1; c < fields.length; c++) {
      var replace = row.replace && c <= 3;
      if (replace || (fields[c] !== undefined && fields[c] !== null && String(fields[c]) !== '')) sheet.getRange(r, c + 1).setValue(String(fields[c] || ''));
    }
    if (row.replace || (row.minor !== undefined && row.minor !== null && String(row.minor) !== '')) sheet.getRange(r, 7).setValue(String(row.minor || ''));
    if (row.aliases) mergeAliases_(sheet, r, String(row.aliases).split(','));
    return json_({ ok: true, added: false });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function mergeAliases_(sheet, r, extra) {
  var cell = sheet.getRange(r, 6);
  var list = String(cell.getValue() || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var seen = list.map(normName_);
  for (var i = 0; i < extra.length; i++) {
    var a = String(extra[i] || '').trim();
    if (a && seen.indexOf(normName_(a)) < 0) { list.push(a); seen.push(normName_(a)); }
  }
  cell.setValue(list.join(', '));
}

/** Another name for an exercise: added to its "Also called" cell. */
function aliasExercise_(name, alias) {
  if (!String(name || '').trim() || !String(alias || '').trim()) return json_({ ok: false, error: 'name and alias needed' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getExerciseSheet_();
    var r = exerciseRow_(sheet, name);
    if (!r) return json_({ ok: false, error: 'no exercise named ' + name });
    // One other name belongs to one exercise: removed from any other row first (the app changed a match).
    var last = sheet.getLastRow();
    var cells = sheet.getRange(2, 6, last - 1, 1).getValues();
    for (var i = 0; i < cells.length; i++) {
      if (i + 2 === r || !cells[i][0]) continue;
      var kept = String(cells[i][0]).split(',').map(function (s) { return s.trim(); }).filter(function (a) { return a && normName_(a) !== normName_(alias); });
      if (kept.join(', ') !== String(cells[i][0])) sheet.getRange(i + 2, 6).setValue(kept.join(', '));
    }
    mergeAliases_(sheet, r, [alias]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/**
 * A dropdown of the muscle names on Main, Helping and Tertiary muscles. Several muscles in one cell are allowed (the
 * rule warns, it never rejects); in the Sheet, Data → Data validation → this rule → "Allow multiple selections" turns
 * the dropdown into tick boxes. Set again only when the list of names changes.
 */
function setupExercises_(muscles) {
  if (!Array.isArray(muscles) || !muscles.length) return json_({ ok: false, error: 'no muscles' });
  var names = muscles.map(function (m) { return String(m).trim(); }).filter(String);
  var key = names.join('|');
  var props = PropertiesService.getScriptProperties();
  key = 'v2.3|' + key; // set again once for the Tertiary column
  if (props.getProperty('E_MUSCLES') === key) return json_({ ok: true, changed: false });
  var sheet = getExerciseSheet_();
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(true)
    .setHelpText('Pick the muscle names (gym names). Several are separated by commas.').build();
  sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 2).setDataValidation(rule);
  sheet.getRange(2, 7, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  props.setProperty('E_MUSCLES', key);
  return json_({ ok: true, changed: true });
}

/** Write the app's starting exercise list, but only into an empty tab: the owner's edits are never overwritten. */
function seedExercises_(rows) {
  if (!Array.isArray(rows) || !rows.length) return json_({ ok: false, error: 'no rows' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getExerciseSheet_();
    if (sheet.getLastRow() >= 2) return json_({ ok: true, written: 0, existing: sheet.getLastRow() - 1 });
    var values = rows
      .filter(function (r) { return r && String(r.name || '').trim(); })
      .map(function (r) {
        return [String(r.name).trim(), String(r.equipment || ''), String(r.main || ''), String(r.helps || ''), String(r.notes || ''), String(r.aliases || ''), String(r.minor || '')];
      });
    if (!values.length) return json_({ ok: false, error: 'no rows' });
    sheet.getRange(2, 1, values.length, E_HEADERS.length).setValues(values);
    return json_({ ok: true, written: values.length });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function exerciseRows_() {
  var sheet = getExerciseSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet
    .getRange(2, 1, last - 1, E_HEADERS.length)
    .getValues()
    .filter(function (r) { return String(r[0] || '').trim(); })
    .map(function (r) {
      return { name: String(r[0]).trim(), equipment: String(r[1] || ''), main: String(r[2] || ''), helps: String(r[3] || ''), notes: String(r[4] || ''), aliases: String(r[5] || ''), minor: String(r[6] || '') };
    });
}

/* ---------------------------------------------------------------- Settings */

function getSettingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(S_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(S_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, S_HEADERS.length).setValues([S_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Keep one row: the latest settings. A cell holds up to 50,000 characters, plenty for these. */
function writeSettings_(data, savedAt) {
  if (!data || typeof data !== 'object') return json_({ ok: false, error: 'bad settings' });
  var text = JSON.stringify(data);
  if (text.length > 49000) return json_({ ok: false, error: 'settings too large' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getSettingsSheet_();
    sheet.getRange(2, 1, 1, 2).setValues([[String(savedAt || new Date().toISOString()), text]]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/**
 * v2.8: row 3 of the Settings tab holds the workout in progress (JSON), rewritten after every set and blanked when
 * the workout is submitted or discarded, so a phone wiped mid-workout can pick it up again. `draft` null clears it.
 */
function writeDraft_(draft, savedAt) {
  var text = draft && typeof draft === 'object' ? JSON.stringify(draft) : '';
  if (text.length > 49000) return json_({ ok: false, error: 'draft too large' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getSettingsSheet_();
    if (sheet.getMaxRows() < 3) sheet.insertRowsAfter(sheet.getMaxRows(), 3 - sheet.getMaxRows());
    sheet.getRange(3, 1, 1, 2).setValues([[text ? String(savedAt || new Date().toISOString()) : '', text]]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/** The settings copy (row 2) and, v2.8, the open workout (row 3) if any. */
function readSettings_() {
  var sheet = getSettingsSheet_();
  if (sheet.getLastRow() < 2) return { ok: true, data: null, savedAt: null, draft: null, draftAt: null };
  var rows = sheet.getRange(2, 1, 2, 2).getValues();
  var parse = function (cell) {
    try {
      return JSON.parse(String(cell || 'null'));
    } catch (err) {
      return null;
    }
  };
  var when = function (cell) { return cell instanceof Date ? cell.toISOString() : String(cell || ''); };
  var draft = parse(rows[1][1]);
  return { ok: true, data: parse(rows[0][1]), savedAt: when(rows[0][0]), draft: draft && typeof draft === 'object' ? draft : null, draftAt: when(rows[1][0]) || null };
}

function isoDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
