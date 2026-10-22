'use strict';

/* Bhimlekha: the Progress, Body and Photos screens. Loaded before app.js; these functions use app.js globals
   (state, esc, save, render, toast, …) only when called, after app.js has run. Their actions/changes/inputs are
   merged into app.js's handler tables there. */

const RANGES = [
  { key: '4w', label: '4 weeks', days: 28 },
  { key: '12w', label: '12 weeks', days: 84 },
  { key: 'all', label: 'All', days: null },
];

const METRICS = [
  { key: 'e1rm', label: 'Strength', title: 'Estimated strength (1-rep max, average of working sets)', unit: 'kg', digits: 1, get: (s) => s.perf },
  { key: 'volume', label: 'Volume', title: 'Volume (reps × kg)', unit: 'kg', digits: 0, get: (s) => s.volume },
  { key: 'reps', label: 'Reps/set', title: 'Average reps per working set', unit: 'reps', digits: 1, get: (s) => s.avgReps },
  { key: 'weight', label: 'Weight', title: 'Working weight', unit: 'kg', digits: 1, get: (s) => s.weight },
];

function inRange(date, rangeKey) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[1];
  return !r.days || date >= Progress.addDays(todayISO(), -r.days);
}

function segmented(name, options, value, change) {
  return `<div class="segments compact" role="radiogroup" aria-label="${esc(name)}">${options
    .map(
      (o) => `<label class="seg ${o.key === value ? 'selected' : ''}">
        <input type="radio" name="${esc(name)}" value="${esc(o.key)}" data-change="${change}" ${o.key === value ? 'checked' : ''} />${esc(o.label)}</label>`,
    )
    .join('')}</div>`;
}

/* ========================================================== Progress */

const STATUS_ORDER = { increase: 0, watch: 1, ready: 2, building: 3, untracked: 4 };
const STATUS_BADGE = {
  increase: ['Add weight', 'ok'],
  ready: ['Ready', 'ok'],
  watch: ['New weight', 'pending'],
  building: ['Building', ''],
  untracked: ['No rep plan', ''],
};

function renderProgress() {
  const analyses = trackedExercises()
    .map((n) => analyse(n))
    .filter(Boolean)
    .sort((a, b) => STATUS_ORDER[a.status.kind] - STATUS_ORDER[b.status.kind] || a.exercise.localeCompare(b.exercise));
  const p = state.settings.progression;
  const counts = Progress.weeklyMuscleSets(state.history, muscleOf, todayISO());
  const assigned = Object.values(state.settings.muscles || {});
  const muscles = [...new Set([...MUSCLE_GROUPS, ...assigned, ...Object.keys(counts)])].filter((m) => counts[m] || assigned.includes(m));
  const maxCount = Math.max(p.muscleSetsMax, ...Object.values(counts));
  return `
    ${topbar('Progress', { href: 'home', label: 'Home' })}
    ${recoveryCard('progress')}
    ${renderWeekSummaries()}
    ${renderWeeklyStrength()}
    <section class="card">
      <h2 class="section-title">Exercises</h2>
      ${
        analyses.length
          ? `<ul class="list">${analyses
              .map((a) => {
                const [label, cls] = STATUS_BADGE[a.status.kind];
                const t = TREND[a.trend];
                return `<li><button type="button" class="list-item" data-action="openExercise" data-name="${esc(a.exercise)}">
                  <div>
                    <div class="primary-text">${esc(a.exercise)}</div>
                    <div class="secondary-text">${esc(a.last.reps.join('-'))} @ ${esc(fmtKg(a.last.weight))} kg · <span class="trend ${t.cls}">${t.icon} ${esc(t.label)}</span>${a.flags.length ? ' · ⚠️' : ''}</div>
                  </div>
                  <span class="badge ${cls}">${esc(label)}</span>
                </button></li>`;
              })
              .join('')}</ul>`
          : '<p class="empty">Submit a workout to start tracking.</p>'
      }
    </section>
    <section class="card stack">
      <div>
        <h2 class="section-title" style="margin:0">Hard sets per muscle, last 7 days</h2>
        <p class="hint">Useful range ${p.muscleSetsMin}–${p.muscleSetsMax} working sets a week (Settings → Progression).</p>
      </div>
      ${
        muscles.length
          ? `<div class="bars">${muscles
              .map((m) => {
                const n = counts[m] || 0;
                const state_ = n < p.muscleSetsMin ? 'low' : n > p.muscleSetsMax ? 'high' : 'ok';
                return `<div class="bar-row">
                  <span class="bar-label">${esc(m)}</span>
                  <span class="bar-track"><span class="bar-fill ${state_}" style="width:${Math.round((n / maxCount) * 100)}%"></span>
                    <span class="bar-band" style="left:${(p.muscleSetsMin / maxCount) * 100}%;width:${((p.muscleSetsMax - p.muscleSetsMin) / maxCount) * 100}%"></span></span>
                  <span class="bar-value">${n}${state_ === 'low' ? ' · low' : state_ === 'high' ? ' · high' : ''}</span>
                </div>`;
              })
              .join('')}</div>`
          : '<p class="empty">Set muscle groups per exercise in Settings → Exercises.</p>'
      }
    </section>`;
}

/** Overall strength per week (each exercise vs its own previous 4 weeks), the number trigger B watches. */
function renderWeeklyStrength() {
  const weeks = Progress.weeklyStrength(statsHistory()).slice(-12);
  if (!weeks.length) return '';
  const r = state.settings.recovery;
  const last = weeks[weeks.length - 1];
  const below = [...weeks].reverse().findIndex((w) => w.pct >= -r.strengthPct);
  const run = below === -1 ? weeks.length : below;
  return `<section class="card stack">
      <h2 class="section-title" style="margin:0">Overall strength by week</h2>
      ${Charts.line(weeks.map((w) => ({ date: w.week, y: w.pct, label: `${w.n} exercise${w.n === 1 ? '' : 's'}` })), { title: 'Change vs each exercise’s previous 4 weeks', unit: '%', digits: 1 })}
      <p class="small" style="margin:0">This week ${esc(Progress.signed(last.pct))} over ${last.n} exercise${last.n === 1 ? '' : 's'}.${
        run ? ` Below −${esc(r.strengthPct)}% for ${run} week${run === 1 ? '' : 's'} in a row; the recovery alert fires at ${esc(r.strengthWeeks)}.` : ''
      }</p>
    </section>`;
}

/* ------------------------------------------------------ weekly summary */

/**
 * One week (ending on the check-in day, numbered like the photo folders): workouts done vs planned, missed
 * days, sets per muscle, overall strength, best/weakest exercise, weight and waist, ratings, photos.
 */
function weekSummary(endIso) {
  const { start, end } = weekBounds(endIso);
  const week = photoWeek(end);
  const today = todayISO();
  const p = state.settings.progression;
  const inWeek = (d) => d >= start && d <= end;
  const sessions = state.history.filter((s) => inWeek(s.date));
  let planned = 0;
  for (let d = start; d <= end && d <= today; d = Progress.addDays(d, 1)) if (scheduledDay(d)) planned++;
  const missed = state.missed.filter((m) => inWeek(m.date)).sort((a, b) => a.date.localeCompare(b.date));
  const deload = sessions.some((s) => inDeload(s.date));

  // Sets per muscle over the week's 7 days (or up to today while it runs).
  const counts = Progress.weeklyMuscleSets(state.history, muscleOf, end < today ? end : today);
  const low = Object.entries(counts).filter(([, n]) => n < p.muscleSetsMin);
  const high = Object.entries(counts).filter(([, n]) => n > p.muscleSetsMax);

  // Overall strength with the same weeks as this summary.
  const stats = statsHistory();
  const strength = Progress.weeklyStrength(stats, (iso) => weekBounds(iso).start).find((w) => w.week === start) || null;

  // Each exercise's last session this week vs its last one before the week.
  const changes = [];
  const names = new Set();
  for (const s of stats) if (inWeek(s.date)) for (const set of s.sets) if (Progress.isWorking(set)) names.add(set.exercise);
  for (const name of names) {
    const perfAt = (list) => {
      const s = list.sort((a, b) => a.date.localeCompare(b.date)).pop();
      return s ? Progress.exerciseSnapshot(s, name, null)?.perf : null;
    };
    const has = (s) => s.sets.some((x) => x.exercise === name && Progress.isWorking(x));
    const now = perfAt(stats.filter((s) => inWeek(s.date) && has(s)));
    const before = perfAt(stats.filter((s) => s.date < start && has(s)));
    if (now && before) changes.push({ name, pct: Progress.pct(now, before) });
  }
  changes.sort((a, b) => b.pct - a.pct);

  // Bodyweight (weekly average) and waist (latest), vs the week before.
  const wf = weightField();
  const avgIn = (from, to) => {
    const v = state.measurements.filter((m) => m.date >= from && m.date <= to && Number.isFinite(m.values?.[wf])).map((m) => m.values[wf]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const weightNow = wf ? avgIn(start, end) : null;
  const weightBefore = wf ? avgIn(Progress.addDays(start, -7), Progress.addDays(start, -1)) : null;
  const waistField = measureFields().find((f) => /waist/i.test(f));
  const latest = (from, to) => {
    const m = state.measurements.filter((x) => x.date >= from && x.date <= to && Number.isFinite(x.values?.[waistField])).sort((a, b) => a.date.localeCompare(b.date)).pop();
    return m ? m.values[waistField] : null;
  };
  const waistNow = waistField ? latest(start, end) : null;
  const waistBefore = waistField ? latest('0000-01-01', Progress.addDays(start, -1)) : null;

  const feel = (() => {
    const vals = sessions.flatMap((s) => ['Energy', 'Strength'].map((q) => s.satisfaction?.[q]).filter(Number.isFinite));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  const info = state.vaultInfo;
  const photos = info.weeksChanged?.[week.folder] ? (unsavedWeeks().includes(week.folder) ? 'unsaved' : 'saved') : 'none';

  return {
    week, start, end, running: end >= today, planned, done: new Set(sessions.map((s) => s.date)).size, sessions, missed, deload,
    counts, low, high, strength, best: changes[0] || null, worst: changes.length > 1 ? changes[changes.length - 1] : null,
    weight: weightNow !== null ? { now: weightNow, delta: weightBefore !== null ? weightNow - weightBefore : null } : null,
    waist: waistNow !== null ? { now: waistNow, delta: waistBefore !== null ? waistNow - waistBefore : null, field: waistField } : null,
    feel, photos,
  };
}

function renderWeekSummary(w) {
  const rows = [];
  rows.push(
    `<li><span>Workouts</span><strong>${w.done} of ${w.planned} planned</strong>${w.sessions.length ? ` <span class="muted">(${esc([...new Set(w.sessions.map((s) => s.dayType))].join(', '))})</span>` : ''}${
      w.deload ? ' · 🟢 lighter week' : ''
    }</li>`,
  );
  if (w.missed.length) {
    rows.push(
      `<li><span>Missed</span><strong class="down">${w.missed.length}</strong> ${w.missed
        .map((m) => `${esc(m.dayType)} (${esc(WEEKDAYS[new Date(Date.parse(m.date)).getUTCDay()].slice(0, 3))}${m.reason ? `, ${esc(m.reason)}` : ', no reason yet'})`)
        .join('; ')}</li>`,
    );
  }
  if (w.strength) rows.push(`<li><span>Overall strength</span><strong class="${w.strength.pct >= 0 ? 'up' : 'down'}">${esc(Progress.signed(w.strength.pct))}</strong> over ${w.strength.n} exercise${w.strength.n === 1 ? '' : 's'}, vs their previous 4 weeks</li>`);
  if (w.best) rows.push(`<li><span>Best</span><strong>${esc(w.best.name)}</strong> ${esc(Progress.signed(w.best.pct))}</li>`);
  if (w.worst && w.worst.pct < w.best.pct) rows.push(`<li><span>Weakest</span><strong>${esc(w.worst.name)}</strong> ${esc(Progress.signed(w.worst.pct))}</li>`);
  const setsText = Object.keys(w.counts).length
    ? w.low.length || w.high.length
      ? [w.low.length ? `low: ${w.low.map(([m, n]) => `${m} ${n}`).join(', ')}` : '', w.high.length ? `high: ${w.high.map(([m, n]) => `${m} ${n}`).join(', ')}` : ''].filter(Boolean).join(' · ')
      : 'every muscle in range'
    : 'none logged';
  rows.push(`<li><span>Sets per muscle</span>${esc(setsText)} <span class="muted">(${esc(state.settings.progression.muscleSetsMin)}–${esc(state.settings.progression.muscleSetsMax)})</span></li>`);
  if (w.weight) rows.push(`<li><span>Bodyweight</span><strong>${esc(fmtKg(Math.round(w.weight.now * 10) / 10))} kg</strong> avg${w.weight.delta !== null ? ` · ${esc(Progress.signed(w.weight.delta, 1, ' kg'))} vs last week` : ''}</li>`);
  if (w.waist) rows.push(`<li><span>Waist</span><strong>${esc(fmtKg(w.waist.now))} cm</strong>${w.waist.delta !== null ? ` · ${esc(Progress.signed(w.waist.delta, 1, ' cm'))}` : ''}</li>`);
  if (w.feel !== null) rows.push(`<li><span>Energy & Strength</span><strong>${w.feel.toFixed(1)} / 5</strong> average</li>`);
  rows.push(`<li><span>Photos</span>${w.photos === 'saved' ? '✓ saved to Files' : w.photos === 'unsaved' ? '<strong class="down">not saved to Files yet</strong>' : 'none this week'}</li>`);
  return `<ul class="summary-list">${rows.join('')}</ul>`;
}

/** On Home: on the check-in day (the week so far) and the day after (the week just finished). */
function weekSummaryHome() {
  if (!state.history.length) return '';
  const today = todayISO();
  const yesterday = Progress.addDays(today, -1);
  const end = weekBounds(today).end === today ? today : weekBounds(yesterday).end === yesterday ? yesterday : null;
  if (!end) return '';
  const w = weekSummary(end);
  return `<div class="banner week-summary">
      <p class="title">📋 ${esc(w.week.folder.split(' - ')[0])} summary${w.running ? ' (ends today)' : ''}</p>
      <p class="small muted" style="margin:0">${esc(formatDate(w.start, false))} to ${esc(formatDate(w.end, false))}</p>
      ${renderWeekSummary(w)}
      <div class="actions"><a class="btn" href="#progress">All weeks</a></div>
    </div>`;
}

/** Progress: pick any week back to the first workout. */
function renderWeekSummaries() {
  const first = state.history.map((s) => s.date).filter(Boolean).sort()[0];
  if (!first) return '';
  const ends = [];
  for (let e = weekBounds(todayISO()).end; e >= weekBounds(first).end && ends.length < 52; e = Progress.addDays(e, -7)) ends.push(e);
  const pick = ends.includes(state.ui.summaryWeek) ? state.ui.summaryWeek : ends[0];
  const w = weekSummary(pick);
  return `<section class="card stack">
      <h2 class="section-title" style="margin:0">Weekly summary</h2>
      <select class="select" data-change="summaryWeek" aria-label="Week">${ends
        .map((e) => `<option value="${esc(e)}" ${e === pick ? 'selected' : ''}>${esc(photoWeek(e).folder)}</option>`)
        .join('')}</select>
      ${renderWeekSummary(w)}
    </section>`;
}

function renderExerciseProgress(name) {
  const a = analyse(name);
  if (!a) return `${topbar('', { href: 'progress', label: 'Progress' })}<p class="empty">No working sets logged for ${esc(name)} yet.</p>`;
  const ui = state.ui.progress;
  const metric = METRICS.find((m) => m.key === ui.metric) || METRICS[0];
  const snaps = a.snaps.filter((s) => inRange(s.date, ui.range));
  const p = state.settings.progression;
  const w = Progress.analyseWindow(snaps, p);
  const status = a.status.kind === 'untracked' ? '' : Progress.statusLine(a.status, todayISO());
  return `
    ${topbar('', { href: 'progress', label: 'Progress' })}
    <section class="card stack">
      <div>
        <h1 class="card-title">${esc(name)}</h1>
        <p class="subtitle">${a.snaps.length} session${a.snaps.length === 1 ? '' : 's'} logged${planText('', name) ? ` · Plan ${esc(planText(a.last.dayType, name))}` : ''}</p>
      </div>
      ${status ? `<p class="status-line ${esc(a.status.kind)}" style="margin:0">${esc(status)}</p>` : ''}
      ${segmented('metric', METRICS, metric.key, 'progressMetric')}
      ${segmented('range', RANGES, ui.range, 'progressRange')}
      ${Charts.line(
        snaps.map((s) => ({ date: s.date, y: metric.get(s), label: `${s.reps.join('-')} @ ${fmtKg(s.weight)} kg` })),
        { title: metric.title, unit: metric.unit, digits: metric.digits },
      )}
      ${
        w
          ? `<div class="analysis">
              <h2 class="section-title">What the chart says</h2>
              ${w.quant.length ? `<ul class="quant">${w.quant.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
              <p>${esc(w.words)}</p>
            </div>`
          : '<p class="empty">No sessions in this range.</p>'
      }
      ${a.flags.map((f) => `<p class="flag">⚠️ ${esc(f.kind === 'stall' ? `Stalled for ${f.sessions} sessions at ${fmtKg(a.last.weight)} kg.` : `Est. strength ${Progress.signed(f.pct)} over the last ${f.sessions} sessions.`)}</p>`).join('')}
    </section>
    <section class="card">
      <h2 class="section-title">Sessions</h2>
      <table class="summary">
        <thead><tr><th>Date</th><th>Sets</th><th class="num">Strength</th><th class="num">Volume</th></tr></thead>
        <tbody>${[...snaps]
          .reverse()
          .map(
            (s) => `<tr><td>${esc(formatDate(s.date, false))}</td><td>${esc(s.reps.join('-'))} @ ${esc(fmtKg(s.weight))}${s.rirs.some((r) => r !== null) ? `<br /><span class="small muted">RIR ${esc(s.rirs.map((r) => (r === null ? '?' : rirLabel(r))).join('-'))}</span>` : ''}</td>
              <td class="num">${esc(fmtKg(Math.round(s.perf * 10) / 10))}</td><td class="num">${esc(fmtVolume(s.volume))}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
    </section>`;
}

/* ============================================================== Body */

function bodyDraft() {
  const b = state.ui.body;
  if (!b.draft) b.draft = { date: todayISO(), values: {}, notes: '' };
  return b.draft;
}

function lastValue(field) {
  const list = [...state.measurements].filter((m) => Number.isFinite(m.values?.[field])).sort((a, b) => b.date.localeCompare(a.date));
  return list[0] ? list[0].values[field] : null;
}

/** Points for a field: weekly averages when there are daily weigh-ins for the weight field, else each entry. */
function bodySeries(field) {
  const list = state.measurements.filter((m) => Number.isFinite(m.values?.[field]) && inRange(m.date, state.ui.body.range));
  if (field === weightField() && list.some((m) => m.kind === 'weighin')) {
    return {
      label: `${field}, weekly average`,
      points: Progress.weeklyAverages(list, field).map((w) => ({ date: w.week, y: w.avg, label: `${w.n} weigh-in${w.n === 1 ? '' : 's'}` })),
    };
  }
  return { label: field, points: list.sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ date: m.date, y: m.values[field] })) };
}

function renderBody() {
  const d = bodyDraft();
  const fields = measureFields();
  const wf = weightField();
  const withData = fields.filter((f) => state.measurements.some((m) => Number.isFinite(m.values?.[f])));
  const ui = state.ui.body;
  const field = withData.includes(ui.field) ? ui.field : withData[0];
  const series = field ? bodySeries(field) : null;
  const windowEntries = state.measurements.filter((m) => inRange(m.date, ui.range));
  const body = Progress.analyseBody(windowEntries, fields);
  const check = checkinState();
  const v = state.vaultInfo;
  const entries = [...state.measurements].sort((a, b) => b.date.localeCompare(a.date) || (b.savedAt || '').localeCompare(a.savedAt || ''));
  const unit = (f) => (f.match(/\(([^)]+)\)/) || [])[1] || '';
  return `
    ${topbar('Body', { href: 'home', label: 'Home' })}
    <section class="card stack">
      <div>
        <h2 class="section-title" style="margin:0">Weekly check-in</h2>
        <p class="hint">${esc(WEEKDAYS[Number(state.settings.checkinDay) || 0])}s, same time each week: morning, before food, after the toilet, relaxed (not flexed).${check.last ? ` Last: ${esc(formatDate(check.last))}.` : ''}</p>
      </div>
      <div>
        <label for="m-date">Date</label>
        <input id="m-date" type="date" class="input" value="${esc(d.date)}" data-change="mDate" />
      </div>
      <div class="two">
        ${fields
          .map((f, i) => {
            const last = lastValue(f);
            return `<div>
              <label for="m-f${i}">${esc(f)}</label>
              <input id="m-f${i}" class="input" type="number" inputmode="decimal" step="0.1" min="0" data-field="${esc(f)}" data-input="mValue"
                value="${esc(d.values[f] ?? '')}" placeholder="${last !== null ? esc('last ' + fmtKg(last)) : ''}" />
            </div>`;
          })
          .join('')}
      </div>
      <div>
        <label for="m-notes">Notes (optional)</label>
        <textarea id="m-notes" class="textarea" data-input="mNotes" placeholder="Sleep, food, how you feel">${esc(d.notes)}</textarea>
      </div>
      <button type="button" class="btn primary" data-action="saveCheckin">Save check-in</button>
      <a class="btn secondary" href="#photos">🔒 Progress photos${v.lastPhotoAt ? ` · last ${esc(formatDate(v.lastPhotoAt.slice(0, 10)))}` : ''}</a>
    </section>

    ${
      wf
        ? `<section class="card stack">
      <div>
        <h2 class="section-title" style="margin:0">Daily weigh-in</h2>
        <p class="hint">Optional but more accurate: weigh every morning and the chart uses the weekly average, which smooths out water and food swings.</p>
      </div>
      <div class="input-row">
        <label for="weigh-in" class="sr-only">Today's weight</label>
        <input id="weigh-in" class="input" type="number" inputmode="decimal" step="0.1" min="0" placeholder="Today's weight" value="${esc(ui.weighIn)}" data-input="weighIn" />
        <button type="button" class="btn" data-action="saveWeighIn">Save</button>
      </div>
    </section>`
        : ''
    }

    <section class="card stack">
      <h2 class="section-title" style="margin:0">Trends</h2>
      ${
        withData.length
          ? `${segmented('bodyField', withData.map((f) => ({ key: f, label: f.replace(/\s*\([^)]*\)/, '') })), field, 'bodyField')}
             ${segmented('bodyRange', RANGES, ui.range, 'bodyRange')}
             ${Charts.line(series.points, { title: series.label, unit: unit(field), digits: 1 })}
             <div class="analysis">
               <h2 class="section-title">What changed</h2>
               ${
                 Object.keys(body.fields).length
                   ? `<ul class="quant">${Object.entries(body.fields)
                       .map(([f, c]) => `<li>${esc(f.replace(/\s*\([^)]*\)/, ''))}: ${esc(fmtKg(Math.round(c.from * 10) / 10))} → ${esc(fmtKg(Math.round(c.to * 10) / 10))} (${esc(Progress.signed(c.delta, 1, ' ' + unit(f)))}) in ${c.days} days</li>`)
                       .join('')}</ul>`
                   : ''
               }
               <p>${esc(body.words || (Object.keys(body.fields).length ? 'Log weight and waist to get a reading of fat versus muscle.' : 'Two or more entries in this range are needed to show a change.'))}</p>
             </div>`
          : '<p class="empty">Save your first check-in to see trends.</p>'
      }
    </section>

    <section class="card">
      <h2 class="section-title">Entries</h2>
      ${
        entries.length
          ? `<ul class="list">${entries
              .map(
                (m) => `<li><div class="exercise-row">
                  <div class="name"><strong>${esc(formatDate(m.date))}</strong> · ${m.kind === 'weighin' ? 'weigh-in' : 'check-in'}
                    <span class="small muted">${esc(
                      Object.entries(m.values || {})
                        .filter(([, x]) => Number.isFinite(x))
                        .map(([k, x]) => `${k.replace(/\s*\([^)]*\)/, '')} ${fmtKg(x)}`)
                        .join(' · '),
                    )}</span></div>
                  <span class="badge ${m.synced ? 'ok' : 'pending'}">${m.synced ? '✅' : '⏳'}</span>
                  <button type="button" class="btn icon ghost" data-action="deleteMeasurement" data-id="${esc(m.id)}" aria-label="Delete entry of ${esc(formatDate(m.date))}">🗑</button>
                </div></li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">No entries yet.</p>'
      }
      <button type="button" class="btn secondary" style="margin-top:12px" data-action="syncMeasurements" ${state.ui.syncing ? 'disabled' : ''}>Sync measurements from Sheet</button>
    </section>`;
}

function newMeasurement(kind, date, values, notes = '') {
  return { id: uuid(), date, kind, values, notes, savedAt: nowISO(), synced: false };
}

async function queueMeasurement(entry) {
  state.measurements = [...state.measurements.filter((m) => m.id !== entry.id), entry];
  state.mOutbox = [...state.mOutbox.filter((m) => m.id !== entry.id), entry];
  save(KEYS.measurements, state.measurements);
  save(KEYS.mOutbox, state.mOutbox);
  render();
  syncOutbox();
}

/* ============================================================ Photos */

let idleLock = null;
let preparingBackup = false;
let preparingWeeks = false;
let faceIdBusy = false; // the Face ID sheet is up: app.js skips the lock-on-hide meanwhile

function lockVault() {
  const v = state.ui.vault;
  stopCamera();
  if (Vault.isUnlocked()) Vault.lock();
  Vault.revokeAll();
  v.items = [];
  v.compare = null;
  v.slider = null;
  v.viewing = null;
  v.weekFiles = {};
  v.faceStep = '';
  v.pass1 = v.pass2 = v.pass3 = '';
  if (v.status === 'unlocked') v.status = 'locked';
  clearTimeout(idleLock);
}

function touchVault() {
  clearTimeout(idleLock);
  if (!Vault.isUnlocked()) return;
  const mins = Math.max(1, Number(state.settings.autoLockMinutes) || 3);
  idleLock = setTimeout(() => {
    lockVault();
    if (route().name === 'photos') render();
  }, mins * 60000);
}

/** Async work after the photos screen renders: find out if a vault exists, prepare the backup file. */
async function afterPhotosRender() {
  const v = state.ui.vault;
  loadVisibleImages().catch(() => {});
  if (v.status === 'unknown') {
    try {
      v.status = (await Vault.isSetUp()) ? (Vault.isUnlocked() ? 'unlocked' : 'locked') : 'none';
      v.faceId = { on: await Vault.faceIdEnabled(), possible: await Vault.faceIdPossible() };
    } catch {
      v.status = 'error';
    }
    return render();
  }
  if (v.status === 'unlocked' && !preparingWeeks) {
    // Share sheets must open straight from a tap, so each week's .zip is built before it is needed: the open
    // folder and every folder not yet saved.
    const want = weekFolders(v.items)
      .filter((w) => !(w.folder in v.weekFiles) && (w.folder === openWeek() || unsavedWeeks().includes(w.folder)))
      .slice(0, 4);
    if (want.length) {
      preparingWeeks = true;
      for (const w of want) {
        if (!Vault.isUnlocked()) break;
        try {
          v.weekFiles[w.folder] = await Vault.exportWeek(w.folder, w.items.map((it) => ({ id: it.id, fileName: it.fileName, date: it.date })));
        } catch {
          if (Vault.isUnlocked()) v.weekFiles[w.folder] = false; // shown as "could not prepare", not retried in a loop
        }
      }
      preparingWeeks = false;
      if (route().name === 'photos' && Vault.isUnlocked()) render();
      return;
    }
  }
  if ((v.status === 'locked' || v.status === 'unlocked') && !v.backup && !preparingBackup) {
    preparingBackup = true;
    try {
      v.backup = await Vault.exportBackup();
    } catch {
      v.backup = null;
    } finally {
      preparingBackup = false;
    }
    if (route().name === 'photos') render();
  }
}

async function refreshPhotos(changedFolder = null) {
  const v = state.ui.vault;
  Vault.revokeAll();
  v.items = await Vault.list();
  v.backup = null; // the files must be rebuilt to include changes
  v.weekFiles = {};
  noteWeeks(v.items, changedFolder);
}

/** Record each week folder's newest photo time, so Home knows which folders still need saving to Files. */
function noteWeeks(items, changedFolder = null) {
  const info = state.vaultInfo;
  const changed = {};
  for (const w of weekFolders(items)) {
    const newest = w.items.reduce((m, it) => (it.addedAt > m ? it.addedAt : m), '');
    const before = info.weeksChanged?.[w.folder] || '';
    changed[w.folder] = before > newest ? before : newest;
  }
  if (changedFolder && changed[changedFolder]) changed[changedFolder] = nowISO(); // a photo was deleted
  state.vaultInfo = { ...info, weeksChanged: changed, weeksSaved: info.weeksSaved || {} };
  save(KEYS.vaultInfo, state.vaultInfo);
}

/** Photos grouped into week folders, newest week first; each item gains `week` and `fileName`. */
function weekFolders(items) {
  const map = new Map();
  for (const it of items) {
    const week = photoWeek(it.date);
    if (!map.has(week.folder)) map.set(week.folder, { ...week, items: [] });
    map.get(week.folder).items.push({ ...it, week, fileName: photoFileName(week, it.pose) });
  }
  const order = (p) => (poses().indexOf(p) === -1 ? 999 : poses().indexOf(p));
  for (const w of map.values()) w.items.sort((a, b) => a.date.localeCompare(b.date) || order(a.pose) - order(b.pose));
  return [...map.values()].sort((a, b) => b.start.localeCompare(a.start));
}

function openWeek() {
  const v = state.ui.vault;
  if (v.openWeek === '') return null; // the owner closed them all
  const folders = weekFolders(v.items).map((w) => w.folder);
  return folders.includes(v.openWeek) ? v.openWeek : folders[0] || null; // default: the newest week
}

function renderPhotos() {
  const v = state.ui.vault;
  const head = topbar('Photos', { href: 'body', label: 'Body' });
  if (v.status === 'unknown') return `${head}<p class="empty">Opening the vault…</p>`;
  if (v.status === 'error') return `${head}<p class="empty">This browser blocked private storage, so the photo vault cannot open here.</p>`;
  if (v.status === 'none') return `${head}${renderVaultSetup()}`;
  if (v.status === 'locked') return `${head}${renderVaultLocked()}${renderBackupCard()}`;
  return `${head}${renderVaultOpen()}${renderBackupCard()}`;
}

const PRIVACY_NOTE = `Photos are encrypted on this phone with AES-256 using a key made from your passcode. They are never uploaded,
  never go to GitHub or Google, and do not appear in the Photos app. Without the passcode nobody (not even you) can open them.`;

function renderVaultSetup() {
  const v = state.ui.vault;
  return `
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Create your photo vault</h2>
      <p class="small" style="margin:0">${esc(PRIVACY_NOTE)}</p>
      <div>
        <label for="vault-p1">Passcode (at least 6 characters)</label>
        <input id="vault-p1" class="input" type="password" autocomplete="new-password" value="${esc(v.pass1 || '')}" data-input="vaultPass1" />
      </div>
      <div>
        <label for="vault-p2">Repeat passcode</label>
        <input id="vault-p2" class="input" type="password" autocomplete="new-password" value="${esc(v.pass2 || '')}" data-input="vaultPass2" />
      </div>
      <p class="flag">⚠️ A forgotten passcode cannot be reset. Save it in the iPhone Passwords app.</p>
      <button type="button" class="btn primary" data-action="vaultCreate" ${v.busy ? 'disabled' : ''}>${v.busy ? esc(v.busy) : 'Create vault'}</button>
    </section>
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Have a backup?</h2>
      <p class="hint" style="margin:0">Restore a .bhimvault file from the Files app. You will need the passcode it was made with.</p>
      <button type="button" class="btn secondary" data-action="vaultRestorePick">Restore from backup file…</button>
    </section>`;
}

function renderVaultLocked() {
  const v = state.ui.vault;
  const face = v.faceId?.on;
  return `
    <section class="card stack">
      <h2 class="section-title" style="margin:0">🔒 Vault locked</h2>
      ${
        face
          ? `<button type="button" class="btn primary" data-action="vaultFaceUnlock" ${v.busy ? 'disabled' : ''}>${v.busy ? esc(v.busy) : 'Unlock with Face ID'}</button>
             <p class="hint" style="margin:0">Or use the passcode:</p>`
          : ''
      }
      <div>
        <label for="vault-pass">Passcode</label>
        <input id="vault-pass" class="input" type="password" autocomplete="current-password" value="${esc(v.pass1 || '')}" data-input="vaultPass1" />
      </div>
      <button type="button" class="btn ${face ? 'secondary' : 'primary'}" data-action="vaultUnlock" ${v.busy ? 'disabled' : ''}>${v.busy && !face ? esc(v.busy) : 'Unlock with passcode'}</button>
      <p class="hint" style="margin:0">Locks again when you leave this screen, close the app, or after ${esc(state.settings.autoLockMinutes)} minutes without a tap.</p>
      <button type="button" class="btn ghost secondary danger" data-action="vaultErase">Forgot passcode? Erase the vault…</button>
    </section>`;
}

function weeksLater(a, b) {
  const days = Progress.daysBetween(a, b);
  if (days < 0) return `${Math.abs(days)} days earlier`;
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} later`;
  const w = Math.round(days / 7);
  return `${w} week${w === 1 ? '' : 's'} later`;
}

function renderVaultOpen() {
  const v = state.ui.vault;
  const pose = poses().includes(v.pose) ? v.pose : poses()[0];
  const target = photoWeek(v.date || todayISO());
  return `
    <section class="card stack">
      <div class="row between">
        <h2 class="section-title" style="margin:0">Add photos</h2>
        <button type="button" class="btn small" data-action="vaultLock">🔒 Lock</button>
      </div>
      <div>
        <label for="photo-date">Date</label>
        <input id="photo-date" type="date" class="input" value="${esc(v.date || todayISO())}" data-change="photoDate" />
        <p class="hint" id="photo-target">📁 Goes in <strong>${esc(target.folder)}</strong> as “${esc(photoFileName(target, pose))}”</p>
      </div>
      <button type="button" class="btn primary" data-action="openCamera">📷 ${Number(state.settings.cameraTimer) ? `Camera with ${esc(state.settings.cameraTimer)} s timer` : 'Open camera'}</button>
      <p class="hint" style="margin:0">Takes ${esc(poses().join(', '))} in order, with last week's photo faintly overlaid so you can match the pose and distance.</p>
      <button type="button" class="btn secondary" data-action="pickPhoto">Use the iPhone camera instead…</button>
      ${segmented('pose', poses().map((p) => ({ key: p, label: p })), pose, 'photoPose')}
      ${v.busy ? `<p class="status" role="status">${esc(v.busy)}</p>` : ''}
    </section>

    ${renderWeekFolders()}

    ${renderCompareWeeks()}

    ${renderFaceIdCard()}

    <section class="card stack">
      <h2 class="section-title" style="margin:0">Passcode</h2>
      <input class="input" type="password" placeholder="Current passcode" autocomplete="current-password" aria-label="Current passcode" value="${esc(v.pass1 || '')}" data-input="vaultPass1" />
      <input class="input" type="password" placeholder="New passcode" autocomplete="new-password" aria-label="New passcode" value="${esc(v.pass2 || '')}" data-input="vaultPass2" />
      <input class="input" type="password" placeholder="Repeat new passcode" autocomplete="new-password" aria-label="Repeat new passcode" value="${esc(v.pass3 || '')}" data-input="vaultPass3" />
      <button type="button" class="btn secondary" data-action="vaultChangePass">Change passcode</button>
      <p class="hint" style="margin:0">Old backup files keep the old passcode. Make a new backup after changing it.${v.faceId?.on ? ' Face ID turns off and needs turning on again.' : ''}</p>
    </section>
    ${v.viewing ? '<div class="viewer" id="viewer"><img id="viewer-img" alt="" /><div class="viewer-bar"><button type="button" class="btn" data-action="closePhoto">Close</button><button type="button" class="btn danger" data-action="deletePhoto">Delete</button></div></div>' : ''}
    ${renderSlider()}`;
}

/** The two weeks being compared: chosen ones, else the first and the latest week with photos. */
function compareWeeks() {
  const weeks = weekFolders(state.ui.vault.items); // newest first
  const c = state.ui.vault.compare || {};
  const find = (f) => weeks.find((w) => w.folder === f);
  return { weeks, a: find(c.a) || weeks[weeks.length - 1], b: find(c.b) || weeks[0] };
}

/** The photo of a pose in a week (the latest one if it was taken twice). */
const photoIn = (week, pose) => (week ? week.items.filter((i) => i.pose === pose).pop() : null);

/** Every pose of two weeks side by side; tap a row for the full-screen slider. */
function renderCompareWeeks() {
  const { weeks, a, b } = compareWeeks();
  if (weeks.length < 2) return `<section class="card stack"><h2 class="section-title" style="margin:0">Compare weeks</h2><p class="empty">Photos from two different weeks are needed to compare.</p></section>`;
  const pick = (k, sel) =>
    `<select class="select" data-change="compareWeek" data-k="${k}" aria-label="${k === 'a' ? 'Before' : 'After'} week">${[...weeks]
      .reverse()
      .map((w) => `<option value="${esc(w.folder)}" ${w.folder === sel.folder ? 'selected' : ''}>Week ${w.n}</option>`)
      .join('')}</select>`;
  const all = [...new Set([...poses(), ...a.items.map((i) => i.pose), ...b.items.map((i) => i.pose)])];
  const rows = all
    .map((pose) => ({ pose, x: photoIn(a, pose), y: photoIn(b, pose) }))
    .filter((r) => r.x || r.y)
    .map(
      (r) => `<button type="button" class="compare-row" data-action="openSlider" data-pose="${esc(r.pose)}" ${r.x && r.y ? '' : 'disabled'} aria-label="Compare ${esc(r.pose)}">
        <span class="compare-pose">${esc(r.pose)}</span>
        <span class="compare">
          <figure>${r.x ? `<img src="${r.x.thumbUrl}" alt="" />` : '<span class="no-photo">—</span>'}</figure>
          <figure>${r.y ? `<img src="${r.y.thumbUrl}" alt="" />` : '<span class="no-photo">—</span>'}</figure>
        </span>
      </button>`,
    )
    .join('');
  const gap = Progress.daysBetween(a.end, b.end);
  return `<section class="card stack">
      <h2 class="section-title" style="margin:0">Compare weeks</h2>
      <div class="two">${pick('a', a)}${pick('b', b)}</div>
      <p class="hint" style="margin:0">Week ${a.n} (${esc(formatDate(a.start, false))} to ${esc(formatDate(a.end, false))}) → Week ${b.n} (${esc(formatDate(b.start, false))} to ${esc(formatDate(b.end, false))})${gap ? `, ${weeksLater(a.end, b.end)}` : ''}. Tap a pose to slide between the two.</p>
      ${rows}
    </section>`;
}

/** Full screen: the "after" photo over the "before" one, revealed by dragging the slider. */
function renderSlider() {
  const s = state.ui.vault.slider;
  if (!s) return '';
  const pos = Number.isFinite(s.pos) ? s.pos : 50;
  return `<div class="viewer slider-view" id="slider">
      <div class="slider-stage">
        <img data-photo="${esc(s.a)}" alt="Week ${s.na} ${esc(s.pose)}" />
        <img data-photo="${esc(s.b)}" class="slider-top" id="slider-top" style="clip-path: inset(0 0 0 ${pos}%)" alt="Week ${s.nb} ${esc(s.pose)}" />
        <span class="slider-line" id="slider-line" style="left:${pos}%"></span>
        <span class="slider-tag left">Week ${s.na}</span><span class="slider-tag right">Week ${s.nb}</span>
      </div>
      <div class="viewer-bar">
        <input type="range" min="0" max="100" value="${pos}" class="slider-range" data-input="sliderPos" aria-label="Before or after" />
        <button type="button" class="btn" data-action="closeSlider">Close</button>
      </div>
    </div>`;
}

const fileSize = (bytes) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** One folder per week, newest first, named as they will be in Files; the open one shows its photos. */
function renderWeekFolders() {
  const v = state.ui.vault;
  const weeks = weekFolders(v.items);
  if (!weeks.length) return `<section class="card"><h2 class="section-title">Week folders</h2><p class="empty">No photos yet.</p></section>`;
  const open = openWeek();
  const unsaved = unsavedWeeks();
  const saved = state.vaultInfo.weeksSaved || {};
  return `
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Week folders (${v.items.length} photo${v.items.length === 1 ? '' : 's'})</h2>
      <p class="hint" style="margin:0">Save a week, then in the share sheet tap <strong>Save to Files</strong> → iCloud Drive → <strong>Bhimlekha</strong>. In Files, tap the saved .zip once and it becomes the week's folder (then delete the .zip).</p>
      ${weeks
        .map((w) => {
          const isOpen = w.folder === open;
          const pending = unsaved.includes(w.folder);
          const file = v.weekFiles[w.folder];
          const state_ = pending ? '<span class="badge pending">Not saved</span>' : saved[w.folder] ? `<span class="badge ok">✓ Saved ${esc(formatDate(saved[w.folder].slice(0, 10), false))}</span>` : '';
          return `<div class="folder ${isOpen ? 'open' : ''}">
            <button type="button" class="folder-head" data-action="toggleWeek" data-folder="${esc(w.folder)}" aria-expanded="${isOpen}">
              <span class="folder-name">📁 ${esc(w.folder)}</span>
              <span class="small muted">${w.items.length} photo${w.items.length === 1 ? '' : 's'} ${state_}</span>
            </button>
            ${
              isOpen
                ? `<div class="thumbs">${w.items
                    .map(
                      (it) => `<button type="button" class="thumb" data-action="viewPhoto" data-id="${esc(it.id)}" aria-label="${esc(it.fileName)}, ${esc(formatDate(it.date))}">
                        <img src="${it.thumbUrl}" alt="" /><span>${esc(it.fileName)}</span></button>`,
                    )
                    .join('')}</div>
                   <button type="button" class="btn ${pending ? 'primary' : 'secondary'}" data-action="saveWeek" data-folder="${esc(w.folder)}" ${file ? '' : 'disabled'}>${
                     file ? `📁 Save Week ${w.n} to Files (${fileSize(file.size)})` : file === false ? 'Could not prepare this week' : 'Preparing…'
                   }</button>`
                : ''
            }
          </div>`;
        })
        .join('')}
    </section>`;
}

function renderFaceIdCard() {
  const v = state.ui.vault;
  const f = v.faceId || {};
  let body;
  if (f.on) {
    body = `<p class="small" style="margin:0">✅ Face ID is on. The passcode still works too.</p>
      <button type="button" class="btn secondary" data-action="vaultFaceOff">Turn off Face ID</button>`;
  } else if (v.faceStep === 'confirm') {
    body = `<p class="small" style="margin:0">The passkey is made. One more Face ID scan finishes it.</p>
      <button type="button" class="btn primary" data-action="vaultFaceConfirm">Confirm with Face ID</button>`;
  } else if (f.possible === false || v.faceStep === 'unsupported') {
    body = `<p class="small" style="margin:0">This phone's browser cannot hold the vault key with Face ID (it needs iOS 18 or later). Keep using the passcode.</p>`;
  } else {
    body = `<p class="small" style="margin:0">Unlock with your face instead of typing the passcode. iOS saves a passkey named “Bhimlekha photo vault” in the Passwords app; Face ID releases the vault key from it, so it is as safe as the passcode.</p>
      <button type="button" class="btn secondary" data-action="vaultFaceOn">Turn on Face ID</button>`;
  }
  return `<section class="card stack"><h2 class="section-title" style="margin:0">Face ID</h2>${body}</section>`;
}

function renderBackupCard() {
  const v = state.ui.vault;
  const info = state.vaultInfo;
  const behind = info.lastPhotoAt && (!info.lastBackupAt || info.lastBackupAt < info.lastPhotoAt);
  const size = v.backup ? fileSize(v.backup.file.size) : '';
  return `
    <section class="card stack">
      <h2 class="section-title" style="margin:0">Full encrypted backup</h2>
      <p class="small" style="margin:0">${
        info.lastBackupAt ? `Last one ${esc(formatDate(info.lastBackupAt.slice(0, 10)))}.` : 'None yet.'
      } ${behind && info.lastBackupAt ? 'New photos since then.' : ''}</p>
      <p class="hint" style="margin:0">For moving the vault to a new phone: one file with every photo, encrypted with your passcode, that Bhimlekha can restore. The week folders are for looking at in Files.</p>
      <button type="button" class="btn secondary" data-action="saveBackup" ${v.backup && v.backup.photos ? '' : 'disabled'}>${
        v.backup ? (v.backup.photos ? `Save encrypted backup (${v.backup.photos} photo${v.backup.photos === 1 ? '' : 's'}, ${size})` : 'Nothing to back up yet') : 'Preparing backup…'
      }</button>
      ${
        v.status === 'unlocked'
          ? `<button type="button" class="btn secondary" data-action="vaultRestorePick">Restore photos from a backup…</button>`
          : ''
      }
    </section>`;
}

/** Fill the comparison and viewer images (decrypted on demand, revoked on lock). */
async function loadVisibleImages() {
  const v = state.ui.vault;
  if (!Vault.isUnlocked()) return;
  for (const img of document.querySelectorAll('img[data-photo]')) {
    if (!img.src && img.dataset.photo) img.src = (await Vault.imageUrl(img.dataset.photo)) || '';
  }
  if (v.viewing) {
    const img = document.getElementById('viewer-img');
    if (img) img.src = (await Vault.imageUrl(v.viewing)) || '';
  }
}

function markPhotoAdded() {
  state.vaultInfo = { ...state.vaultInfo, lastPhotoAt: nowISO() };
  save(KEYS.vaultInfo, state.vaultInfo);
}

/* ------------------------------------------------------------ camera */

const cam = { stream: null, facing: 'user', ghost: true, timer: null, poseIndex: 0, shot: null, countdown: null };

function stopCamera() {
  clearInterval(cam.countdown);
  cam.countdown = null;
  if (cam.stream) for (const t of cam.stream.getTracks()) t.stop();
  cam.stream = null;
  cam.shot = null;
  const el = document.getElementById('camera');
  if (el) {
    el.hidden = true;
    el.innerHTML = '';
  }
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('In-app camera not available here. Use the iPhone camera button.', 'error');
    return;
  }
  cam.poseIndex = Math.max(0, poses().indexOf(state.ui.vault.pose));
  cam.timer = Number(state.settings.cameraTimer) || 0;
  await startStream();
}

async function startStream() {
  if (cam.stream) for (const t of cam.stream.getTracks()) t.stop();
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cam.facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false,
    });
  } catch {
    cam.stream = null;
    toast('Camera permission was refused. Allow it in Settings → Safari → Camera, or use the iPhone camera button.', 'error');
    return;
  }
  await renderCamera();
}

async function renderCamera() {
  const el = document.getElementById('camera');
  const pose = poses()[cam.poseIndex];
  const date = state.ui.vault.date || todayISO();
  const prior = state.ui.vault.items.filter((i) => i.pose === pose && i.date < date)[0];
  el.innerHTML = `
    <div class="cam-stage ${cam.facing === 'user' ? 'mirror' : ''}">
      <video id="cam-video" autoplay playsinline muted></video>
      <img id="cam-ghost" class="ghost" alt="" ${cam.ghost && prior ? '' : 'hidden'} />
      ${cam.shot ? `<img id="cam-shot" class="shot" alt="Captured ${esc(pose)} photo" />` : ''}
      <div class="cam-count" id="cam-count" hidden></div>
    </div>
    <div class="cam-top"><span class="badge">${esc(pose)} · ${cam.poseIndex + 1}/${poses().length}</span></div>
    <div class="cam-bar">
      ${
        cam.shot
          ? `<button type="button" class="btn" data-cam="retake">Retake</button>
             <button type="button" class="btn primary" data-cam="keep">Keep ${esc(pose)}</button>`
          : `<button type="button" class="btn" data-cam="close">Done</button>
             <button type="button" class="btn" data-cam="timer">⏱ ${cam.timer ? cam.timer + ' s' : 'Off'}</button>
             <button type="button" class="btn shutter" data-cam="shoot" aria-label="Take ${esc(pose)} photo"></button>
             <button type="button" class="btn" data-cam="ghost" aria-pressed="${cam.ghost}">Overlay</button>
             <button type="button" class="btn" data-cam="flip">Flip</button>`
      }
    </div>`;
  el.hidden = false;
  const video = document.getElementById('cam-video');
  video.srcObject = cam.stream;
  if (cam.shot) document.getElementById('cam-shot').src = cam.shot.url;
  if (cam.ghost && prior) {
    const g = document.getElementById('cam-ghost');
    g.src = (await Vault.imageUrl(prior.id)) || '';
  }
}

function captureFrame() {
  const video = document.getElementById('cam-video');
  if (!video || !video.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext('2d');
  if (cam.facing === 'user') {
    // Save the front camera the way it is previewed (mirrored), so the overlay and comparisons line up.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return c;
}

async function camAction(what) {
  touchVault();
  if (what === 'close') {
    stopCamera();
    await refreshPhotos();
    return render();
  }
  if (what === 'flip') {
    cam.facing = cam.facing === 'user' ? 'environment' : 'user';
    return startStream();
  }
  if (what === 'ghost') {
    cam.ghost = !cam.ghost;
    return renderCamera();
  }
  if (what === 'timer') {
    const steps = [0, 3, 5, 10, 15];
    cam.timer = steps[(steps.indexOf(cam.timer) + 1) % steps.length];
    state.settings.cameraTimer = cam.timer;
    save(KEYS.settings, state.settings);
    return renderCamera();
  }
  if (what === 'shoot') {
    if (cam.countdown) return;
    const fire = () => {
      const canvas = captureFrame();
      if (!canvas) return toast('Camera not ready yet', 'error');
      canvas.toBlob((blob) => {
        cam.shot = { canvas, url: URL.createObjectURL(blob) };
        renderCamera();
      }, 'image/jpeg', 0.9);
    };
    if (!cam.timer) return fire();
    let left = cam.timer;
    const box = document.getElementById('cam-count');
    box.hidden = false;
    box.textContent = left;
    cam.countdown = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(cam.countdown);
        cam.countdown = null;
        box.hidden = true;
        fire();
      } else box.textContent = left;
    }, 1000);
    return;
  }
  if (what === 'retake') {
    URL.revokeObjectURL(cam.shot.url);
    cam.shot = null;
    return renderCamera();
  }
  if (what === 'keep') {
    const pose = poses()[cam.poseIndex];
    const shot = cam.shot;
    cam.shot = null;
    URL.revokeObjectURL(shot.url);
    try {
      await Vault.addPhoto(shot.canvas, { date: state.ui.vault.date || todayISO(), pose });
      markPhotoAdded();
      state.ui.vault.openWeek = photoWeek(state.ui.vault.date || todayISO()).folder;
      toast(`${pose} saved (encrypted)`);
    } catch (err) {
      toast(`Could not save: ${err.message || err}`, 'error');
    }
    await refreshPhotos();
    if (cam.poseIndex < poses().length - 1) {
      cam.poseIndex += 1;
      return renderCamera();
    }
    stopCamera();
    state.ui.vault.pose = poses()[0];
    render();
    toast(`All poses saved. Now save Week ${photoWeek(state.ui.vault.date || todayISO()).n} to Files.`);
  }
}

/** Open the share sheet with a file prepared before the tap (Save to Files lives there); else download it. */
function shareFile(file, title, done) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator
      .share({ files: [file], title })
      .then(() => {
        done();
        toast('Saved');
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') toast('Could not open the share sheet', 'error');
      });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  done();
  toast('Downloaded. Move it to iCloud Drive → Bhimlekha in Files.');
}

/** Finish a Face ID setup step started (synchronously) from a tap. */
function faceRun(pending) {
  const v = state.ui.vault;
  faceIdBusy = true;
  pending
    .then((step) => {
      if (step === 'done') {
        v.faceId = { ...v.faceId, on: true };
        v.faceStep = '';
        toast('Face ID is on');
      } else v.faceStep = 'confirm';
    })
    .catch((err) => {
      if (err?.message === 'unsupported') v.faceStep = 'unsupported';
      else if (err?.name === 'InvalidStateError') toast('A passkey for this vault already exists. Delete “Bhimlekha photo vault” in the Passwords app, then try again.', 'error');
      else if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') toast(`Face ID setup failed: ${err.message || err}`, 'error');
    })
    .finally(() => {
      faceIdBusy = false;
      touchVault();
      render();
    });
}

/* ------------------------------------------------------------ handlers */

const trackActions = {
  openExercise(el) {
    go('progress', el.dataset.name);
  },


  saveCheckin() {
    const d = bodyDraft();
    const values = {};
    for (const [k, v] of Object.entries(d.values)) if (v !== '' && Number.isFinite(Number(v))) values[k] = Number(v);
    if (!Object.keys(values).length) return toast('Enter at least one measurement', 'error');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return toast('Pick a date', 'error');
    queueMeasurement(newMeasurement('checkin', d.date, values, d.notes.trim()));
    state.ui.body.draft = null;
    toast('Check-in saved');
    render();
  },

  saveWeighIn() {
    const wf = weightField();
    const v = Number(state.ui.body.weighIn);
    if (!wf || !Number.isFinite(v) || v <= 0) return toast('Enter your weight', 'error');
    queueMeasurement(newMeasurement('weighin', todayISO(), { [wf]: v }));
    state.ui.body.weighIn = '';
    toast('Weight saved');
    render();
  },

  async deleteMeasurement(el) {
    const m = state.measurements.find((x) => x.id === el.dataset.id);
    if (!m) return;
    const ok = await openModal({
      title: 'Delete this entry?',
      message: m.synced ? 'It is removed from this phone. The row in the Sheet stays; delete it there too if you want it gone.' : 'It has not reached the Sheet yet and will not be sent.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    state.measurements = state.measurements.filter((x) => x.id !== m.id);
    state.mOutbox = state.mOutbox.filter((x) => x.id !== m.id);
    save(KEYS.measurements, state.measurements);
    save(KEYS.mOutbox, state.mOutbox);
    render();
  },

  syncMeasurements() {
    syncMeasurementsFromSheet();
  },

  async vaultCreate() {
    const v = state.ui.vault;
    if ((v.pass1 || '').length < 6) return toast('Use at least 6 characters', 'error');
    if (v.pass1 !== v.pass2) return toast('The two passcodes differ', 'error');
    v.busy = 'Creating…';
    render();
    try {
      await Vault.create(v.pass1);
      v.status = 'unlocked';
      v.items = [];
      v.pass1 = v.pass2 = '';
      touchVault();
      toast('Vault created');
    } catch (err) {
      toast(String(err.message || err), 'error');
    } finally {
      v.busy = '';
    }
    render();
  },

  async vaultUnlock() {
    const v = state.ui.vault;
    if (!v.pass1) return toast('Enter the passcode', 'error');
    v.busy = 'Unlocking…';
    render();
    let ok = false;
    try {
      ok = await Vault.unlock(v.pass1);
    } catch (err) {
      toast(String(err.message || err), 'error');
    }
    v.pass1 = '';
    v.busy = '';
    if (!ok) {
      toast('Wrong passcode', 'error');
      return render();
    }
    v.status = 'unlocked';
    await refreshPhotos();
    touchVault();
    render();
  },

  vaultLock() {
    lockVault();
    render();
  },

  async vaultErase() {
    const ok = await openModal({
      title: 'Erase the photo vault?',
      message: 'Every photo on this phone is deleted for good. Backup files in iCloud Drive stay, but still need their passcode.',
      confirmText: 'Erase',
      danger: true,
    });
    if (!ok) return;
    await Vault.destroy();
    state.ui.vault = { ...state.ui.vault, status: 'none', items: [], backup: null };
    state.vaultInfo = { lastPhotoAt: null, lastBackupAt: null };
    save(KEYS.vaultInfo, state.vaultInfo);
    render();
  },

  async vaultChangePass() {
    const v = state.ui.vault;
    if (!v.pass1) return toast('Enter the current passcode', 'error');
    if ((v.pass2 || '').length < 6) return toast('New passcode: at least 6 characters', 'error');
    if (v.pass2 !== v.pass3) return toast('The new passcodes differ', 'error');
    v.busy = 'Re-encrypting photos…';
    render();
    const ok = await Vault.changePasscode(v.pass1, v.pass2).catch(() => false);
    v.busy = '';
    v.pass1 = v.pass2 = v.pass3 = '';
    if (!ok) {
      toast('Current passcode is wrong', 'error');
      return render();
    }
    await refreshPhotos();
    v.faceId = { ...v.faceId, on: false }; // the vault turned Face ID off: its copy held the old key
    markPhotoAdded(); // the old backup no longer matches: ask for a new one
    toast('Passcode changed. Save a new backup.');
    render();
  },

  openCamera() {
    touchVault();
    openCamera();
  },

  pickPhoto() {
    document.getElementById('photo-file')?.click();
  },

  async viewPhoto(el) {
    state.ui.vault.viewing = el.dataset.id;
    render();
  },

  closePhoto() {
    state.ui.vault.viewing = null;
    render();
  },

  async deletePhoto() {
    const id = state.ui.vault.viewing;
    const ok = await openModal({ title: 'Delete this photo?', message: 'It is removed from the vault. Older backup files still contain it.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    const item = state.ui.vault.items.find((i) => i.id === id);
    await Vault.remove(id);
    state.ui.vault.viewing = null;
    markPhotoAdded();
    await refreshPhotos(item ? photoWeek(item.date).folder : null);
    render();
  },

  saveBackup() {
    const b = state.ui.vault.backup;
    if (!b) return;
    shareFile(b.file, 'Bhimlekha photo backup', () => {
      state.vaultInfo = { ...state.vaultInfo, lastBackupAt: nowISO() };
      save(KEYS.vaultInfo, state.vaultInfo);
      render();
    });
  },

  saveWeek(el) {
    const folder = el.dataset.folder;
    const file = state.ui.vault.weekFiles[folder];
    if (!file) return;
    touchVault();
    shareFile(file, folder, () => {
      state.vaultInfo = { ...state.vaultInfo, weeksSaved: { ...(state.vaultInfo.weeksSaved || {}), [folder]: nowISO() } };
      save(KEYS.vaultInfo, state.vaultInfo);
      render();
    });
  },

  openSlider(el) {
    const { a, b } = compareWeeks();
    const x = photoIn(a, el.dataset.pose);
    const y = photoIn(b, el.dataset.pose);
    if (!x || !y) return;
    state.ui.vault.slider = { pose: el.dataset.pose, a: x.id, b: y.id, na: a.n, nb: b.n, pos: 50 };
    touchVault();
    render();
  },

  closeSlider() {
    state.ui.vault.slider = null;
    render();
  },

  toggleWeek(el) {
    const v = state.ui.vault;
    v.openWeek = openWeek() === el.dataset.folder ? '' : el.dataset.folder; // '' = all closed
    touchVault();
    render();
  },

  // Face ID: each WebAuthn call is the first thing the tap does, because iOS only shows the sheet from a tap.
  vaultFaceUnlock() {
    const v = state.ui.vault;
    faceIdBusy = true;
    const pending = Vault.unlockWithFaceId();
    v.busy = 'Waiting for Face ID…';
    render();
    pending
      .then(async (ok) => {
        if (!ok) return toast('Face ID did not open the vault. Use the passcode, then turn Face ID on again.', 'error');
        v.status = 'unlocked';
        await refreshPhotos();
        touchVault();
      })
      .catch((err) => {
        if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') toast(`Face ID failed: ${err.message || err}. Use the passcode.`, 'error');
      })
      .finally(() => {
        faceIdBusy = false;
        v.busy = '';
        render();
      });
  },

  vaultFaceOn() {
    faceRun(Vault.faceIdSetup());
  },

  vaultFaceConfirm() {
    faceRun(Vault.faceIdConfirm());
  },

  async vaultFaceOff() {
    const ok = await openModal({ title: 'Turn off Face ID?', message: 'The vault will open with the passcode only. You can also delete the “Bhimlekha photo vault” passkey in the Passwords app.', confirmText: 'Turn off' });
    if (!ok) return;
    await Vault.faceIdOff();
    state.ui.vault.faceId = { ...state.ui.vault.faceId, on: false };
    state.ui.vault.faceStep = '';
    render();
  },

  vaultRestorePick() {
    document.getElementById('vault-restore')?.click();
  },
};

const trackChanges = {
  summaryWeek(el) {
    state.ui.summaryWeek = el.value;
    render();
  },
  progressMetric(el) {
    state.ui.progress.metric = el.value;
    render();
  },
  progressRange(el) {
    state.ui.progress.range = el.value;
    render();
  },
  bodyField(el) {
    state.ui.body.field = el.value;
    render();
  },
  bodyRange(el) {
    state.ui.body.range = el.value;
    render();
  },
  mDate(el) {
    bodyDraft().date = el.value;
  },
  photoDate(el) {
    state.ui.vault.date = el.value;
    touchVault();
    render(); // the "Goes in Week N" line follows the date
  },
  photoPose(el) {
    state.ui.vault.pose = el.value;
    render();
  },
  compareWeek(el) {
    const { a, b } = compareWeeks();
    state.ui.vault.compare = { a: a.folder, b: b.folder, [el.dataset.k]: el.value };
    touchVault();
    render();
  },
  async photoFile(el) {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file || !Vault.isUnlocked()) return;
    const v = state.ui.vault;
    const pose = poses().includes(v.pose) ? v.pose : poses()[0];
    v.busy = 'Encrypting…';
    render();
    try {
      await Vault.addPhoto(file, { date: v.date || todayISO(), pose });
      markPhotoAdded();
      v.openWeek = photoWeek(v.date || todayISO()).folder;
      await refreshPhotos();
      const next = poses()[poses().indexOf(pose) + 1];
      if (next) v.pose = next;
      toast(`${pose} saved (encrypted)`);
    } catch (err) {
      toast(`Could not save: ${err.message || err}`, 'error');
    } finally {
      v.busy = '';
    }
    render();
  },
  async vaultRestoreFile(el) {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    const values = await openModal({
      title: 'Restore photo backup',
      message: 'Enter the passcode this backup was made with.',
      fields: [{ key: 'pass', label: 'Backup passcode', value: '' }],
      confirmText: 'Restore',
    });
    if (!values || !values.pass) return;
    const v = state.ui.vault;
    v.busy = 'Restoring…';
    render();
    try {
      const res = await Vault.importBackup(file, values.pass);
      if (!res) toast('Wrong passcode for this backup', 'error');
      else {
        v.status = 'unlocked';
        await refreshPhotos();
        touchVault();
        state.vaultInfo = { ...state.vaultInfo, lastPhotoAt: state.vaultInfo.lastPhotoAt || nowISO(), lastBackupAt: nowISO() };
        save(KEYS.vaultInfo, state.vaultInfo);
        toast(`Restored ${res.added} of ${res.total} photos`);
      }
    } catch (err) {
      toast(String(err.message || err), 'error');
    } finally {
      v.busy = '';
    }
    render();
  },
};

const trackInputs = {
  sliderPos(el) {
    // Moved live without a re-render, so the images stay put while dragging.
    const pos = Number(el.value);
    if (state.ui.vault.slider) state.ui.vault.slider.pos = pos;
    const top = document.getElementById('slider-top');
    const line = document.getElementById('slider-line');
    if (top) top.style.clipPath = `inset(0 0 0 ${pos}%)`;
    if (line) line.style.left = `${pos}%`;
    touchVault();
  },
  mValue(el) {
    bodyDraft().values[el.dataset.field] = el.value;
  },
  mNotes(el) {
    bodyDraft().notes = el.value;
  },
  weighIn(el) {
    state.ui.body.weighIn = el.value;
  },
  vaultPass1(el) {
    state.ui.vault.pass1 = el.value;
  },
  vaultPass2(el) {
    state.ui.vault.pass2 = el.value;
  },
  vaultPass3(el) {
    state.ui.vault.pass3 = el.value;
  },
};
