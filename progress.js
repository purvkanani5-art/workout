'use strict';

/* Bhimlekha progress engine: pure functions over sessions, no DOM and no storage.
   Loaded before app.js; everything here reads only its arguments, so it is easy to test.

   Method (double progression): keep one weight until every working set reaches the top of the exercise's rep range
   with reps still in reserve, in N sessions in a row spread over at least D days; then add a weight step.
   Strength is compared with an estimated one-rep max (Epley: w × (1 + reps / 30)) so sessions at different weights
   are comparable; volume is Σ reps × weight. Every threshold comes from the `p` (progression settings) argument. */

const PROGRESSION_DEFAULTS = {
  readyRir: 1, // every working set needs at least this many reps in reserve to count as "easy"
  topTolerance: 1, // reps may be this many below the top of the range (11 of 12 still counts)
  readySessions: 2, // qualifying sessions in a row before a weight increase is suggested
  readyMinDays: 7, // ...and the first and last of them at least this many days apart (the "week timer")
  stepUpper: 2.5, // kg added for upper-body exercises
  stepLower: 5, // kg added for lower-body exercises (days whose name contains "Leg")
  maintainBand: 2, // ±% counted as "maintained"
  avgWindow: 4, // sessions in the rolling average
  stallSessions: 3, // sessions at one weight with no rep gain = stalled
  dropSessions: 2, // estimated max falling this many sessions in a row = dropping
  watchDays: 7, // after a weight increase, watch this many days for reps falling under the range
  muscleSetsMin: 10, // weekly hard sets per muscle group, low end of the useful range
  muscleSetsMax: 20, // ...and high end
  shortfallDays: 14, // a set below its earlier level for this long gets a warning on the entry screen
  stagnantDays: 30, // a set that has not beaten its own best for this long is called stagnant
};

// Recovery (lighter week) alert: any enabled trigger fires it. Editable in Settings → Recovery.
const RECOVERY_DEFAULTS = {
  schedOn: true, // A: every N weeks since the last lighter week
  schedWeeks: 8,
  strengthOn: true, // B: overall strength down more than X% for N weeks in a row
  strengthWeeks: 2,
  strengthPct: 1,
  dropOn: true, // C: at least K exercises flagged "dropping" at once
  dropCount: 3,
  feelOn: true, // D: Energy/Strength ratings averaging ≤ R over the last N rated workouts
  feelMax: 2.5,
  feelWorkouts: 3,
  lengthDays: 7, // how long a lighter week lasts
  snoozeDays: 3, // "Not now" hides the alert for this many days
};

const DAY_MS = 86400000;

/* ------------------------------------------------------------- basics */

/** "3 × 8-12" → { sets: 3, min: 8, max: 12, timed: false }. "3 × 30-60 sec" is timed (not tracked by reps). */
function parsePlan(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const m = t.match(/(\d+)\s*[×x*]\s*(\d+)\s*(?:[-–to]+\s*(\d+))?/);
  if (!m) return null;
  const sets = Number(m[1]);
  const a = Number(m[2]);
  const b = m[3] ? Number(m[3]) : a;
  const rest = t.slice(m.index + m[0].length);
  return { sets, min: Math.min(a, b), max: Math.max(a, b), timed: /^\s*(s|secs?|seconds?|mins?|minutes?)\b/.test(rest) };
}

function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (r <= 0) return 0;
  if (w <= 0) return r; // bodyweight: reps are the measure
  return w * (1 + r / 30);
}

function pct(now, before) {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

function addDays(iso, days) {
  const d = new Date(Date.parse(iso) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** RIR for a set: logged value, or 0 when it went to failure, or null when unknown (older sets). */
function setRir(s) {
  if (s.toFailure) return 0;
  return s.rir === 0 || Number.isFinite(s.rir) ? Number(s.rir) : null;
}

function isWorking(s) {
  return !s.warmup && s.reps != null && s.reps > 0;
}

/* ------------------------------------------------------- per session */

/**
 * One exercise in one session, reduced to the numbers the engine needs.
 * The "working weight" is the heaviest weight used for working sets; double progression looks at the sets done at it.
 */
function exerciseSnapshot(session, exercise, plan) {
  const sets = session.sets.filter((s) => s.exercise === exercise).sort((a, b) => a.setNo - b.setNo);
  const working = sets.filter(isWorking);
  if (!working.length) return null;
  const weight = Math.max(...working.map((s) => Number(s.weightKg) || 0));
  const top = working.filter((s) => (Number(s.weightKg) || 0) === weight);
  const reps = top.map((s) => s.reps);
  const rirs = top.map(setRir);
  const volume = working.reduce((v, s) => v + s.reps * (Number(s.weightKg) || 0), 0);
  const totalReps = working.reduce((v, s) => v + s.reps, 0);
  const best = Math.max(...working.map((s) => e1rm(s.weightKg, s.reps)));
  // Mean estimated max over every working set: unlike the best set alone, it moves when later sets gain reps.
  const perf = working.reduce((v, s) => v + e1rm(s.weightKg, s.reps), 0) / working.length;
  return {
    perf,
    sessionId: session.id,
    date: session.date,
    dayType: session.dayType,
    weight,
    reps,
    rirs,
    sets: working.length,
    totalReps,
    avgReps: totalReps / working.length,
    volume,
    e1rm: best,
    plan,
  };
}

/** Did this snapshot hit the target: enough sets at the working weight, each near the top of the range with reps in reserve? */
function qualifies(snap, p) {
  const plan = snap.plan;
  if (!plan || plan.timed) return { ok: false, reason: 'no-plan' };
  const need = plan.sets || snap.reps.length;
  if (snap.reps.length < need) return { ok: false, reason: 'sets' };
  const first = snap.reps.slice(0, need);
  const rirs = snap.rirs.slice(0, need);
  if (first.some((r) => r < plan.max - p.topTolerance)) return { ok: false, reason: 'reps' };
  if (rirs.some((r) => r === null)) return { ok: false, reason: 'rir-unknown' };
  if (rirs.some((r) => r < p.readyRir)) return { ok: false, reason: 'rir' };
  return { ok: true };
}

/* ------------------------------------------------- per set number */

/**
 * The set being entered compared with the same set number in earlier sessions of the exercise.
 * `current` = { weight, reps } (reps null until picked). Returns null when there is no earlier set.
 *  - prev / weightDelta / repsDelta: against the last session that had this set
 *  - shortfall: the latest sessions (and the set being entered) are all below the level before them, for at
 *    least `shortfallDays` → { ref: { date, weight, reps }, since, days }
 *  - stagnant: no new best for this set in more than `stagnantDays` → { since, days, best: { weight, reps } }
 * "Level" is the one-rep-max estimate of the set, so a heavier weight with fewer reps is judged fairly.
 */
function setComparison(sessions, exercise, setNo, current, today, p) {
  const points = [];
  const chronological = [...sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const s of chronological) {
    const set = s.sets.find((x) => x.exercise === exercise && x.setNo === setNo && isWorking(x));
    if (set) points.push({ date: s.date, weight: Number(set.weightKg) || 0, reps: set.reps, v: e1rm(set.weightKg, set.reps) });
  }
  if (!points.length) return null;
  const prev = points[points.length - 1];
  const hasNow = current && current.reps != null && current.reps > 0 && Number.isFinite(current.weight);
  const series = hasNow ? [...points, { date: today, weight: current.weight, reps: current.reps, v: e1rm(current.weight, current.reps), now: true }] : points;
  const out = {
    prev,
    weightDelta: Number.isFinite(current?.weight) ? current.weight - prev.weight : null,
    repsDelta: hasNow ? current.reps - prev.reps : null,
    shortfall: null,
    stagnant: null,
  };

  // Shortfall: the trailing run of points that are all below the best point before the run.
  let k = series.length - 1;
  const bestBefore = (i) => Math.max(...series.slice(0, i).map((x) => x.v));
  while (k >= 1 && series[k].v < bestBefore(k)) k--;
  if (k < series.length - 1) {
    const first = series[k + 1];
    const refV = bestBefore(k + 1);
    const ref = [...series.slice(0, k + 1)].reverse().find((x) => x.v === refV);
    const days = daysBetween(first.date, today);
    if (days >= p.shortfallDays) out.shortfall = { ref, since: first.date, days };
  }

  // Stagnant: days since this set last set a new best (the first ever counts as a best).
  let lastBest = series[0];
  let best = series[0].v;
  for (const x of series.slice(1)) {
    if (x.v > best) {
      best = x.v;
      lastBest = x;
    }
  }
  const sinceBest = daysBetween(lastBest.date, today);
  // At least 3 sessions, so one long break between two sessions does not count as stagnation.
  if (!lastBest.now && sinceBest > p.stagnantDays && series.length >= 3) {
    out.stagnant = { since: lastBest.date, days: sinceBest, best: { weight: lastBest.weight, reps: lastBest.reps } };
  }
  return out;
}

/* ------------------------------------------------------ per exercise */

/**
 * Everything known about one exercise: its snapshots oldest → newest, the comparison of the latest with the one
 * before and with the rolling average, and its double-progression status.
 * `planFor(dayType, exercise)` returns the parsed plan for the exercise on that day (or any day); `isLower` and
 * `stepFor` pick the weight step.
 */
function analyseExercise(sessions, exercise, { p, planFor, isLower, stepFor, today }) {
  const chronological = [...sessions].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || (a.finishedAt || a.startedAt || '').localeCompare(b.finishedAt || b.startedAt || ''),
  );
  const snaps = [];
  for (const s of chronological) {
    const snap = exerciseSnapshot(s, exercise, planFor(s.dayType, exercise));
    if (snap) snaps.push(snap);
  }
  if (!snaps.length) return null;
  const last = snaps[snaps.length - 1];
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const window = snaps.slice(Math.max(0, snaps.length - 1 - p.avgWindow), snaps.length - 1);
  const avg = window.length
    ? {
        perf: window.reduce((v, x) => v + x.perf, 0) / window.length,
        volume: window.reduce((v, x) => v + x.volume, 0) / window.length,
        n: window.length,
      }
    : null;

  // The verdict: at the same weight, reps decide (+2 reps on 30 = +6.7%); after a weight change, the mean
  // estimated max does, so a heavier weight with fewer reps is judged fairly.
  const compare = prev
    ? (() => {
        const weightDelta = last.weight - prev.weight;
        const repsPct = pct(last.totalReps, prev.totalReps);
        const perfPct = pct(last.perf, prev.perf);
        return {
          scorePct: weightDelta === 0 ? repsPct : perfPct,
          basis: weightDelta === 0 ? 'reps' : 'strength',
          perfPct,
          volumePct: pct(last.volume, prev.volume),
          repsDelta: last.avgReps - prev.avgReps,
          weightDelta,
          totalRepsDelta: last.totalReps - prev.totalReps,
        };
      })()
    : null;
  const vsAvg = avg && avg.n >= 2 ? { perfPct: pct(last.perf, avg.perf), volumePct: pct(last.volume, avg.volume), n: avg.n } : null;

  let trend = 'first';
  if (compare && compare.scorePct !== null) {
    trend = compare.scorePct > p.maintainBand ? 'up' : compare.scorePct < -p.maintainBand ? 'down' : 'flat';
  }

  const status = progressionStatus(snaps, { p, isLower: isLower(last.dayType, exercise), step: stepFor(exercise), today });
  const flags = warningFlags(snaps, p);
  return { exercise, snaps, last, prev, compare, vsAvg, trend, status, flags };
}

/**
 * Double-progression status for the latest weight:
 *  - building: not at the target yet ({ toTarget } reps short)
 *  - ready: hit the target in `streak` of `readySessions` sessions; `confirmFrom` is the earliest date the next
 *    qualifying session counts (the week timer)
 *  - increase: time to add `step` kg → `nextWeight`
 *  - watch: weight went up within `watchDays`; `holding` says whether reps stayed inside the range
 *  - untracked: no rep plan for this exercise (e.g. timed planks)
 */
function progressionStatus(snaps, { p, isLower, step, today }) {
  const last = snaps[snaps.length - 1];
  const plan = last.plan;
  if (!plan || plan.timed) return { kind: 'untracked' };
  const kg = Number(step) > 0 ? Number(step) : isLower ? p.stepLower : p.stepUpper;

  // Sessions at the current weight, newest last.
  const atWeight = [];
  for (let i = snaps.length - 1; i >= 0 && snaps[i].weight === last.weight; i--) atWeight.unshift(snaps[i]);
  const before = snaps[snaps.length - atWeight.length - 1] || null;
  const target = (plan.sets || last.reps.length) * plan.max;
  const done = last.reps.slice(0, plan.sets || last.reps.length).reduce((v, r) => v + r, 0);

  // Streak of qualifying sessions ending with the latest.
  let streak = 0;
  for (let i = atWeight.length - 1; i >= 0 && qualifies(atWeight[i], p).ok; i--) streak++;
  const q = qualifies(last, p);

  if (before && before.weight < last.weight) {
    const since = daysBetween(atWeight[0].date, today);
    if (since <= p.watchDays && streak === 0) {
      const holding = last.reps.every((r) => r >= plan.min);
      return { kind: 'watch', from: before.weight, weight: last.weight, holding, daysLeft: Math.max(0, p.watchDays - since), plan, done, target, step: kg };
    }
  }

  if (streak >= p.readySessions) {
    const firstQ = atWeight[atWeight.length - streak];
    const spread = daysBetween(firstQ.date, last.date);
    if (spread >= p.readyMinDays) return { kind: 'increase', weight: last.weight, nextWeight: round1(last.weight + kg), step: kg, plan, done, target };
    return { kind: 'ready', streak, need: p.readySessions, confirmFrom: addDays(firstQ.date, p.readyMinDays), weight: last.weight, plan, done, target, step: kg };
  }
  if (streak >= 1) {
    const firstQ = atWeight[atWeight.length - streak];
    return { kind: 'ready', streak, need: p.readySessions, confirmFrom: addDays(firstQ.date, p.readyMinDays), weight: last.weight, plan, done, target, step: kg };
  }
  return { kind: 'building', weight: last.weight, plan, done, target, toTarget: Math.max(0, target - done), reason: q.reason, step: kg };
}

/** Stall (same weight, no rep gain for N sessions) and drop (estimated max falling N sessions in a row). */
function warningFlags(snaps, p) {
  const flags = [];
  const n = snaps.length;
  if (n >= p.stallSessions) {
    const tail = snaps.slice(n - p.stallSessions);
    const sameWeight = tail.every((s) => s.weight === tail[0].weight);
    if (sameWeight && tail[tail.length - 1].totalReps <= tail[0].totalReps) flags.push({ kind: 'stall', sessions: p.stallSessions });
  }
  if (n > p.dropSessions) {
    let falling = true;
    for (let i = n - p.dropSessions; i < n; i++) {
      const change = pct(snaps[i].perf, snaps[i - 1].perf);
      if (change === null || change >= -p.maintainBand) falling = false;
    }
    if (falling) flags.push({ kind: 'drop', sessions: p.dropSessions, pct: pct(snaps[n - 1].perf, snaps[n - 1 - p.dropSessions].perf) });
  }
  return flags;
}

/* -------------------------------------------------- per workout */

/** Insight for one finished (or in-progress) workout against all earlier ones. */
function workoutInsight(session, history, ctx) {
  const others = history.filter((s) => s.id !== session.id && (s.date || '') <= (session.date || '9999'));
  const all = [...others, session];
  const names = [...new Set(session.sets.filter(isWorking).map((s) => s.exercise))];
  const rows = [];
  for (const name of names) {
    const a = analyseExercise(all, name, ctx);
    if (a && a.last.sessionId === session.id) rows.push(a);
  }
  const compared = rows.filter((r) => r.compare && r.compare.scorePct !== null);
  const strengthPct = compared.length ? compared.reduce((v, r) => v + r.compare.scorePct, 0) / compared.length : null;

  // Same-exercise volume comparison: only exercises done both times, so a skipped exercise does not look like a drop.
  let volNow = 0;
  let volBefore = 0;
  for (const r of rows) {
    if (r.prev) {
      volNow += r.last.volume;
      volBefore += r.prev.volume;
    }
  }
  const counts = { up: 0, flat: 0, down: 0, first: 0 };
  for (const r of rows) counts[r.trend]++;
  return { rows, strengthPct, volumePct: volBefore ? pct(volNow, volBefore) : null, counts };
}

/* ------------------------------------------------------ narratives */

function signed(n, digits = 1, unit = '%') {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}${unit}`;
}

function kg(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** One plain sentence for an exercise in a just-finished workout. */
function exerciseSentence(a, p) {
  const l = a.last;
  const reps = l.reps.join('-');
  const head = `${reps} @ ${kg(l.weight)} kg`;
  if (!a.compare) return `${head}. First time logged, so this is the baseline.`;
  const c = a.compare;
  const bits = [];
  if (c.weightDelta > 0) {
    bits.push(`weight up ${kg(c.weightDelta)} kg`);
    if (c.repsDelta < 0) bits.push(`reps per set down ${Math.abs(c.repsDelta).toFixed(1)}, which is normal after adding weight`);
  } else if (c.weightDelta < 0) {
    bits.push(`weight down ${kg(-c.weightDelta)} kg`);
  } else if (c.totalRepsDelta > 0) {
    bits.push(`${c.totalRepsDelta} more rep${c.totalRepsDelta === 1 ? '' : 's'} at the same weight`);
  } else if (c.totalRepsDelta < 0) {
    bits.push(`${-c.totalRepsDelta} fewer rep${c.totalRepsDelta === -1 ? '' : 's'} at the same weight`);
  } else {
    bits.push('same reps at the same weight');
  }
  const verdict =
    a.trend === 'up' ? 'Improved' : a.trend === 'down' ? 'Dropped' : `Maintained (within ±${p.maintainBand}%)`;
  const measure = c.basis === 'reps' ? `reps ${signed(c.scorePct)}` : `est. strength ${signed(c.scorePct)}`;
  return `${head}: ${bits.join('; ')}. ${verdict}: ${measure}, volume ${signed(c.volumePct)} vs last time${
    a.vsAvg ? `; strength ${signed(a.vsAvg.perfPct)} vs your ${a.vsAvg.n}-session average` : ''
  }.`;
}

function fmtShortDate(iso) {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = String(iso).split('-').map(Number);
  return y ? `${String(d).padStart(2, '0')} ${M[m - 1]}` : iso;
}

/** Short status line, e.g. "Ready 1/2 · confirm on or after 29 Oct". */
function statusLine(st, today) {
  switch (st.kind) {
    case 'building': {
      const target = `${st.plan.sets || ''}${st.plan.sets ? ' × ' : ''}${st.plan.max}`;
      if (st.reason === 'rir-unknown') return `Target ${target} @ ${kg(st.weight)} kg · log reps in reserve so readiness can be judged`;
      if (st.reason === 'rir' && st.toTarget === 0) return `Reps are there (${st.done}/${st.target}) but too close to failure. Make them easier before adding weight`;
      return `Building: ${st.done}/${st.target} reps toward ${target} @ ${kg(st.weight)} kg`;
    }
    case 'ready': {
      const left = Math.max(0, daysBetween(today, st.confirmFrom));
      if (st.streak >= st.need) {
        return `Target hit ${st.streak}/${st.need}. Week timer: ${left} day${left === 1 ? '' : 's'} left (${fmtShortDate(st.confirmFrom)}). If it still feels easy then, go to ${kg(st.weight + st.step)} kg`;
      }
      return `Ready ${st.streak}/${st.need}: hit the target again${left > 0 ? ` on or after ${fmtShortDate(st.confirmFrom)} (${left} day${left === 1 ? '' : 's'} left on the timer)` : ''} → then ${kg(st.weight + st.step)} kg`;
    }
    case 'increase':
    {
      const hi = Math.max(st.plan.min, st.plan.max - 2);
      return `Increase the weight: ${kg(st.weight)} → ${kg(st.nextWeight)} kg (+${kg(st.step)}). Expect about ${hi > st.plan.min ? `${st.plan.min}-${hi}` : st.plan.min} reps at first`;
    }
    case 'watch':
      return st.holding
        ? `New weight ${kg(st.weight)} kg: holding well (all sets ≥ ${st.plan.min} reps). Keep building reps`
        : `New weight ${kg(st.weight)} kg: reps fell under ${st.plan.min}. If it repeats next time, go back to ${kg(st.from)} kg`;
    default:
      return '';
  }
}

/* ---------------------------------------------- chart-window analysis */

/** Least-squares slope of y over x. */
function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((v, p) => v + p.x, 0) / n;
  const my = points.reduce((v, p) => v + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den ? num / den : 0;
}

/**
 * Numbers and words for one exercise over a window of snapshots (the chart's range):
 * first vs last weight, reps per set, volume and estimated max, plus the weekly trend of estimated max.
 */
function analyseWindow(snaps, p) {
  if (!snaps.length) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const days = Math.max(1, daysBetween(first.date, last.date));
  const t0 = Date.parse(first.date);
  // "Est. strength" here is the mean estimated max over all working sets (perf), so reps gained on later sets count.
  const perWeek = slope(snaps.map((s) => ({ x: (Date.parse(s.date) - t0) / (7 * DAY_MS), y: s.perf })));
  const weeklyPct = first.perf ? (perWeek / first.perf) * 100 : 0;
  const n = {
    sessions: snaps.length,
    days,
    weightFrom: first.weight,
    weightTo: last.weight,
    repsFrom: first.avgReps,
    repsTo: last.avgReps,
    volumePct: pct(last.volume, first.volume),
    e1rmPct: pct(last.perf, first.perf),
    e1rmFrom: first.perf,
    e1rmTo: last.perf,
    weeklyPct,
    bestE1rm: Math.max(...snaps.map((s) => s.e1rm)),
  };
  if (snaps.length < 2) return { n, quant: [], words: 'Only one session in this range. Log a few more to see a trend.' };

  const quant = [];
  const repsDelta = n.repsTo - n.repsFrom;
  quant.push(`Weight ${kg(n.weightFrom)} → ${kg(n.weightTo)} kg${n.weightTo !== n.weightFrom ? ` (${signed(n.weightTo - n.weightFrom, 1, ' kg')})` : ''}`);
  quant.push(`Reps per set ${n.repsFrom.toFixed(1)} → ${n.repsTo.toFixed(1)} (${signed(repsDelta, 1, '')})`);
  quant.push(`Volume ${signed(n.volumePct)}`);
  quant.push(`Est. strength ${kg(round1(n.e1rmFrom))} → ${kg(round1(n.e1rmTo))} kg (${signed(n.e1rmPct)}), trend ${signed(weeklyPct)} per week`);

  let words;
  const band = p.maintainBand;
  const heavier = n.weightTo > n.weightFrom;
  if (heavier && repsDelta < 0 && (n.e1rmPct ?? 0) > band) {
    words = `You moved up ${kg(n.weightTo - n.weightFrom)} kg and lost ${Math.abs(repsDelta).toFixed(1)} reps per set, yet estimated max rose ${signed(n.e1rmPct)}. That is real strength gain: the reps should climb back over the next few sessions.`;
  } else if (heavier && (n.e1rmPct ?? 0) >= -band) {
    words = `Heavier weight with ${repsDelta >= 0 ? 'no loss of reps' : 'only a small loss of reps'}. Progress is on track.`;
  } else if (!heavier && n.weightTo === n.weightFrom && repsDelta > 0.4) {
    words = `Same weight, ${repsDelta.toFixed(1)} more reps per set: classic double progression. Keep going until every set reaches the top of the range.`;
  } else if ((n.e1rmPct ?? 0) < -band || weeklyPct < -0.5) {
    words = `Strength has slipped ${signed(n.e1rmPct)} over ${n.sessions} sessions. Check sleep, food and rest days; if it keeps falling, take a lighter week.`;
  } else if (Math.abs(weeklyPct) <= 0.3 && n.sessions >= p.stallSessions) {
    words = `Flat for ${n.sessions} sessions (within ±${band}%). A plateau: try adding one rep to one set each time, a longer rest, or a variation of the exercise.`;
  } else if ((n.e1rmPct ?? 0) > band) {
    words = `Steady improvement: estimated max ${signed(n.e1rmPct)} in ${n.days} days.`;
  } else {
    words = 'Holding steady. Small swings like this are normal session to session.';
  }
  return { n, quant, words };
}

/** Body measurements: change over the window for each field, plus a weight-and-waist reading when both exist. */
function analyseBody(entries, fields) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out = { fields: {}, words: '' };
  for (const f of fields) {
    const pts = sorted.filter((e) => Number.isFinite(e.values?.[f])).map((e) => ({ date: e.date, v: e.values[f] }));
    if (pts.length < 2) continue;
    out.fields[f] = { from: pts[0].v, to: pts[pts.length - 1].v, delta: pts[pts.length - 1].v - pts[0].v, days: daysBetween(pts[0].date, pts[pts.length - 1].date), n: pts.length };
  }
  const w = Object.entries(out.fields).find(([k]) => /weight/i.test(k))?.[1];
  const waist = Object.entries(out.fields).find(([k]) => /waist/i.test(k))?.[1];
  if (w && waist) {
    const wd = w.delta;
    const sd = waist.delta;
    if (wd < -0.3 && sd < -0.3) out.words = `Weight ${signed(wd, 1, ' kg')} and waist ${signed(sd, 1, ' cm')}: you are losing fat.`;
    else if (wd > 0.3 && sd <= 0.3) out.words = `Weight ${signed(wd, 1, ' kg')} with the waist steady (${signed(sd, 1, ' cm')}): most likely muscle, a good lean gain.`;
    else if (wd > 0.3 && sd > 0.3) out.words = `Weight ${signed(wd, 1, ' kg')} and waist ${signed(sd, 1, ' cm')}: some of the gain is fat. Tighten food a little if that is not the plan.`;
    else if (Math.abs(wd) <= 0.3 && sd < -0.3) out.words = `Weight steady while the waist is ${signed(sd, 1, ' cm')}: recomposition, losing fat and gaining muscle.`;
    else out.words = `Weight ${signed(wd, 1, ' kg')}, waist ${signed(sd, 1, ' cm')}: no clear change yet. Give it a few more weeks.`;
  }
  return out;
}

/** Weekly average of daily weigh-ins: [{ week: 'YYYY-MM-DD' (Monday), avg, n }]. */
function weeklyAverages(entries, field) {
  const byWeek = new Map();
  for (const e of entries) {
    const v = e.values?.[field];
    if (!Number.isFinite(v)) continue;
    const d = new Date(Date.parse(e.date));
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
    const w = byWeek.get(monday) || { week: monday, sum: 0, n: 0 };
    w.sum += v;
    w.n += 1;
    byWeek.set(monday, w);
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ week: w.week, avg: w.sum / w.n, n: w.n }));
}

function mondayOf(iso) {
  const d = new Date(Date.parse(iso));
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Overall strength per calendar week (Monday start), oldest first: [{ week, pct, n }].
 * For every exercise trained in a week, its mean `perf` that week is compared with its own mean over the
 * 4 weeks before; the week's `pct` is the average of those changes over the `n` exercises that have a baseline.
 * Comparing each exercise with itself keeps a strong day from hiding a weak one.
 */
function weeklyStrength(sessions) {
  const byExercise = new Map(); // exercise → [{ date, perf }]
  for (const s of sessions) {
    const names = new Set(s.sets.filter(isWorking).map((x) => x.exercise));
    for (const name of names) {
      const snap = exerciseSnapshot(s, name, null);
      if (!snap) continue;
      if (!byExercise.has(name)) byExercise.set(name, []);
      byExercise.get(name).push({ date: s.date, perf: snap.perf });
    }
  }
  const weeks = new Map(); // week → [pct]
  for (const points of byExercise.values()) {
    const perWeek = new Map();
    for (const p of points) {
      const w = mondayOf(p.date);
      if (!perWeek.has(w)) perWeek.set(w, []);
      perWeek.get(w).push(p.perf);
    }
    for (const [w, vals] of perWeek) {
      const from = addDays(w, -28);
      const base = points.filter((p) => p.date >= from && p.date < w).map((p) => p.perf);
      if (!base.length) continue;
      const b = base.reduce((v, x) => v + x, 0) / base.length;
      const now = vals.reduce((v, x) => v + x, 0) / vals.length;
      if (!weeks.has(w)) weeks.set(w, []);
      weeks.get(w).push(pct(now, b));
    }
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, list]) => ({ week, pct: list.reduce((v, x) => v + x, 0) / list.length, n: list.length }));
}

/** Average 1–5 rating over the last `n` rated workouts, using the named questions when present (else all). */
function recentFeel(sessions, n, names) {
  const rated = [...sessions]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((s) => {
      const sat = s.satisfaction || {};
      const pick = names.filter((q) => Number.isFinite(sat[q])).map((q) => sat[q]);
      const vals = pick.length ? pick : Object.values(sat).filter(Number.isFinite);
      return vals.length ? vals.reduce((v, x) => v + x, 0) / vals.length : null;
    })
    .filter((v) => v !== null)
    .slice(0, n);
  if (rated.length < n) return null;
  return rated.reduce((v, x) => v + x, 0) / rated.length;
}

/** Hard (working) sets per muscle group in the 7 days ending `today`. */
function weeklyMuscleSets(sessions, muscleOf, today) {
  const from = addDays(today, -6);
  const counts = {};
  for (const s of sessions) {
    if (!s.date || s.date < from || s.date > today) continue;
    for (const set of s.sets) {
      if (!isWorking(set)) continue;
      const m = muscleOf(set.exercise);
      if (!m) continue;
      counts[m] = (counts[m] || 0) + 1;
    }
  }
  return counts;
}

const Progress = {
  PROGRESSION_DEFAULTS,
  RECOVERY_DEFAULTS,
  parsePlan,
  e1rm,
  pct,
  setRir,
  isWorking,
  exerciseSnapshot,
  qualifies,
  setComparison,
  analyseExercise,
  progressionStatus,
  warningFlags,
  workoutInsight,
  exerciseSentence,
  statusLine,
  analyseWindow,
  analyseBody,
  weeklyAverages,
  weeklyMuscleSets,
  weeklyStrength,
  recentFeel,
  mondayOf,
  signed,
  daysBetween,
  addDays,
};

if (typeof module !== 'undefined') module.exports = Progress;
