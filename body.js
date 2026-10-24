'use strict';

/* Bhimlekha body maths: body fat, calories and the daily recovery score. Pure functions over their arguments,
   no DOM and no storage, so they can be tested in Node (module.exports at the end). Loaded before track.js.

   Body fat: US Navy circumference method (Hodgdon & Beckett), metric form. Men use the abdomen at the navel and the
   neck; women the waist, hips and neck. Height in cm.
   Calories: resting burn (BMR) by Katch-McArdle when a recent body fat reading exists, else Mifflin-St Jeor; daily
   burn = BMR × daily-life factor + the average logged workout calories (discounted: watches read high); the target
   takes off a weekly loss rate as a % of bodyweight (7,700 kcal per kg) and never goes below BMR.
   Recovery: each signal is scored 0–100 against the owner's own recent baseline, then weighted. */

const Body = (() => {
const DAY_MS = 86400000;
const KCAL_PER_KG = 7700;

const CALORIE_DEFAULTS = {
  goal: 'lose', // lose | maintain | gain
  ratePct: 0.75, // % of bodyweight per week (loss or gain)
  lifeFactor: 1.2, // BMR × this = daily life without workouts (1.2 = mostly sitting)
  watchDiscountPct: 25, // logged active calories are cut by this much: watches overestimate
  workoutDays: 14, // workout calories are averaged over this many days
  bfMaxAgeDays: 21, // a body fat reading older than this is not used (Mifflin instead)
  changeKcal: 100, // the target only moves when the new number differs by at least this much…
  recalcKg: 5, // …or bodyweight has moved this many kg since the target was set
  floorBmr: true, // never set the target below the resting burn
};

const RECOVERY_SCORE_DEFAULTS = {
  sleepTargetH: 7.5,
  baselineDays: 28, // the personal baseline: this many days before today
  minBaseline: 5, // days of a signal needed before it counts
  wSleep: 30, // weights (any scale; missing signals drop out and the rest are rescaled)
  wHrv: 30,
  wRhr: 20,
  wSoreness: 20,
  green: 70, // score ≥ green: train as planned
  amber: 40, // score ≥ amber: train lighter; below: light session or rest
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

function ageOn(dob, iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = iso.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/* ------------------------------------------------------------- body fat */

/** US Navy body fat %, or null when a measurement is missing or the numbers cannot be right. */
function navyBodyFat({ sex, heightCm, neckCm, abdomenCm, waistCm, hipsCm }) {
  const h = num(heightCm);
  const neck = num(neckCm);
  if (!h || !neck) return null;
  let bf;
  if (sex === 'female') {
    const w = num(waistCm);
    const hip = num(hipsCm);
    if (!w || !hip || w + hip - neck <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - neck) + 0.221 * Math.log10(h)) - 450;
  } else {
    const a = num(abdomenCm);
    if (!a || a - neck <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(a - neck) + 0.15456 * Math.log10(h)) - 450;
  }
  return bf > 2 && bf < 70 ? Math.round(bf * 10) / 10 : null;
}

/** Which check-in fields the formula reads, found by name ("Abdomen (cm)" at the navel, "Waist (cm)" where the
    waistband sits, "Neck (cm)", "Hips (cm)"). */
function navyFields(fields) {
  const find = (re) => fields.find((f) => re.test(f)) || null;
  return { neck: find(/neck/i), abdomen: find(/abdomen|navel/i), waist: find(/waist/i), hips: find(/hip/i) };
}

function navyMissing(sex, map) {
  const need = sex === 'female' ? ['neck', 'waist', 'hips'] : ['neck', 'abdomen'];
  return need.filter((k) => !map[k]);
}

/** Body fat for one check-in's values, or null. */
function entryBodyFat(values, profile, map) {
  return navyBodyFat({
    sex: profile.sex,
    heightCm: profile.heightCm,
    neckCm: map.neck && values[map.neck],
    abdomenCm: map.abdomen && values[map.abdomen],
    waistCm: map.waist && values[map.waist],
    hipsCm: map.hips && values[map.hips],
  });
}

/** Every check-in with a body fat reading, oldest first: [{ date, bf, weight, lbm }]. */
function bodyFatSeries(entries, profile, fields, weightField) {
  const map = navyFields(fields);
  return entries
    .filter((e) => e.kind !== 'weighin')
    .map((e) => {
      const bf = entryBodyFat(e.values || {}, profile, map);
      const w = num(e.values?.[weightField]);
      return bf === null ? null : { date: e.date, bf, weight: w, lbm: w ? Math.round(w * (1 - bf / 100) * 10) / 10 : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------- calories */

function bmrMifflin({ sex, weightKg, heightCm, age }) {
  if (!weightKg || !heightCm || !Number.isFinite(age)) return null;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
}

function bmrKatch(weightKg, bfPct) {
  if (!weightKg || !Number.isFinite(bfPct)) return null;
  return 370 + 21.6 * weightKg * (1 - bfPct / 100);
}

/** Bodyweight now: the average of the last 7 days' entries when there are 3 or more, else the latest one. */
function currentWeight(entries, weightField, today) {
  const list = entries
    .filter((e) => num(e.values?.[weightField]) !== null && e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const week = list.filter((e) => daysBetween(e.date, today) < 7);
  if (week.length >= 3) {
    return { kg: Math.round((week.reduce((s, e) => s + Number(e.values[weightField]), 0) / week.length) * 10) / 10, n: week.length, date: today };
  }
  const last = list[list.length - 1];
  return { kg: Number(last.values[weightField]), n: 1, date: last.date };
}

/** Average logged workout calories per day over the last `days` days (only workouts that have a number). */
function workoutKcalPerDay(sessions, today, days) {
  const from = new Date(Date.parse(today) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const list = sessions.filter((s) => s.date >= from && s.date <= today && num(s.activeCalories) !== null);
  return { perDay: list.reduce((t, s) => t + Number(s.activeCalories), 0) / days, workouts: list.length };
}

/**
 * The calorie target for today. `profile` = { sex, dob, heightCm }; `c` = CALORIE_DEFAULTS-shaped settings.
 * Returns null fields when something needed is missing, with `missing` naming it.
 */
function calorieTarget({ profile, c, weight, bf, sessions, today }) {
  const missing = [];
  if (!profile.heightCm) missing.push('height');
  if (!weight) missing.push('bodyweight');
  const age = ageOn(profile.dob, today);
  const bfOk = bf && daysBetween(bf.date, today) <= c.bfMaxAgeDays;
  if (!bfOk && age === null) missing.push('date of birth');
  if (missing.length) return { missing };
  const method = bfOk ? 'Katch-McArdle' : 'Mifflin-St Jeor';
  const bmr = bfOk ? bmrKatch(weight.kg, bf.bf) : bmrMifflin({ sex: profile.sex, weightKg: weight.kg, heightCm: profile.heightCm, age });
  const life = bmr * c.lifeFactor;
  const wk = workoutKcalPerDay(sessions, today, c.workoutDays);
  const workout = wk.perDay * (1 - c.watchDiscountPct / 100);
  const tdee = life + workout;
  const rate = c.goal === 'maintain' ? 0 : c.ratePct;
  const change = (((rate / 100) * weight.kg * KCAL_PER_KG) / 7) * (c.goal === 'gain' ? 1 : -1);
  const raw = tdee + change;
  const floor = c.floorBmr === false ? 1200 : bmr; // switched off: still never under 1,200 kcal
  const target = Math.round(Math.max(floor, raw) / 10) * 10;
  return {
    missing,
    method,
    age,
    bmr: Math.round(bmr),
    life: Math.round(life),
    workout: Math.round(workout),
    workouts: wk.workouts,
    tdee: Math.round(tdee),
    change: Math.round(change),
    target,
    floored: raw < floor,
    weightKg: weight.kg,
    bf: bfOk ? bf.bf : null,
    lbm: bfOk ? Math.round(weight.kg * (1 - bf.bf / 100) * 10) / 10 : null,
  };
}

/**
 * Whether the target the owner uses (`locked` = { target, weightKg, date, bfDate }) should move to `calc`.
 * It moves when there is none yet, a newer body fat reading arrived, bodyweight moved `recalcKg`, or a week has
 * passed and the number differs by at least `changeKcal`. Small daily wobbles never change what goes in MyFitnessPal.
 */
function shouldUpdateTarget(locked, calc, bfDate, c, today) {
  if (!calc || !calc.target) return null;
  if (!locked || !locked.target) return 'first';
  if (bfDate && bfDate > (locked.bfDate || '') && calc.bf !== null) return 'body fat';
  if (Math.abs(calc.weightKg - locked.weightKg) >= c.recalcKg) return 'weight';
  if (daysBetween(locked.date, today) >= 7 && Math.abs(calc.target - locked.target) >= c.changeKcal) return 'week';
  return null;
}

/** Actual weekly change over the last `weeks` weeks of weekly weight averages vs the plan, in % of bodyweight. */
function rateCheck(weeklyAvgs, c, weeks = 3) {
  const pts = weeklyAvgs.slice(-(weeks + 1));
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const n = daysBetween(first.week, last.week) / 7;
  if (n <= 0) return null;
  const pct = ((last.avg - first.avg) / first.avg / n) * 100; // per week, signed
  const plan = c.goal === 'maintain' ? 0 : c.goal === 'gain' ? c.ratePct : -c.ratePct;
  return { pct: Math.round(pct * 100) / 100, plan, weeks: Math.round(n), kgPerWeek: Math.round(((last.avg - first.avg) / n) * 100) / 100 };
}

/* ------------------------------------------------------------- recovery */

/** Sleep hours from "start|end;start|end" ISO pairs (as the iPhone Shortcut sends them), merging overlaps so the
    Watch and the iPhone recording the same night are not counted twice. */
function sleepHoursFromSpans(text) {
  const spans = String(text || '')
    .split(';')
    .map((p) => p.split('|').map((x) => Date.parse(x.trim())))
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of spans) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return spans.length ? Math.round((total / 3600000) * 100) / 100 : null;
}

function baseline(entries, key, today, r) {
  const vals = entries
    .filter((e) => e.date < today && daysBetween(e.date, today) <= r.baselineDays && num(e[key]) !== null)
    .map((e) => Number(e[key]));
  if (vals.length < r.minBaseline) return { n: vals.length, ready: false };
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  return { n: vals.length, ready: true, mean, sd: Math.max(sd, mean * 0.05) }; // a floor so a very steady baseline does not swing wildly
}

/**
 * Today's recovery score from `entries` = [{ date, sleepHours, sleepScore, rhr, hrv, soreness }] (one per day).
 * Each part 0–100: sleep (hours vs target, averaged with the Watch sleep score when given), HRV and resting HR
 * against the owner's baseline (1 SD = 20 points; higher HRV / lower RHR is better), soreness 1 (none) – 10.
 */
function recoveryScore(entries, today, r) {
  const t = entries.find((e) => e.date === today);
  if (!t) return null;
  const parts = [];
  const notes = [];
  const hours = num(t.sleepHours);
  const sScore = num(t.sleepScore);
  if (hours !== null || sScore !== null) {
    const fromHours = hours === null ? null : clamp(100 - Math.max(0, r.sleepTargetH - hours) * 25, 0, 100);
    const vals = [fromHours, sScore === null ? null : clamp(sScore, 0, 100)].filter((x) => x !== null);
    parts.push({ key: 'sleep', label: 'Sleep', score: vals.reduce((s, v) => s + v, 0) / vals.length, w: r.wSleep, detail: [hours !== null ? `${hours.toFixed(1)} h` : '', sScore !== null ? `score ${sScore}` : ''].filter(Boolean).join(', ') });
  }
  for (const [key, label, better] of [['hrv', 'HRV', 1], ['rhr', 'Resting HR', -1]]) {
    const v = num(t[key]);
    if (v === null) continue;
    const b = baseline(entries, key, today, r);
    if (!b.ready) {
      notes.push(`${label}: building your baseline (${b.n} of ${r.minBaseline} days)`);
      continue;
    }
    const z = (v - b.mean) / b.sd;
    parts.push({ key, label, score: clamp(50 + better * 20 * z, 0, 100), w: key === 'hrv' ? r.wHrv : r.wRhr, detail: `${Math.round(v)} vs usual ${Math.round(b.mean)}${key === 'hrv' ? ' ms' : ' bpm'}` });
  }
  const sore = num(t.soreness);
  if (sore !== null) parts.push({ key: 'soreness', label: 'Soreness', score: clamp(100 - (sore - 1) * (100 / 9), 0, 100), w: r.wSoreness, detail: `${sore}/10` });
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  if (!parts.length || !totalW) return { score: null, parts, notes };
  const score = Math.round(parts.reduce((s, p) => s + p.score * p.w, 0) / totalW);
  const band = score >= r.green ? 'green' : score >= r.amber ? 'amber' : 'red';
  return { score, band, parts: parts.map((p) => ({ ...p, score: Math.round(p.score) })), notes };
}

return {
  CALORIE_DEFAULTS,
  RECOVERY_SCORE_DEFAULTS,
  KCAL_PER_KG,
  ageOn,
  navyBodyFat,
  navyFields,
  navyMissing,
  entryBodyFat,
  bodyFatSeries,
  bmrMifflin,
  bmrKatch,
  currentWeight,
  workoutKcalPerDay,
  calorieTarget,
  shouldUpdateTarget,
  rateCheck,
  sleepHoursFromSpans,
  recoveryScore,
};
})(); // own scope: progress.js loads as a classic script too and has a DAY_MS of its own

if (typeof module !== 'undefined') module.exports = Body;
