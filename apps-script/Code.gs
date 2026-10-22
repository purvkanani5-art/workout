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
 *   POST {scriptUrl}                       body: { token, action: "settings", data: {...}, savedAt }
 *   GET  {scriptUrl}?action=settings&token=…
 *
 * Log: one row per set. Writing is idempotent by Session ID: submitting the same session twice adds
 * nothing and returns { ok: true, duplicate: true, rows: 0 }.
 * Measurements: one row per check-in or weigh-in, idempotent by Entry ID. Each measurement field (e.g.
 * "Waist (cm)") has its own column; a field added in the app's Settings gets a new column automatically.
 * Missed: one row per scheduled workout day with no workout, with the reason. Rewritten in place when the
 * reason changes (same Entry ID), deleted when the app takes it back (a workout was logged for that date).
 * Settings: one row holding the app's settings as JSON (exercises, plans, schedule…; never the URL or token),
 * so a new phone can restore them.
 * Progress photos never come here: they stay encrypted on the phone.
 */

var SHEET_NAME = 'Log';
var M_SHEET_NAME = 'Measurements';
var M_FIXED = ['Timestamp', 'Date', 'Entry ID', 'Type', 'Notes'];
var X_SHEET_NAME = 'Missed';
var X_HEADERS = ['Timestamp', 'Date', 'Weekday', 'Day', 'Reason', 'Note', 'Entry ID'];
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
];
// Column numbers (1-based) used below. Notes to Satisfaction are per-session and filled on a session's first row
// only; RIR (reps in reserve, 3 = "3 or more") and Warm-up are per set and were added after the first version.
var COL = {
  timestamp: 1, date: 2, sessionId: 3, day: 4, exercise: 5, setNo: 6, reps: 7, toFailure: 8, weight: 9, volume: 10,
  notes: 11, avgHr: 12, kcal: 13, score: 14, satisfaction: 15, rir: 16, warmup: 17,
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
  Logger.log('Sheet "%s" is ready.', getSettingsSheet_().getName());
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
    if (p.action === 'settings') return json_(readSettings_());
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
  if (body.action === 'settings') return writeSettings_(body.data, body.savedAt);
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

function readSettings_() {
  var sheet = getSettingsSheet_();
  if (sheet.getLastRow() < 2) return { ok: true, data: null, savedAt: null };
  var row = sheet.getRange(2, 1, 1, 2).getValues()[0];
  var data = null;
  try {
    data = JSON.parse(String(row[1] || 'null'));
  } catch (err) {
    data = null;
  }
  return { ok: true, data: data, savedAt: row[0] instanceof Date ? row[0].toISOString() : String(row[0] || '') };
}

function isoDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
