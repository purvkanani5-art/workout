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
  // An iOS-style segmented control; it scrolls sideways when there are more options than fit.
  return `<div class="segctl" role="radiogroup" aria-label="${esc(name)}">${options
    .map(
      (o) => `<label class="${o.key === value ? 'on' : ''}">
        <input type="radio" name="${esc(name)}" value="${esc(o.key)}" data-change="${change}" ${o.key === value ? 'checked' : ''} />${esc(o.label)}</label>`,
    )
    .join('')}</div>`;
}

/* ========================================================== Progress */

const STATUS_ORDER = { increase: 0, watch: 1, ready: 2, building: 3, untracked: 4 };
const STATUS_BADGE = {
  increase: ['Add weight', 'accent'],
  ready: ['Ready', 'ok'],
  watch: ['New weight', 'warn'],
  building: ['Building', ''],
  untracked: ['No rep plan', ''],
};
const TREND_ICON = { up: ['trend', 'green'], flat: ['trend', 'grey'], down: ['trend', 'red'], first: ['trend', 'sky'] };

function renderProgress() {
  const analyses = trackedExercises()
    .map((n) => analyse(n))
    .filter(Boolean)
    .sort((a, b) => STATUS_ORDER[a.status.kind] - STATUS_ORDER[b.status.kind] || a.exercise.localeCompare(b.exercise));
  const p = state.settings.progression;
  // v2.2.2: the same count and muscles as the Muscles tab (database muscles, main 1 · helping ½, last 7 days).
  const tally = muscleSets(sessionsBetween(Progress.addDays(todayISO(), -6), todayISO()));
  const cov = Muscles.planCoverage(exerciseDb().db, planNames(), manualGroup);
  const muscles = Muscles.MUSCLES.filter((m) => tally.sets[m.key] > 0 || cov.mine[m.key].main.length);
  // v2.3: each muscle against its own target (direct targets count only main-muscle sets).
  const tgt = (k) => muscleTarget(k).sets || p.muscleSetsMin;
  const maxCount = Math.max(...muscles.map((m) => Math.max(towardTarget(m.key, tally), tgt(m.key) * 1.2)), 1);
  const due = analyses.filter((a) => a.status.kind === 'increase').length;
  const ups = analyses.filter((a) => a.trend === 'up').length;
  const downs = analyses.filter((a) => a.trend === 'down').length;
  return `
    <h1 class="large">Progress</h1>
    <p class="sub">${
      analyses.length
        ? esc([`${analyses.length} exercises tracked`, ups ? `${ups} improving` : '', downs ? `${downs} dropping` : '', due ? `${due} ready for more weight` : ''].filter(Boolean).join(' · '))
        : 'Strength, volume and weekly sets'
    }</p>
    <div class="sgroup">${recoveryCard('progress')}</div>
    ${renderWeekSummaries()}
    ${renderWeeklyStrength()}
    ${group(
      'Exercises',
      `<span class="note">${analyses.length}</span>`,
      `<div class="card flush">${
        analyses.length
          ? analyses
              .map((a) => {
                const [label, cls] = STATUS_BADGE[a.status.kind];
                const t = TREND[a.trend];
                const [g, bg] = TREND_ICON[a.trend] || TREND_ICON.flat;
                return `<button type="button" class="lrow" data-action="openExercise" data-name="${esc(a.exercise)}">${appIcon(g, bg)}
                  <span class="tx"><b>${esc(a.exercise)}</b><span>${esc(a.last.reps.join('-'))} @ ${esc(fmtKg(a.last.weight))} kg · <span class="trend ${t.cls}">${t.icon} ${esc(t.label)}</span>${a.flags.length ? ' · ⚠️' : ''}</span></span>
                  ${tag(label, cls)}${CHEV}</button>`;
              })
              .join('')
          : '<p class="empty pad">Submit a workout to start tracking.</p>'
      }</div>`,
    )}
    ${group(
      'Hard sets per muscle',
      '<a class="btn link small" href="#muscles">Muscle map ›</a>',
      `<section class="card stack">
      <p class="hint" style="margin:0">Last 7 days, counted like the Muscles tab: a main muscle gets the whole set, a helping muscle half, a tertiary muscle a quarter. The line is each muscle's weekly target (Settings → Muscle set targets; "d" = direct sets only). Tap a muscle to see which exercises gave its sets.</p>
      ${
        muscles.length
          ? `<div class="bars">${muscles
              .map((m) => {
                const n = Math.round(towardTarget(m.key, tally) * 10) / 10;
                const t = tgt(m.key);
                const state_ = n < t ? 'low' : n > t * 2 ? 'high' : 'ok';
                return `<div class="bar-row" role="button" tabindex="0" data-action="musOpen" data-key="${m.key}">
                  <span class="bar-label">${esc(m.name)}</span>
                  <span class="bar-track"><span class="bar-fill ${state_}" style="width:${Math.round((n / maxCount) * 100)}%"></span>
                    <span class="bar-band" style="left:${(t / maxCount) * 100}%;width:2px"></span></span>
                  <span class="bar-value">${n}/${t}${muscleTarget(m.key).direct ? ' d' : ''}${state_ === 'low' ? ' · low' : state_ === 'high' ? ' · high' : ''}</span>
                </div>`;
              })
              .join('')}</div>`
          : '<p class="empty">Set muscle groups per exercise in More → Exercises &amp; plans.</p>'
      }
    </section>`,
    )}`;
}

/** Overall strength per week (each exercise vs its own previous 4 weeks), the number trigger B watches. */
function renderWeeklyStrength() {
  const weeks = Progress.weeklyStrength(statsHistory()).slice(-12);
  if (!weeks.length) return '';
  const r = state.settings.recovery;
  const last = weeks[weeks.length - 1];
  const below = [...weeks].reverse().findIndex((w) => w.pct >= -r.strengthPct);
  const run = below === -1 ? weeks.length : below;
  return group(
    'Overall strength by week',
    tag(Progress.signed(last.pct), last.pct >= 0 ? 'ok' : 'bad'),
    `<section class="card stack">
      ${Charts.line(weeks.map((w) => ({ date: w.week, y: w.pct, label: `${w.n} exercise${w.n === 1 ? '' : 's'}` })), { title: 'Change vs each exercise’s previous 4 weeks', unit: '%', digits: 1 })}
      <p class="small" style="margin:0">This week ${esc(Progress.signed(last.pct))} over ${last.n} exercise${last.n === 1 ? '' : 's'}.${
        run ? ` Below −${esc(r.strengthPct)}% for ${run} week${run === 1 ? '' : 's'} in a row; the recovery alert fires at ${esc(r.strengthWeeks)}.` : ''
      }</p>
    </section>`,
  );
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

  // Sets per muscle in the week, counted like the Muscles tab; "low" only for muscles the plan trains as main.
  const wt = muscleSets(sessions);
  const cov = Muscles.planCoverage(exerciseDb().db, planNames(), manualGroup);
  // v2.3: low / high against each muscle's own target ("6/14"); direct targets count only main-muscle sets.
  const shown = Muscles.MUSCLES.filter((m) => wt.sets[m.key] > 0 || cov.mine[m.key].main.length);
  const counts = Object.fromEntries(shown.map((m) => [m.name, Math.round(towardTarget(m.key, wt) * 10) / 10]));
  const tg = (m) => muscleTarget(m.key).sets || p.muscleSetsMin;
  const low = shown.filter((m) => counts[m.name] < tg(m)).map((m) => [m.name, `${counts[m.name]}/${tg(m)}`]);
  const high = shown.filter((m) => counts[m.name] > tg(m) * 2).map((m) => [m.name, `${counts[m.name]}/${tg(m)}`]);

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
      w.deload ? ' · lighter week' : ''
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
  rows.push(`<li><span>Sets per muscle</span>${esc(setsText)} <span class="muted">(vs each muscle's target)</span></li>`);
  if (w.weight) rows.push(`<li><span>Bodyweight</span><strong>${esc(fmtKg(Math.round(w.weight.now * 10) / 10))} kg</strong> avg${w.weight.delta !== null ? ` · ${esc(Progress.signed(w.weight.delta, 1, ' kg'))} vs last week` : ''}</li>`);
  if (w.waist) rows.push(`<li><span>Waist</span><strong>${esc(fmtKg(w.waist.now))} cm</strong>${w.waist.delta !== null ? ` · ${esc(Progress.signed(w.waist.delta, 1, ' cm'))}` : ''}</li>`);
  if (w.feel !== null) rows.push(`<li><span>How you felt</span><strong>${w.feel.toFixed(1)} / 5</strong> average</li>`);
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
  return notice(
    'week-summary',
    'trend',
    'green',
    `${w.week.folder.split(' - ')[0]} summary${w.running ? ' (ends today)' : ''}`,
    `${esc(formatDate(w.start, false))} to ${esc(formatDate(w.end, false))}${w.missed.length ? ` · ${w.missed.length} missed` : ''}${w.best ? ` · best ${esc(w.best.name)} ${esc(Progress.signed(w.best.pct))}` : ''}`,
    tiles([
      [`${w.done}/${w.planned}`, 'Workouts'],
      [w.strength ? Progress.signed(w.strength.pct) : '–', 'Strength'],
      [w.weight ? `${fmtKg(Math.round(w.weight.now * 10) / 10)} kg` : '–', 'Bodyweight'],
    ]),
    '<a class="btn small pill" href="#progress">Full summary ›</a>',
  );
}

/** Progress: pick any week back to the first workout. */
function renderWeekSummaries() {
  const first = state.history.map((s) => s.date).filter(Boolean).sort()[0];
  if (!first) return '';
  const ends = [];
  for (let e = weekBounds(todayISO()).end; e >= weekBounds(first).end && ends.length < 52; e = Progress.addDays(e, -7)) ends.push(e);
  const pick = ends.includes(state.ui.summaryWeek) ? state.ui.summaryWeek : ends[0];
  const w = weekSummary(pick);
  return group(
    'Weekly summary',
    w.running ? tag('This week', 'accent') : '',
    `<section class="card stack">
      <select class="select" data-change="summaryWeek" aria-label="Week">${ends
        .map((e) => `<option value="${esc(e)}" ${e === pick ? 'selected' : ''}>${esc(photoWeek(e).folder)}</option>`)
        .join('')}</select>
      ${tiles([
        [`${w.done}/${w.planned}`, 'Workouts'],
        [w.strength ? Progress.signed(w.strength.pct) : '–', 'Strength'],
        [w.weight ? `${fmtKg(Math.round(w.weight.now * 10) / 10)} kg` : '–', 'Bodyweight'],
      ])}
      ${renderWeekSummary(w)}
    </section>`,
  );
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
  const [label, cls] = STATUS_BADGE[a.status.kind];
  const best = Math.max(...a.snaps.map((s) => s.perf));
  return `
    ${topbar(name, { href: 'progress', label: 'Progress' })}
    <p class="sub">${a.snaps.length} session${a.snaps.length === 1 ? '' : 's'} logged${planText(a.last.dayType, name) ? ` · Plan ${esc(planText(a.last.dayType, name))}` : ''} · ${tag(label, cls)}</p>
    <div class="sgroup">${tiles([
      [`${fmtKg(a.last.weight)} kg`, 'Working weight'],
      [a.last.reps.join('-'), 'Last reps'],
      [`${fmtKg(Math.round(best * 10) / 10)} kg`, 'Best est. 1RM'],
    ])}</div>
    ${status ? `<p class="status-line ${esc(a.status.kind)}">${esc(status)}</p>` : ''}
    ${a.flags.map((f) => `<p class="flag">${icon('alert')}<span>${esc(f.kind === 'stall' ? `Stalled for ${f.sessions} sessions at ${fmtKg(a.last.weight)} kg.` : `Est. strength ${Progress.signed(f.pct)} over the last ${f.sessions} sessions.`)}</span></p>`).join('')}
    ${group(
      'Chart',
      '',
      `<section class="card stack">
      ${segmented('metric', METRICS, metric.key, 'progressMetric')}
      ${segmented('range', RANGES, ui.range, 'progressRange')}
      ${Charts.line(
        snaps.map((s) => ({ date: s.date, y: metric.get(s), label: `${s.reps.join('-')} @ ${fmtKg(s.weight)} kg` })),
        { title: metric.title, unit: metric.unit, digits: metric.digits },
      )}
    </section>`,
    )}
    ${group(
      'What the chart says',
      '',
      w
        ? `<section class="card">
            ${w.quant.length ? `<ul class="quant">${w.quant.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
            <p class="note-text">${esc(w.words)}</p>
          </section>`
        : '<div class="card"><p class="empty" style="padding:8px">No sessions in this range.</p></div>',
    )}
    ${group(
      'Sessions',
      `<span class="note">${snaps.length}</span>`,
      `<div class="card flush">${[...snaps]
        .reverse()
        .map(
          (s) => `<div class="xrow"><div class="tx"><b>${esc(s.reps.join('-'))} @ ${esc(fmtKg(s.weight))} kg</b><span>${esc(
            [`${WEEKDAYS[new Date(Date.parse(s.date)).getUTCDay()].slice(0, 3)} ${formatDate(s.date, false)}`, s.rirs.some((r) => r !== null) ? `RIR ${s.rirs.map((r) => (r === null ? '?' : rirLabel(r))).join('-')}` : '']
              .filter(Boolean)
              .join(' · '),
          )}</span></div><span class="n"><b>${esc(fmtKg(Math.round(s.perf * 10) / 10))} kg</b><span>${esc(fmtVolume(s.volume))}</span></span></div>`,
        )
        .join('')}</div>`,
    )}`;
}

/* ============================================================== Body */

const BF_KEY = 'Body fat (%, Navy)'; // stored with a check-in for the Sheet; charted as "Body fat"
const BF_CHART = 'Body fat (%)'; // the Trends chart works it out from the tape measurements each time

/** Where to put the tape, by field name (the owner: abdomen at the navel, waist where the waistband sits). */
function fieldHint(f) {
  if (/abdomen|navel/i.test(f)) return 'at the navel';
  if (/waist/i.test(f)) return 'where the waistband sits';
  if (/neck/i.test(f)) return 'just below the Adam’s apple';
  if (/hip/i.test(f)) return 'widest part of the buttocks';
  return '';
}

/** Body fat (US Navy) and the calorie target to enter in MyFitnessPal, with the working shown. */
function renderCalories() {
  const s = state.settings;
  const p = s.profile || {};
  const { calc, bf, weight, series } = calorieState();
  const lock = s.calorieLock;
  const map = Body.navyFields(measureFields());
  const missingFields = Body.navyMissing(p.sex, map);
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const c = s.calories;
  const rows = [];
  if (calc.target) {
    rows.push(`Resting burn ${calc.bmr.toLocaleString('en-IN')} kcal (${calc.method}${calc.lbm ? `, lean mass ${fmtKg(calc.lbm)} kg` : `, age ${calc.age}`})`);
    rows.push(`× ${c.lifeFactor} daily life = ${calc.life.toLocaleString('en-IN')}`);
    rows.push(`+ workouts ${calc.workout} a day (${calc.workouts} logged in ${c.workoutDays} days, less ${c.watchDiscountPct}% for watch overestimate)`);
    rows.push(`= burn about ${calc.tdee.toLocaleString('en-IN')} kcal a day`);
    if (c.goal !== 'maintain') rows.push(`${calc.change > 0 ? '+' : '−'} ${Math.abs(calc.change)} for ${c.goal === 'gain' ? 'gaining' : 'losing'} ${c.ratePct}% of bodyweight a week${calc.floored ? (c.floorBmr === false ? ' (held at 1,200 kcal, the lowest it goes)' : ' (held at your resting burn: switch this off in Settings for a bigger deficit)') : ''}`);
  }
  // Actual weekly change vs the plan, from weekly weight averages.
  const wf = weightField();
  const avgs = wf ? Progress.weeklyAverages(state.measurements, wf) : [];
  const rc = Body.rateCheck(avgs, c);
  let rateLine = '';
  if (rc) {
    const diff = rc.pct - rc.plan;
    rateLine = `Last ${rc.weeks} weeks: ${Progress.signed(rc.kgPerWeek, 2, ' kg')} a week (${Progress.signed(rc.pct, 2, '%')}; plan ${Progress.signed(rc.plan, 2, '%')}). ${
      Math.abs(diff) < 0.25 ? 'On plan.' : (c.goal === 'gain' ? diff < 0 : diff > 0) ? 'Slower than planned: check what you log in MyFitnessPal is accurate before eating less.' : 'Faster than planned: if strength is dropping, eat a little more.'
    }`;
  }
  const kv = (k, v, h, d = '') => `<div class="kv"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="h">${esc(h)}</div><div class="d">${esc(d)}</div></div>`;
  return group(
    'Body fat & calories',
    '<a class="btn link small" href="#settings/calories">Settings ›</a>',
    `<section class="card stack">
      ${
        bf
          ? `<div class="kvs">${kv('Body fat', `${fmtKg(bf.bf)}%`, `US Navy · ${formatDate(bf.date, false)}`, prev ? `${Progress.signed(Math.round((bf.bf - prev.bf) * 10) / 10, 1, '%')} since ${formatDate(prev.date, false)}` : '')}${
              bf.lbm ? kv('Lean mass', `${fmtKg(bf.lbm)} kg`, 'Accurate to about ±3%: follow the trend', prev?.lbm ? Progress.signed(Math.round((bf.lbm - prev.lbm) * 10) / 10, 1, ' kg') : '') : ''
            }</div>`
          : `<p class="small muted" style="margin:0">${
              !p.heightCm
                ? 'Add your height in More → Calories & body fat to get body fat from the check-in.'
                : missingFields.length
                  ? `Body fat needs these check-in fields: ${esc(missingFields.join(', '))}. Add them in More → Measurements & photos.`
                  : `Body fat appears after a check-in with ${p.sex === 'female' ? 'neck, waist and hips' : 'neck and abdomen'}.`
            }</p>`
      }
      ${
        calc.target
          ? `<div class="target">
               <p class="small muted" style="margin:0">Enter in MyFitnessPal</p>
               <p style="margin:2px 0"><strong class="big">${esc((lock?.target ?? calc.target).toLocaleString('en-IN'))}</strong> kcal a day</p>
               ${lock ? `<p class="small muted" style="margin:0">Set ${esc(formatDate(lock.date))} (${esc(TARGET_REASON[lock.reason] || lock.reason)})${lock.target !== calc.target ? ` · today's calculation ${esc(calc.target.toLocaleString('en-IN'))}: it moves after a week if the gap is ${c.changeKcal}+ kcal, at once with a new body fat reading or ${c.recalcKg} kg of weight change` : ''}.</p>` : ''}
             </div>
             ${rateLine ? `<p class="small" style="margin:0">${esc(rateLine)}</p>` : ''}
             <details class="workings">
               <summary>How the target is worked out</summary>
               <ul class="quant">${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
               <p class="small muted" style="margin:8px 0 0">Weight used: ${esc(fmtKg(weight.kg))} kg (${weight.n >= 3 ? `average of ${weight.n} weigh-ins this week` : `entry of ${esc(formatDate(weight.date))}`}).</p>
             </details>`
          : `<p class="small muted" style="margin:0">For a calorie target, add ${esc(calc.missing.join(', '))}${calc.missing.includes('bodyweight') ? ' (a weigh-in or check-in)' : ' in More → Calories & body fat'}.</p>
             ${rateLine ? `<p class="small" style="margin:0">${esc(rateLine)}</p>` : ''}`
      }
    </section>`,
  );
}

function bodyDraft() {
  const b = state.ui.body;
  if (!b.draft) b.draft = { date: todayISO(), values: {}, notes: '' };
  // Less typing: today's weigh-in fills the check-in's bodyweight.
  const wf = weightField();
  if (wf && b.draft.values[wf] === undefined && b.draft.date === todayISO()) {
    const w = state.measurements.filter((m) => m.date === todayISO() && m.kind === 'weighin' && Number.isFinite(m.values?.[wf])).pop();
    if (w) b.draft.values[wf] = w.values[wf];
  }
  return b.draft;
}

function lastValue(field) {
  const list = [...state.measurements].filter((m) => Number.isFinite(m.values?.[field])).sort((a, b) => b.date.localeCompare(a.date));
  return list[0] ? list[0].values[field] : null;
}

/** Points for a field: weekly averages when there are daily weigh-ins for the weight field, else each entry. */
function bodySeries(field) {
  if (field === BF_CHART) {
    return { label: 'Body fat (%), US Navy', points: bodyFatSeries().filter((x) => inRange(x.date, state.ui.body.range)).map((x) => ({ date: x.date, y: x.bf })) };
  }
  const list = state.measurements.filter((m) => Number.isFinite(m.values?.[field]) && inRange(m.date, state.ui.body.range));
  if (field === weightField() && list.some((m) => m.kind === 'weighin')) {
    return {
      label: `${field}, weekly average`,
      points: Progress.weeklyAverages(list, field).map((w) => ({ date: w.week, y: w.avg, label: `${w.n} weigh-in${w.n === 1 ? '' : 's'}` })),
    };
  }
  return { label: field, points: list.sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ date: m.date, y: m.values[field] })) };
}

/* ------------------------------------------------------- small workout */

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Small workout": one tap saves when it happened. Date and time default to now and can be changed. */
function renderSmallWorkout() {
  const ui = state.ui.body;
  const list = [...state.small].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  return group(
    'Small workouts',
    `<span class="note">${list.length} in total</span>`,
    `<section class="card stack">
      <div class="two">
        <div>
          <label for="small-date">Date</label>
          <input id="small-date" type="date" class="input" value="${esc(ui.smallDate || todayISO())}" data-change="smallDate" />
        </div>
        <div>
          <label for="small-time">Time</label>
          <input id="small-time" type="time" class="input" value="${esc(ui.smallTime || nowTime())}" data-change="smallTime" />
        </div>
      </div>
      <div>
        <label for="small-note">Notes (optional)</label>
        <input id="small-note" class="input" value="${esc(ui.smallNote || '')}" placeholder="e.g. 50 push-ups, 20 min walk" data-input="smallNote" autocomplete="off" />
      </div>
      <button type="button" class="btn primary" data-action="smallCheckIn">Check in</button>
    </section>
    ${
      list.length
        ? `<div class="card flush" style="margin-top:10px">${list
            .slice(0, 5)
            .map((s) =>
              erow(
                `${WEEKDAYS[new Date(Date.parse(s.date)).getUTCDay()].slice(0, 3)} ${formatDate(s.date, false)} · ${s.time}`,
                s.note,
                ibtn('edit', `data-action="editSmall" data-id="${esc(s.id)}"`, 'Change date or time') + ibtn('trash', `data-action="deleteSmall" data-id="${esc(s.id)}"`, 'Delete'),
              ),
            )
            .join('')}</div>
           ${list.length > 5 ? '<p class="hint gnote">Latest 5 shown.</p>' : ''}`
        : ''
    }`,
  );
}

function renderBody() {
  const d = bodyDraft();
  const fields = measureFields();
  const wf = weightField();
  const withData = fields.filter((f) => state.measurements.some((m) => Number.isFinite(m.values?.[f])));
  if (bodyFatSeries().length) withData.push(BF_CHART);
  const ui = state.ui.body;
  const field = withData.includes(ui.field) ? ui.field : withData[0];
  const series = field ? bodySeries(field) : null;
  const windowEntries = state.measurements.filter((m) => inRange(m.date, ui.range));
  const body = Progress.analyseBody(windowEntries, fields);
  const check = checkinState();
  const v = state.vaultInfo;
  const entries = [...state.measurements].sort((a, b) => b.date.localeCompare(a.date) || (b.savedAt || '').localeCompare(a.savedAt || ''));
  const unit = (f) => (f.match(/\(([^)]+)\)/) || [])[1] || '';
  const log = dailyLog();
  return `
    <h1 class="large">Body</h1>
    <p class="sub">Log daily, measure weekly</p>
    ${group('Log today', `<span class="freq">Daily · ${log.done} of ${log.total} done</span>`, log.html)}
    ${group(
      'Weekly check-in',
      check.due ? '<span class="freq">Due today</span>' : check.last ? `<span class="note">Last ${esc(formatDate(check.last, false))}</span>` : '',
      `<section class="card stack">
      <p class="hint" style="margin:0">${esc(WEEKDAYS[Number(state.settings.checkinDay) || 0])}s, same time each week: morning, before food, after the toilet, relaxed (not flexed).</p>
      <div>
        <label for="m-date">Date</label>
        <input id="m-date" type="date" class="input" value="${esc(d.date)}" data-change="mDate" />
      </div>
      <div class="two">
        ${fields
          .map((f, i) => {
            const last = lastValue(f);
            return `<div>
              <label for="m-f${i}">${esc(f)}${fieldHint(f) ? ` <span class="small muted">${esc(fieldHint(f))}</span>` : ''}</label>
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
    </section>
    <div class="card flush" style="margin-top:10px">
      <a class="lrow" href="#photos">${appIcon('lock', 'purple')}<span class="tx"><b>Progress photos</b><span>Encrypted on this phone${
        v.lastPhotoAt ? ` · last ${esc(formatDate(v.lastPhotoAt.slice(0, 10), false))}` : ''
      }</span></span>${unsavedWeeks().length ? tag('Not in Files', 'warn') : ''}${CHEV}</a>
    </div>`,
    )}

    ${renderCalories()}

    ${group(
      'Trends',
      '',
      `<section class="card stack">
      ${
        withData.length
          ? `${segmented('bodyField', withData.map((f) => ({ key: f, label: f.replace(/\s*\([^)]*\)/, '') })), field, 'bodyField')}
             ${segmented('bodyRange', RANGES, ui.range, 'bodyRange')}
             ${Charts.line(series.points, { title: series.label, unit: unit(field), digits: 1 })}
             <div class="analysis">
               <p class="sublabel" style="margin-top:0">What changed</p>
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
    </section>`,
    )}

    ${renderSmallWorkout()}

    ${group(
      'Entries',
      `<span class="note">${entries.length}</span>`,
      `${
        entries.length
          ? (() => {
              const row = (m) =>
                erow(
                  `${formatDate(m.date)} · ${m.kind === 'weighin' ? 'weigh-in' : 'check-in'}`,
                  Object.entries(m.values || {})
                    .filter(([, x]) => Number.isFinite(x))
                    .map(([k, x]) => `${k.replace(/\s*\([^)]*\)/, '')} ${fmtKg(x)}`)
                    .join(' · '),
                  (m.synced ? '' : tag('Not synced', 'warn')) + ibtn('trash', `data-action="deleteMeasurement" data-id="${esc(m.id)}"`, `Delete entry of ${formatDate(m.date)}`),
                );
              return `<div class="card flush">${entries.slice(0, 8).map(row).join('')}</div>${
                entries.length > 8
                  ? `<details class="more-rows"><summary>Show ${entries.length - 8} older</summary><div class="card flush">${entries.slice(8).map(row).join('')}</div></details>`
                  : ''
              }`;
            })()
          : '<div class="card"><p class="empty" style="padding:8px">No entries yet.</p></div>'
      }
      <p class="hint gnote syncline">${icon('sync')}<span>${state.ui.syncing ? 'Fetching from the Sheet…' : `Pulled from the Sheet automatically (last ${pulledAgo('measurements')})`}</span><button type="button" class="btn link small" data-action="syncMeasurements" ${state.ui.syncing ? 'disabled' : ''}>Sync now</button></p>`,
    )}`;
}

function newMeasurement(kind, date, values, notes = '') {
  return { id: uuid(), date, kind, values, notes, savedAt: nowISO(), synced: false };
}

async function queueMeasurement(entry) {
  state.measurements = [...state.measurements.filter((m) => m.id !== entry.id), entry];
  state.mOutbox = [...state.mOutbox.filter((m) => m.id !== entry.id), entry];
  save(KEYS.measurements, state.measurements);
  save(KEYS.mOutbox, state.mOutbox);
  updateCalorieTarget(); // a new weight or body fat reading may move the target
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
  const head = `${topbar('Photos', { href: 'body', label: 'Body' })}<p class="sub">${
    v.status === 'unlocked' ? `Unlocked · ${v.items.length} photo${v.items.length === 1 ? '' : 's'} · locks when you leave` : 'Encrypted on this phone, never uploaded'
  }</p>`;
  if (v.status === 'unknown') return `${head}<p class="empty"><span class="spin"></span>Opening the vault…</p>`;
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
    <div class="hero">${appIcon('lock', 'purple')}<b>Create your photo vault</b><p>${esc(PRIVACY_NOTE)}</p></div>
    ${group('Passcode', '', `<section class="card stack">
      <div>
        <label for="vault-p1">Passcode (at least 6 characters)</label>
        <input id="vault-p1" class="input" type="password" autocomplete="new-password" value="${esc(v.pass1 || '')}" data-input="vaultPass1" />
      </div>
      <div>
        <label for="vault-p2">Repeat passcode</label>
        <input id="vault-p2" class="input" type="password" autocomplete="new-password" value="${esc(v.pass2 || '')}" data-input="vaultPass2" />
      </div>
      <p class="flag">${icon('alert')}<span>A forgotten passcode cannot be reset. Save it in the iPhone Passwords app.</span></p>
      <button type="button" class="btn primary" data-action="vaultCreate" ${v.busy ? 'disabled' : ''}>${v.busy ? esc(v.busy) : 'Create vault'}</button>
    </section>`)}
    ${group('Have a backup?', '', `<section class="card stack">
      <p class="hint" style="margin:0">Restore a .bhimvault file from the Files app. You will need the passcode it was made with.</p>
      <button type="button" class="btn secondary" data-action="vaultRestorePick">Restore from backup file…</button>
    </section>`)}`;
}

function renderVaultLocked() {
  const v = state.ui.vault;
  const face = v.faceId?.on;
  return `
    <div class="hero">${appIcon('lock', 'purple')}<b>Vault locked</b><p>Unlock to add, view or save photos.</p></div>
    <section class="card stack" style="margin-top:16px">
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
    ${group('Add photos', '<button type="button" class="btn small pill" data-action="vaultLock">Lock</button>', `<section class="card stack">
      <div>
        <label for="photo-date">Date</label>
        <input id="photo-date" type="date" class="input" value="${esc(v.date || todayISO())}" data-change="photoDate" />
        <p class="hint" id="photo-target">${icon('folder')} Goes in <strong>${esc(target.folder)}</strong> as “${esc(photoFileName(target, pose))}”</p>
      </div>
      <button type="button" class="btn primary" data-action="openCamera">${icon('camera')} ${Number(state.settings.cameraTimer) ? `Camera with ${esc(state.settings.cameraTimer)} s timer` : 'Open camera'}</button>
      <p class="hint" style="margin:0">Takes ${esc(poses().join(', '))} in order, with last week's photo faintly overlaid so you can match the pose and distance.</p>
      <button type="button" class="btn secondary" data-action="pickPhoto">Use the iPhone camera instead…</button>
      ${segmented('pose', poses().map((p) => ({ key: p, label: p })), pose, 'photoPose')}
      ${v.busy ? `<p class="status" role="status">${esc(v.busy)}</p>` : ''}
    </section>`)}

    ${renderWeekFolders()}

    ${renderCompareWeeks()}

    ${renderFaceIdCard()}

    ${group('Change passcode', '', `<section class="card stack">
      <input class="input" type="password" placeholder="Current passcode" autocomplete="current-password" aria-label="Current passcode" value="${esc(v.pass1 || '')}" data-input="vaultPass1" />
      <input class="input" type="password" placeholder="New passcode" autocomplete="new-password" aria-label="New passcode" value="${esc(v.pass2 || '')}" data-input="vaultPass2" />
      <input class="input" type="password" placeholder="Repeat new passcode" autocomplete="new-password" aria-label="Repeat new passcode" value="${esc(v.pass3 || '')}" data-input="vaultPass3" />
      <button type="button" class="btn secondary" data-action="vaultChangePass">Change passcode</button>
      <p class="hint" style="margin:0">Old backup files keep the old passcode. Make a new backup after changing it.${v.faceId?.on ? ' Face ID turns off and needs turning on again.' : ''}</p>
    </section>`)}
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
  if (weeks.length < 2) return group('Compare weeks', '', '<div class="card"><p class="empty" style="padding:8px">Photos from two different weeks are needed to compare.</p></div>');
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
  return group(
    'Compare weeks',
    gap ? `<span class="note">${esc(weeksLater(a.end, b.end))}</span>` : '',
    `<section class="card stack">
      <div class="two">${pick('a', a)}${pick('b', b)}</div>
      <p class="hint" style="margin:0">Week ${a.n} (${esc(formatDate(a.start, false))} to ${esc(formatDate(a.end, false))}) → Week ${b.n} (${esc(formatDate(b.start, false))} to ${esc(formatDate(b.end, false))}). Tap a pose to slide between the two.</p>
      ${rows}
    </section>`,
  );
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
  if (!weeks.length) return group('Week folders', '', '<div class="card"><p class="empty" style="padding:8px">No photos yet.</p></div>');
  const open = openWeek();
  const unsaved = unsavedWeeks();
  const saved = state.vaultInfo.weeksSaved || {};
  return group(
    'Week folders',
    `<span class="note">${v.items.length} photo${v.items.length === 1 ? '' : 's'}</span>`,
    `<div class="card flush">
      ${weeks
        .map((w) => {
          const isOpen = w.folder === open;
          const pending = unsaved.includes(w.folder);
          const file = v.weekFiles[w.folder];
          const state_ = pending ? tag('Not saved', 'warn') : saved[w.folder] ? tag(`✓ Saved ${formatDate(saved[w.folder].slice(0, 10), false)}`, 'ok') : '';
          return `<div class="folder ${isOpen ? 'open' : ''}">
            <button type="button" class="folder-head" data-action="toggleWeek" data-folder="${esc(w.folder)}" aria-expanded="${isOpen}">
              ${appIcon('folder', 'sky')}
              <span class="tx"><b class="folder-name">${esc(w.folder)}</b><span>${w.items.length} photo${w.items.length === 1 ? '' : 's'}</span></span>
              ${state_}<svg class="chev fold" width="9" height="15" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
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
                     file ? `${icon('folder')} Save Week ${w.n} to Files (${fileSize(file.size)})` : file === false ? 'Could not prepare this week' : '<span class="spin"></span>Preparing…'
                   }</button>`
                : ''
            }
          </div>`;
        })
        .join('')}
    </div>
    <p class="hint gnote">Save a week, then in the share sheet tap <strong>Save to Files</strong> → iCloud Drive → <strong>Bhimlekha</strong>. In Files, tap the saved .zip once and it becomes the week's folder (then delete the .zip).</p>`,
  );
}

function renderFaceIdCard() {
  const v = state.ui.vault;
  const f = v.faceId || {};
  let body;
  if (f.on) {
    body = `<p class="small" style="margin:0">Face ID is on. The passcode still works too.</p>
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
  return group('Face ID', f.on ? tag('On', 'ok') : '', `<section class="card stack">${body}</section>`);
}

function renderBackupCard() {
  const v = state.ui.vault;
  const info = state.vaultInfo;
  const behind = info.lastPhotoAt && (!info.lastBackupAt || info.lastBackupAt < info.lastPhotoAt);
  const size = v.backup ? fileSize(v.backup.file.size) : '';
  return group(
    'Full encrypted backup',
    behind ? tag(info.lastBackupAt ? 'New photos since' : 'None yet', 'warn') : info.lastBackupAt ? tag(`✓ ${formatDate(info.lastBackupAt.slice(0, 10), false)}`, 'ok') : '',
    `<section class="card stack">
      <p class="small" style="margin:0">${
        info.lastBackupAt ? `Last one ${esc(formatDate(info.lastBackupAt.slice(0, 10)))}.` : 'None yet.'
      } ${behind && info.lastBackupAt ? 'New photos since then.' : ''}</p>
      <p class="hint" style="margin:0">For moving the vault to a new phone: one file with every photo, encrypted with your passcode, that Bhimlekha can restore. The week folders are for looking at in Files.</p>
      <button type="button" class="btn secondary" data-action="saveBackup" ${v.backup && v.backup.photos ? '' : 'disabled'}>${
        v.backup ? (v.backup.photos ? `Save encrypted backup (${v.backup.photos} photo${v.backup.photos === 1 ? '' : 's'}, ${size})` : 'Nothing to back up yet') : '<span class="spin"></span>Preparing backup…'
      }</button>
      ${
        v.status === 'unlocked'
          ? `<button type="button" class="btn secondary" data-action="vaultRestorePick">Restore photos from a backup…</button>`
          : ''
      }
    </section>`,
  );
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
             <button type="button" class="btn" data-cam="timer">${icon('timer')}${cam.timer ? cam.timer + ' s' : 'Off'}</button>
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

/* ============================================================ Muscles (v2.0) */
// Two views: "My workout" colours each muscle by the hard sets it got (last 7 days or one day); "All exercises"
// colours it by how many of the plan's exercises work it, and lists every database exercise for it. The figure's
// zoom is the SVG viewBox (200 × 460 = whole body, up to 4×). Tapping a muscle updates the panel in place, so a
// gesture is never cut short by a re-render.

const MFULL = { x: 0, y: 0, w: 200, h: 460 };
const MMAX_ZOOM = 4;

function musUi() {
  return state.ui.muscles;
}

/** Every exercise in the owner's plan (all days). */
function planNames() {
  return [...new Set(Object.values(state.exercises || {}).flat())];
}

function musSessions() {
  const u = musUi();
  const today = todayISO();
  const all = [...state.history, ...(state.draft ? [state.draft] : [])];
  if (u.period === 'day') return all.filter((s) => s.date === (u.day || today));
  const from = Progress.addDays(today, -6);
  return all.filter((s) => s.date >= from && s.date <= today);
}

function musData() {
  const { db, fromSheet } = exerciseDb();
  const u = musUi();
  // Plan coverage in both views: a muscle no exercise of the schedule trains as a main muscle is "not in your plan".
  const cov = Muscles.planCoverage(db, planNames(), manualGroup);
  const gaps = new Set(Muscles.MUSCLES.filter((m) => !cov.mine[m.key].main.length).map((m) => m.key));
  if (u.mode === 'all') {
    // Planned hard sets a week per muscle: each exercise's planned sets × how often its day is on the schedule.
    const perWeek = {};
    for (const day of Object.values(state.settings.schedule || DEFAULT_SCHEDULE)) if (day) perWeek[day] = (perWeek[day] || 0) + 1;
    const plan = Muscles.plannedDetail(db, state.exercises, perWeek, (day, name) => Progress.parsePlan(planText(day, name))?.sets || 3, manualGroup);
    return withTargets({ db, fromSheet, mode: 'all', value: plan.sets, direct: plan.direct, planBy: plan.by, perWeek, cov, gaps, scale: 'week' });
  }
  const t = Muscles.tally(db, musSessions(), manualGroup);
  return withTargets({ db, fromSheet, mode: 'mine', value: t.sets, direct: t.direct, t, cov, gaps, scale: u.period === 'day' ? 'day' : 'week' });
}

/**
 * v2.3: weekly targets on the Muscles data. d.lv(key) = colour level (week: against the muscle's own target; one day:
 * the fixed day scale). d.planW / d.doneW = planned sets a week and sets logged in the last 7 days, whichever view is
 * shown, for the planned-vs-done analysis under the body.
 */
function withTargets(d) {
  const { db } = d;
  d.sets = d.value; // so towardTarget(key, d) reads the shown numbers
  const perWeek = {};
  for (const day of Object.values(state.settings.schedule || DEFAULT_SCHEDULE)) if (day) perWeek[day] = (perWeek[day] || 0) + 1;
  d.planW = d.mode === 'all' ? { sets: d.value, direct: d.direct } : Muscles.plannedDetail(db, state.exercises, perWeek, (day, name) => Progress.parsePlan(planText(day, name))?.sets || 3, manualGroup);
  const today = todayISO();
  const from = Progress.addDays(today, -6);
  d.doneW = d.mode === 'mine' && d.scale === 'week' ? d.t : Muscles.tally(db, [...state.history, ...(state.draft ? [state.draft] : [])].filter((s) => s.date >= from && s.date <= today), manualGroup);
  d.lv = (key) => (d.scale === 'week' ? Muscles.targetLevel(towardTarget(key, d), muscleTarget(key).sets || state.settings.progression.muscleSetsMin) : Muscles.level(d.value[key], d.scale));
  return d;
}

/** Planned a week vs done in the last 7 days against the muscle's target, as two bars (direct and total shown). */
function targetAnalysisHtml(d, key) {
  const t = muscleTarget(key);
  const r1 = (x) => Math.round(x * 10) / 10;
  const line = (label, res) => {
    const n = towardTarget(key, res);
    const max = Math.max(t.sets, n, 1) * 1.15;
    const other = t.direct ? `${r1(res.sets[key] || 0)} total` : `${r1(res.direct[key] || 0)} direct`;
    return `<div class="tgtrow"><span>${esc(label)}</span><span class="tgtbar"><i class="${t.sets && n < t.sets ? 'low' : ''}" style="width:${(n / max) * 100}%"></i>${
      t.sets ? `<b style="left:${(t.sets / max) * 100}%"></b>` : ''
    }</span><span><strong>${esc(r1(n))}</strong>${t.sets ? ` / ${esc(t.sets)}` : ''} <span class="muted">(${esc(other)})</span></span></div>`;
  };
  const plan = towardTarget(key, d.planW);
  const done = towardTarget(key, d.doneW);
  const verdict = !t.sets
    ? 'No weekly target set (Settings → Muscle set targets).'
    : `Target ${t.sets} ${t.direct ? 'direct sets (as a main muscle)' : 'sets (helping ½, tertiary ¼)'} a week. Plan ${plan >= t.sets ? 'reaches it' : `is ${r1(t.sets - plan)} short`}; last 7 days ${done >= t.sets ? 'reached it' : `${r1(t.sets - done)} short`}.`;
  return `<div class="tgtan">${line('Planned / week', d.planW)}${line('Done, 7 days', d.doneW)}<span class="hint">${esc(verdict)}</span></div>`;
}

/** The muscles your schedule does not cover, as tappable chips (empty when every muscle is covered). */
function gapsHtml(d) {
  if (!d.gaps.size) return `<div class="gapcard ok">${icon('check')}<span>Every muscle has at least one main exercise in your plan.</span></div>`;
  const list = Muscles.MUSCLES.filter((m) => d.gaps.has(m.key));
  // v2.5: one banner; tapping it opens the list.
  const open = musOpen('gaps');
  return `<div class="gapcard${open ? ' open' : ''}">
    <button type="button" class="gaphead gtoggle" data-action="musGroup" data-grp="gaps" aria-expanded="${open}">${icon('alert')}<b>${list.length} muscle${list.length === 1 ? ' isn’t' : 's aren’t'} in your plan</b>${CHEV}</button>
    ${open ? `<p class="hint" style="margin:6px 0 8px">No exercise in your schedule trains these as a main muscle. Tap one for exercises to add.</p>
    <div class="pills">${list
      .map((m) => `<button type="button" class="pill-btn gap${d.cov.mine[m.key].helps.length ? ' helped' : ''}" data-action="musPick" data-key="${m.key}">${esc(m.name)}${d.cov.mine[m.key].helps.length ? ' · helped' : ''}</button>`)
      .join('')}</div>` : ''}
  </div>`;
}

/** v2.5: whether a Muscles group is open (Done and the plan-gap list start closed). */
function musOpen(id) {
  const o = (musUi().open ||= {});
  return id in o ? o[id] : id !== 'done' && id !== 'gaps';
}

/** A collapsible group on the Muscles tab: tap the heading to fold it. */
function musGroupHtml(id, title, note, body) {
  const open = musOpen(id);
  return `<section class="sgroup mgrp${open ? ' open' : ''}">
    <button type="button" class="ghead gtoggle" data-action="musGroup" data-grp="${esc(id)}" aria-expanded="${open}"><h2>${esc(title)}</h2><span class="note">${esc(note)}</span>${CHEV}</button>
    ${open ? body : ''}
  </section>`;
}

const fmtSets = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)} set${n === 1 ? '' : 's'}`;

function figureSvg(view, d) {
  const layers = Muscles.FIG[view === 'right' ? 'left' : view];
  const mir = 'transform="matrix(-1 0 0 1 200 0)"';
  const picked = musUi().picked;
  // v2.5: colour only (plan gaps are the banner under the body, not stripes).
  const one = ([type, key, path], extra = '') =>
    type === 'm'
      ? `<path class="m${key === picked ? ' on' : ''}" d="${path}" data-m="${key}" style="fill:var(--m${d.lv(key)})" ${extra}/>`
      : `<path class="${type}" d="${path}" ${extra}/>`;
  let inner = layers.map((l) => one(l) + (l[3] ? one(l, mir) : '')).join('');
  if (view === 'right') inner = `<g ${mir}>${inner}</g>`;
  return `<g class="fig-in">${inner}</g>`;
}

function pickedHtml(d) {
  const u = musUi();
  const key = u.picked;
  if (!key) return '<b>Tap a muscle</b><span class="hint">Its name, sets and the exercises that train it show here.</span>';
  const m = Muscles.BY_KEY[key];
  const plan = new Set(planNames().map(Muscles.norm));
  const inPlan = (name) => plan.has(Muscles.norm(name));
  const { main, helps, minor } = Muscles.exercisesFor(d.db, key);
  // " × ½ = 1.5" for a helping muscle, " × ¼ = 0.75" for a tertiary one, nothing for a main one.
  const share = (v) => (v.main ? '' : ` × ${(v.weight ?? 0.5) === 0.25 ? '¼' : '½'} = ${Math.round(v.counted * 100) / 100}`);
  // One tap from a muscle to the exercise search, already filtered to it, adding to the day that trains it most.
  const addBtn = `<button type="button" class="btn secondary addex" data-action="openPicker" data-ctx="plan" data-muscle="${key}" data-query="${esc(m.name)}">${icon('plus')}Add ${d.gaps.has(key) ? 'a' : 'another'} ${esc(m.name)} exercise to your plan</button>`;
  if (d.mode === 'mine') {
    const n = d.value[key];
    const lv = d.lv(key);
    const when = u.period === 'day' ? `on ${formatDate(u.day || todayISO(), false)}` : 'in the last 7 days';
    const verdict = (d.scale === 'week' ? ['not trained', 'under half its target', 'below its target', 'on target', 'over 2× its target'] : ['not trained', 'light', 'moderate', 'solid', 'heavy'])[lv];
    const done = [...d.t.by[key].entries()].sort((a, b) => b[1].main - a[1].main || b[1].sets - a[1].sets);
    // Where the number comes from: each exercise, its day(s), its sets, and half for a helping muscle.
    const chips = done.length
      ? done.map(([name, v]) => `<span class="${v.main ? 'main' : ''}">${esc(name)}${v.days.length ? ` (${esc(v.days.join(', '))})` : ''} · ${esc(fmtSets(v.sets))}${esc(share(v))}</span>`).join('')
      : main
          .slice(0, 5)
          .map((e) => `<span class="${inPlan(e.name) ? 'main' : ''}">Try: ${esc(e.name)}${e.equipment ? ` · ${esc(e.equipment)}` : ''}${inPlan(e.name) ? ' (in your plan)' : ''}</span>`)
          .join('');
    const gap = d.gaps.has(key)
      ? `<p class="gapnote">${tag('Not in your plan', 'warn')} No exercise in your schedule trains it as a main muscle${
          d.cov.mine[key].helps.length ? ` (helped by ${esc(d.cov.mine[key].helps.join(', '))})` : ''
        }.${done.length ? ` Try: ${esc(main.slice(0, 3).map((e) => e.name).join(', '))}.` : ''}</p>`
      : '';
    const fromMain = done.filter(([, v]) => v.main).reduce((a, [, v]) => a + v.counted, 0);
    const fromHelp = done.filter(([, v]) => !v.main && v.weight !== 0.25).reduce((a, [, v]) => a + v.counted, 0);
    const fromMinor = done.filter(([, v]) => v.weight === 0.25).reduce((a, [, v]) => a + v.counted, 0);
    const r2 = (x) => Math.round(x * 100) / 100;
    const sum = done.length && (fromHelp || fromMinor)
      ? ` = ${r2(fromMain)} as main${fromHelp ? ` + ${r2(fromHelp)} as helper (½ set each)` : ''}${fromMinor ? ` + ${r2(fromMinor)} as tertiary (¼ set each)` : ''}`
      : '';
    return `<b>${esc(m.name)}</b>${targetAnalysisHtml(d, key)}<span class="hint">${esc(fmtSets(n))} ${esc(when)}${esc(sum)} · ${esc(verdict)}</span>${gap}<div class="exs">${chips}</div>${addBtn}`;
  }
  const mine = d.cov.mine[key];
  const weekly = Math.round(d.value[key] * 10) / 10;
  const row = (e) =>
    `<li><span class="ename">${esc(e.name)}</span>${e.equipment ? `<span class="eq">${esc(e.equipment)}</span>` : ''}${inPlan(e.name) ? '<span class="badge">In your plan</span>' : ''}</li>`;
  const tg = muscleTarget(key);
  return `<b>${esc(m.name)}</b>${d.gaps.has(key) ? ` ${tag('Not in your plan', 'warn')}` : ''}
    ${targetAnalysisHtml(d, key)}
    <span class="hint">${esc(m.area)} · your plan: ${
      mine.main.length || mine.helps.length || mine.minor.length
        ? esc([mine.main.length ? `${mine.main.length} main (${mine.main.join(', ')})` : '', mine.helps.length ? `${mine.helps.length} helping` : '', mine.minor.length ? `${mine.minor.length} tertiary` : ''].filter(Boolean).join(', '))
        : 'nothing works it yet'
    } · ${esc(weekly)} hard sets a week planned${tg.sets ? ` (target ${esc(tg.sets)}${tg.direct ? ' direct' : ''})` : ''}</span>
    ${
      d.planBy?.[key]?.length
        ? `<p class="sublabel">Where the ${esc(weekly)} planned sets come from</p><div class="exs">${d.planBy[key]
            .map(
              (x) => `<span class="${x.main ? 'main' : ''}">${esc(x.name)} (${esc(x.day)}${d.perWeek[x.day] > 1 ? ` × ${d.perWeek[x.day]} a week` : ''}) · ${esc(fmtSets(x.sets))}${esc(share(x))}</span>`,
            )
            .join('')}</div>`
        : ''
    }${addBtn}
    ${main.length ? `<p class="sublabel">Main exercises (${main.length})</p><ul class="exlist">${main.map(row).join('')}</ul>` : '<p class="hint">No exercise in the database has it as a main muscle.</p>'}
    ${helps.length ? `<details class="exmore"><summary>Also helped by ${helps.length} exercise${helps.length === 1 ? '' : 's'}</summary><ul class="exlist">${helps.map(row).join('')}</ul></details>` : ''}
    ${minor.length ? `<details class="exmore"><summary>Tertiary in ${minor.length} exercise${minor.length === 1 ? '' : 's'}</summary><ul class="exlist">${minor.map(row).join('')}</ul></details>` : ''}`;
}

function muscleListsHtml(d) {
  const u = musUi();
  const rows = Muscles.MUSCLES.map((m) => ({ m, n: d.value[m.key], lv: d.lv(m.key) }));
  const max = Math.max(...rows.map((r) => r.n), 1);
  const r1 = (x) => Math.round(x * 10) / 10;
  // Week scale (v2.5): the bar is done against the muscle's target, with a tick where the plan gets it; the number is
  // "done / target". A muscle with no target keeps the old bar (against the most-trained muscle).
  const rowHtml = ({ m, n, lv }, sub) => {
    const t = muscleTarget(m.key);
    const week = d.scale === 'week' && t.sets;
    const has = week ? towardTarget(m.key, d) : n;
    const fill = week ? Math.min(1, has / t.sets) : n / max;
    const plan = week && d.mode === 'mine' ? Math.min(1, towardTarget(m.key, d.planW) / t.sets) : null;
    const num = week ? `${esc(r1(has))} / ${esc(t.sets)}` : d.mode === 'mine' ? esc(fmtSets(n)) : `${esc(r1(n))}/wk`;
    return `<button type="button" class="mrow${d.gaps.has(m.key) ? ' gap' : ''}" data-action="musPick" data-key="${m.key}" style="--c:var(--m${lv})"><span class="sw"></span><span class="mtx"><b>${esc(m.name)}${
      d.gaps.has(m.key) ? ` ${tag('Not in plan', 'warn')}` : ''
    }</b><span>${esc(sub)}${week && t.direct ? ' · main-muscle sets only' : ''}</span></span><span class="n">${num}</span><span class="bar"><i style="width:${fill * 100}%"></i>${
      plan !== null ? `<b class="plantick" style="left:${plan * 100}%" title="Your plan"></b>` : ''
    }</span></button>`;
  };
  let groups;
  if (d.mode === 'mine' && d.scale === 'week') {
    groups = [
      ['behind', 'Behind', 'under half its target', rows.filter((r) => r.lv <= 1).sort((a, b) => a.n - b.n)],
      ['close', 'Close', 'below its target', rows.filter((r) => r.lv === 2).sort((a, b) => b.n - a.n)],
      ['done', 'Done', 'target reached', rows.filter((r) => r.lv >= 3).sort((a, b) => b.n - a.n)],
    ];
  } else if (d.mode === 'mine') {
    const day = formatDate(u.day || todayISO(), false);
    groups = [
      ['dayOn', `Trained on ${day}`, '', rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n)],
      ['dayOff', `Not trained on ${day}`, '', rows.filter((r) => r.n === 0)],
    ];
  } else {
    // All exercises: the gaps first, then every muscle by body area.
    const areas = [...new Set(Muscles.MUSCLES.map((m) => m.area))];
    groups = [
      ['planGaps', 'Not in your plan', `${d.gaps.size} muscle${d.gaps.size === 1 ? '' : 's'} · no main exercise`, rows.filter((r) => d.gaps.has(r.m.key))],
      ...areas.map((a) => [`area:${a}`, a, '', rows.filter((r) => r.m.area === a)]),
    ];
  }
  const html = groups
    .filter(([, , , list]) => list.length)
    .map(([id, title, note, list]) =>
      musGroupHtml(id, `${title} (${list.length})`, note, `<div class="card flush">${list
        .map((r) => {
          if (d.mode === 'mine') return rowHtml(r, r.m.area);
          const c = d.cov.mine[r.m.key];
          const total = Muscles.exercisesFor(d.db, r.m.key).main.length;
          return rowHtml(r, `${total} in the database · your plan: ${c.main.length ? `${c.main.length} main` : c.helps.length || c.minor.length ? 'helping only' : 'none'}`);
        })
        .join('')}</div>`),
    )
    .join('');
  // Names the database does not know (plan or log): match each to an exercise once, saved as its other name.
  return html + unknownNamesHtml() + autoMatchedHtml();
}

function renderMuscles() {
  const u = musUi();
  const d = musData();
  const today = todayISO();
  if (!u.day) u.day = today;
  const days = Array.from({ length: 7 }, (_, i) => Progress.addDays(today, i - 6));
  // v2.5: front and back only (a muscle seen only from the side before is on one of them).
  if (u.view !== 'back') u.view = 'front';
  const views = [['front', 'Front'], ['back', 'Back']];
  const ex = state.exdb;
  const show = d.mode === 'all' ? 'plan' : u.period === 'day' ? 'day' : 'week';
  return `
    <div class="mhead">
      <h1 class="large">Muscles</h1>
      <select class="select mshow" data-change="musShow" aria-label="Show">${[['week', 'This week'], ['day', 'One day'], ['plan', 'My plan']]
        .map(([v, l]) => `<option value="${v}" ${v === show ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>
    </div>
    <p class="sub">${d.mode === 'mine' ? 'Sets you logged (not your plan) · a helping muscle counts half a set, a tertiary one a quarter · warm-ups not counted' : 'Hard sets a week your plan gives each muscle (planned sets × days on the schedule), and every exercise in the database'}</p>
    ${
      d.mode === 'mine'
        ? `${
            u.period === 'day'
              ? `<div class="days7">${days
                  .map(
                    (x) => `<button type="button" data-action="musDay" data-day="${x}" aria-pressed="${x === u.day}"><span>${esc(WEEKDAYS[new Date(Date.parse(x)).getUTCDay()].slice(0, 3))}</span><b>${Number(x.slice(8))}</b></button>`,
                  )
                  .join('')}</div>`
              : ''
          }`
        : ''
    }
    <div class="card flush mcard">
      <div class="views4 two" role="tablist" aria-label="View">${views
        .map(([v, l]) => `<button type="button" role="tab" data-action="musView" data-view="${v}" aria-selected="${u.view === v}">${l}</button>`)
        .join('')}</div>
      <div class="mstage" id="mstage">
        <svg id="mfig" viewBox="0 0 200 460" role="img" aria-label="Body, muscles coloured. Tap a muscle, or use the lists below.">${figureSvg(u.view, d)}</svg>
        <div class="stage-hint" id="mhint">Tap a muscle · pinch or double-tap to zoom</div>
        <div class="mlabel" id="mlabel" hidden></div>
        <div class="zoomctl">
          <button type="button" data-action="musZoom" data-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" data-action="musZoom" data-zoom="out" aria-label="Zoom out">−</button>
          <button type="button" data-action="musZoom" data-zoom="reset" aria-label="Show the whole body" id="mzoom-reset" hidden>1×</button>
        </div>
      </div>
      <div class="picked" id="mpicked">${pickedHtml(d)}</div>
      <div class="scale">${Muscles.LEVELS[d.scale === 'week' ? 'target' : d.scale].map(([, label], i) => `<div style="--c:var(--m${i})">${esc(label)}</div>`).join('')}</div>
    </div>
    <div class="sgroup">${gapsHtml(d)}</div>
    ${muscleListsHtml(d)}
    ${group(
      'Exercise database',
      '',
      `<div class="card stack">
        <p class="hint" style="margin:0">${d.db.list.length} exercises · ${
          d.fromSheet ? `from your Sheet's Exercises tab${ex?.fetchedAt ? `, read ${esc(formatDate(new Date(ex.fetchedAt).toISOString().slice(0, 10), false))}` : ''}` : 'the built-in list (it is copied to your Sheet once it is connected)'
        }. Read again each time you open this tab. Add exercises here with the search (they go to the Sheet), or in the Sheet itself: the muscle columns have a dropdown of these names.</p>
        ${exSyncNote()}
        ${d.db.unknown.length ? `<p class="small warn-text iline" style="margin:0">${icon('alert')}<span>Muscle names the app does not know (fix them in the Sheet): ${esc(d.db.unknown.join(', '))}</span></p>` : ''}
        <button type="button" class="btn secondary" data-action="openPicker" data-ctx="plan">${icon('search')}Search or add an exercise</button>
        <button type="button" class="btn secondary" data-action="musReload" ${haveApi() ? '' : 'disabled'}>Reload from the Sheet</button>
      </div>`,
    )}`;
}

/* ---------- figure: zoom, tap, swipe ---------- */

function musViewBox() {
  const vb = musUi().vb;
  return vb ? { ...vb } : { ...MFULL };
}

function musApplyZoom(vb) {
  vb.w = Math.min(MFULL.w, Math.max(MFULL.w / MMAX_ZOOM, vb.w));
  vb.h = vb.w * (MFULL.h / MFULL.w);
  vb.x = Math.min(MFULL.w - vb.w, Math.max(0, vb.x));
  vb.y = Math.min(MFULL.h - vb.h, Math.max(0, vb.y));
  const zoomed = vb.w < MFULL.w - 0.5;
  musUi().vb = zoomed ? vb : null;
  const fig = document.getElementById('mfig');
  if (!fig) return;
  const box = zoomed ? vb : MFULL; // exactly the whole body when not zoomed
  fig.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  document.getElementById('mstage').classList.toggle('zoomed', zoomed);
  document.getElementById('mzoom-reset').hidden = !zoomed;
  musPlaceLabel(null);
}

/** Screen point → drawing coordinates (preserveAspectRatio letterboxes the drawing in the stage). */
function musToSvg(cx, cy) {
  const vb = musViewBox();
  const r = document.getElementById('mfig').getBoundingClientRect();
  const s = Math.min(r.width / vb.w, r.height / vb.h);
  return { x: vb.x + (cx - (r.left + (r.width - vb.w * s) / 2)) / s, y: vb.y + (cy - (r.top + (r.height - vb.h * s) / 2)) / s, s };
}

function musZoomAt(factor, cx, cy) {
  const vb = musViewBox();
  const p = musToSvg(cx, cy);
  const w = Math.min(MFULL.w, Math.max(MFULL.w / MMAX_ZOOM, vb.w / factor));
  const k = w / vb.w;
  musApplyZoom({ x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w, h: w * (MFULL.h / MFULL.w) });
}

function musZoomCentre(factor) {
  const r = document.getElementById('mfig').getBoundingClientRect();
  musZoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
}

/** The name label over the picked muscle (or where it was tapped); hidden when this view does not show it. */
function musPlaceLabel(tap) {
  const lbl = document.getElementById('mlabel');
  const stage = document.getElementById('mstage');
  if (!lbl || !stage) return;
  const key = musUi().picked;
  const el = key && stage.querySelector(`[data-m="${key}"]`);
  if (!el) {
    lbl.hidden = true;
    return;
  }
  const st = stage.getBoundingClientRect();
  let x;
  let y;
  if (tap) {
    x = tap.x - st.left;
    y = tap.y - st.top;
  } else {
    const r = el.getBoundingClientRect();
    x = r.left + r.width / 2 - st.left;
    y = r.top + r.height / 2 - st.top;
  }
  lbl.textContent = Muscles.BY_KEY[key].name;
  lbl.hidden = !(y > 0 && y < st.height);
  const half = lbl.offsetWidth / 2 + 6;
  lbl.style.left = `${Math.min(st.width - half, Math.max(half, x))}px`;
  lbl.style.top = `${y}px`;
}

/** Pick (or clear) a muscle without re-rendering the screen. */
function musPick(key, tap) {
  const u = musUi();
  u.picked = key;
  const stage = document.getElementById('mstage');
  if (!stage) return;
  for (const p of stage.querySelectorAll('#mfig .m')) p.classList.toggle('on', p.dataset.m === key);
  document.getElementById('mpicked').innerHTML = pickedHtml(musData());
  musPlaceLabel(tap);
}

function musSetView(v) {
  const u = musUi();
  u.view = v;
  u.vb = null;
  render();
}

let musGesture = null;
let musLastTap = 0;
function afterMusclesRender() {
  const stage = document.getElementById('mstage');
  if (!stage) return;
  musApplyZoom(musViewBox());
  const pts = new Map();
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoomctl')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {}
    if (pts.size === 1) musGesture = { kind: 'tap', x0: e.clientX, y0: e.clientY, last: { x: e.clientX, y: e.clientY }, target: e.target };
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      musGesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !musGesture) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = musGesture;
    if (g.kind === 'pinch' && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.dist > 0) musZoomAt(dist / g.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      g.dist = dist;
      return;
    }
    if (pts.size !== 1) return;
    if (g.kind === 'tap' && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 6) g.kind = musUi().vb ? 'pan' : 'swipe';
    if (g.kind === 'pan') {
      const vb = musViewBox();
      const s = musToSvg(0, 0).s;
      vb.x -= (e.clientX - g.last.x) / s;
      vb.y -= (e.clientY - g.last.y) / s;
      musApplyZoom(vb);
    }
    g.last = { x: e.clientX, y: e.clientY };
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    const g = musGesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      musGesture = pts.size ? { kind: 'done' } : null;
      return;
    }
    if (pts.size) return;
    musGesture = null;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.kind === 'swipe' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      musSetView(musUi().view === 'back' ? 'front' : 'back');
      return;
    }
    if (g.kind !== 'tap' || e.type === 'pointercancel') return;
    const now = performance.now();
    if (now - musLastTap < 300) {
      musLastTap = 0;
      if (musUi().vb) musApplyZoom({ ...MFULL });
      else musZoomAt(2.5, e.clientX, e.clientY);
      return;
    }
    musLastTap = now;
    const m = g.target.closest && g.target.closest('#mfig .m');
    const hint = document.getElementById('mhint');
    if (hint) hint.style.opacity = '0';
    musPick(m ? m.dataset.m : null, m ? { x: e.clientX, y: e.clientY } : null);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      musZoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    },
    { passive: false },
  );
  for (const ev of ['gesturestart', 'gesturechange']) stage.addEventListener(ev, (e) => e.preventDefault());
}

const trackActions = {
  musMode(el) {
    musUi().mode = el.dataset.mode === 'all' ? 'all' : 'mine';
    render();
  },
  musPeriod(el) {
    musUi().period = el.dataset.period === 'day' ? 'day' : 'week';
    render();
  },
  musDay(el) {
    musUi().day = el.dataset.day;
    render();
  },
  musView(el) {
    musSetView(el.dataset.view);
  },
  // v2.5: fold or unfold a Muscles group (Behind / Close / Done, the plan-gap banner…); kept while the app is open.
  musGroup(el) {
    const id = el.dataset.grp;
    musUi().open = { ...musUi().open, [id]: !musOpen(id) };
    render();
  },
  // A muscle tapped in a list: show it on the figure (turning to a view that has it) and in the panel.
  musPick(el) {
    const u = musUi();
    const k = el.dataset.key;
    u.picked = k;
    if (!Muscles.FIG[u.view === 'right' ? 'left' : u.view].some((l) => l[1] === k)) {
      u.view = Muscles.VIEW_OF[k] || 'front';
      u.vb = null;
    }
    render();
    document.getElementById('mstage')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  musZoom(el) {
    const z = el.dataset.zoom;
    if (z === 'in') musZoomCentre(1.6);
    else if (z === 'out') musZoomCentre(1 / 1.6);
    else musApplyZoom({ ...MFULL });
  },
  musReload() {
    toast('Reading the Sheet…');
    refreshExercises(true).then((got) => toast(got ? 'Exercise database updated from the Sheet' : 'Could not read the Sheet: check the signal and the Apps Script version', got ? 'ok' : 'error'));
  },
  openExercise(el) {
    go('progress', el.dataset.name);
  },


  saveCheckin() {
    const d = bodyDraft();
    const values = {};
    for (const [k, v] of Object.entries(d.values)) if (v !== '' && Number.isFinite(Number(v))) values[k] = Number(v);
    if (!Object.keys(values).length) return toast('Enter at least one measurement', 'error');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return toast('Pick a date', 'error');
    // Body fat goes into the entry too, so the Sheet's Measurements tab gets a column for it (the app itself always
    // works it out again from the tape measurements and the current height).
    const bf = Body.entryBodyFat(values, state.settings.profile || {}, Body.navyFields(measureFields()));
    if (bf !== null) values[BF_KEY] = bf;
    queueMeasurement(newMeasurement('checkin', d.date, values, d.notes.trim()));
    state.ui.body.draft = null;
    toast(bf !== null ? `Check-in saved · body fat ${fmtKg(bf)}% (US Navy)` : 'Check-in saved');
    render();
  },

  smallCheckIn() {
    const ui = state.ui.body;
    const date = ui.smallDate || todayISO();
    const time = ui.smallTime || nowTime();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return toast('Pick a date and time', 'error');
    const entry = { id: uuid(), date, time, note: (ui.smallNote || '').trim(), savedAt: nowISO() };
    state.small = [...state.small, entry];
    save(KEYS.small, state.small);
    queueSmall(entry);
    ui.smallDate = ui.smallTime = null; // back to "now" for the next one
    ui.smallNote = '';
    toast(`Small workout checked in · ${formatDate(date, false)}, ${time}`);
    render();
  },

  async editSmall(el) {
    const s = state.small.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const values = await openModal({
      title: 'Small workout',
      fields: [
        { key: 'date', label: 'Date', value: s.date, type: 'date' },
        { key: 'time', label: 'Time', value: s.time, type: 'time' },
        { key: 'note', label: 'Notes (optional)', value: s.note || '' },
      ],
      confirmText: 'Save',
    });
    if (!values) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || !/^\d{2}:\d{2}$/.test(values.time)) return toast('Pick a date and time', 'error');
    Object.assign(s, { date: values.date, time: values.time, note: values.note || '' });
    save(KEYS.small, state.small);
    queueSmall(s);
    render();
  },

  async deleteSmall(el) {
    const ok = await openModal({ title: 'Delete this small workout?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    state.small = state.small.filter((x) => x.id !== el.dataset.id);
    save(KEYS.small, state.small);
    queueSmall({ id: el.dataset.id, deleted: true });
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
  // v2.5: one "Show" menu for This week / One day / My plan.
  musShow(el) {
    const u = musUi();
    u.mode = el.value === 'plan' ? 'all' : 'mine';
    if (el.value !== 'plan') u.period = el.value === 'day' ? 'day' : 'week';
    render();
  },
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
  smallDate(el) {
    state.ui.body.smallDate = el.value;
  },
  smallTime(el) {
    state.ui.body.smallTime = el.value;
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
  smallNote(el) {
    state.ui.body.smallNote = el.value;
  },
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
