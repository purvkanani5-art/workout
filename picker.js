'use strict';

/* Bhimlekha v2.2: the exercise search panel and the database helpers around it. Loaded before app.js; uses app.js
   globals (state, esc, render, toast, group, tag, …) only when called. Its handlers are merged into app.js's tables.

   One panel serves every place an exercise is added:
     ctx 'log'     the workout screen: the picked exercise opens in the logging panel (and joins today's day)
     ctx 'plan'    More → Exercises & plans, or the Muscles tab: the picked exercise joins the chosen day
     ctx 'alias'   a name the database does not know: the picked exercise gets it as another name ("Also called")
   Search covers names, other names, equipment and muscles. "Create" makes a new database row: muscles are tapped
   once for Main and twice for Helping, so muscle names are never typed. New rows and other names go to the
   Sheet's Exercises tab (queued when offline). */

const NEW_EXERCISE_PLAN = '3 × 8-12';

function pickerUi() {
  return state.ui.picker;
}

/** Open the panel. opts: { ctx, day, query, alias } */
function openPicker(opts) {
  // `hash` ties the panel to the page it was opened on: going to another page closes it (render()).
  state.ui.picker = { ctx: opts.ctx, day: opts.day || null, query: opts.query || '', alias: opts.alias || '', mode: 'search', create: null, hash: location.hash, enter: true };
  render();
  refreshExercises(false, 5 * 60000); // the Sheet's latest rows, quietly
  setTimeout(() => document.getElementById('pick-q')?.focus(), 60);
}

function closePicker() {
  state.ui.picker = null;
  render();
}

/** Days an exercise can be added to (the plan's days without Custom). */
function planDays() {
  return manageDays().filter((d) => d !== 'Custom');
}

/** The day with most exercises that train this muscle as a main muscle (for "add to plan" from the Muscles tab). */
function dayForMuscle(key) {
  const { db } = exerciseDb();
  let best = null;
  let bestN = -1;
  for (const day of planDays()) {
    const n = (state.exercises[day] || []).filter((name) => {
      const e = Muscles.lookup(db, name, muscleOf(name));
      return e && (e.main.includes(key) || e.helps.includes(key));
    }).length;
    if (n > bestN) [best, bestN] = [day, n];
  }
  return best || planDays()[0];
}

/** Exercise names in the plan or the log that the database does not know (by name or other name). */
function unknownNames() {
  const { db } = exerciseDb();
  const names = new Set([...planNames(), ...state.history.flatMap((s) => s.sets.map((x) => x.exercise))]);
  return [...names].filter((n) => n && !db.index.has(Muscles.norm(n))).sort((a, b) => a.localeCompare(b));
}

function muscleNames(keys) {
  return keys.map((k) => Muscles.BY_KEY[k].name).join(', ');
}

function resultRow(e, p) {
  const inDay = p.ctx === 'plan' && p.day && (state.exercises[p.day] || []).some((n) => Muscles.norm(n) === Muscles.norm(e.name));
  const inToday = p.ctx === 'log' && state.draft && entryExercises().some((n) => Muscles.lookup(exerciseDb().db, n)?.name === e.name);
  return `<button type="button" class="lrow pick-row" data-action="pickExercise" data-name="${esc(e.name)}">
    <span class="tx"><b>${esc(e.name)}</b><span>${esc([e.equipment, e.main.length ? `main: ${muscleNames(e.main)}` : ''].filter(Boolean).join(' · '))}${
      e.aliases.length ? `<br />also called ${esc(e.aliases.join(', '))}` : ''
    }</span></span>${inDay ? tag(`In ${p.day}`, 'ok') : inToday ? tag('Today', 'ok') : ''}</button>`;
}

/** The result list only (redrawn in place while typing, so the keyboard stays up). */
function pickResultsHtml() {
  const p = pickerUi();
  const { db } = exerciseDb();
  const list = Muscles.search(db, p.query, 40);
  const q = p.query.trim();
  const create = `<button type="button" class="lrow pick-new" data-action="pickCreate">${appIcon('bolt', 'yellow')}<span class="tx"><b>${
    q ? `Create “${esc(q)}”` : 'Create a new exercise'
  }</b><span>Not in the database: pick its muscles, it is added to the Sheet</span></span>${CHEV}</button>`;
  return `${list.length ? `<div class="card flush">${list.map((e) => resultRow(e, p)).join('')}</div>` : `<p class="empty pad">Nothing matches “${esc(q)}”.</p>`}
    <div class="card flush" style="margin-top:10px">${create}</div>`;
}

function renderPicker() {
  const p = pickerUi();
  if (!p) return '';
  const title = p.ctx === 'alias' ? `Which exercise is “${p.alias}”?` : p.ctx === 'log' ? 'Add an exercise' : 'Add to your plan';
  const body = p.mode === 'create' ? renderCreateForm() : renderSearch();
  return `
    <div class="logsheet-overlay picker-overlay" data-action="pickClose" aria-hidden="true"></div>
    <section class="logsheet picksheet ${p.enter ? 'enter' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab" aria-hidden="true"></div>
      <div class="pick-head"><b>${esc(p.mode === 'create' ? 'New exercise' : title)}</b><button type="button" class="btn link" data-action="${
        p.mode === 'create' ? 'pickBack' : 'pickClose'
      }">${p.mode === 'create' ? 'Back' : 'Close'}</button></div>
      ${body}
    </section>`;
}

function renderSearch() {
  const p = pickerUi();
  const days = p.ctx === 'plan'
    ? `<div class="pick-days" role="radiogroup" aria-label="Add to">${planDays()
        .map((d) => `<button type="button" role="radio" aria-checked="${d === p.day}" data-action="pickDay" data-day="${esc(d)}">${esc(d)}</button>`)
        .join('')}</div>`
    : '';
  const hint = p.ctx === 'alias'
    ? `<p class="hint" style="margin:0 2px 8px">Pick the exercise you mean. “${esc(p.alias)}” is saved as another name for it in the Sheet, so your workouts with either name count for the same muscles.</p>`
    : '';
  return `${days}${hint}
    <div class="pick-search">${icon('search')}<input id="pick-q" class="input" type="search" placeholder="Name, equipment or muscle" value="${esc(p.query)}" data-input="pickQuery" autocomplete="off" autocapitalize="off" spellcheck="false" /></div>
    <div id="pick-results">${pickResultsHtml()}</div>`;
}

/** New exercise: name, equipment (one tap), muscles (tap once = Main, twice = Helping, three times = off). */
function renderCreateForm() {
  const c = pickerUi().create;
  const areas = [...new Set(Muscles.MUSCLES.map((m) => m.area))];
  const main = Object.keys(c.marks).filter((k) => c.marks[k] === 'main');
  const helps = Object.keys(c.marks).filter((k) => c.marks[k] === 'helps');
  return `
    <div class="stack">
      <div>
        <label for="pick-name">Name</label>
        <input id="pick-name" class="input" value="${esc(c.name)}" placeholder="e.g. Hammer Strength Row" data-input="pickName" autocomplete="off" />
      </div>
      <fieldset>
        <legend>Equipment</legend>
        <div class="pills">${Muscles.EQUIPMENT.map((q) => `<button type="button" class="pill-btn ${c.equipment === q ? 'on' : ''}" aria-pressed="${c.equipment === q}" data-action="pickEquip" data-value="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      </fieldset>
      <fieldset>
        <legend>Muscles</legend>
        <p class="hint" style="margin:0 0 8px">Tap once for a <b class="mk main">Main</b> muscle, twice for a <b class="mk helps">Helping</b> one, again to clear.</p>
        ${areas
          .map(
            (a) => `<p class="sublabel">${esc(a)}</p><div class="pills">${Muscles.MUSCLES.filter((m) => m.area === a)
              .map((m) => {
                const st = c.marks[m.key] || '';
                return `<button type="button" class="pill-btn mpick ${st}" data-action="pickMuscle" data-key="${m.key}" aria-label="${esc(m.name)}${st ? `, ${st === 'main' ? 'main' : 'helping'}` : ''}">${esc(m.name)}${st ? `<small>${st === 'main' ? 'Main' : 'Helps'}</small>` : ''}</button>`;
              })
              .join('')}</div>`,
          )
          .join('')}
      </fieldset>
      <p class="small muted" style="margin:0">${main.length ? `Main: ${esc(muscleNames(main))}` : 'Pick at least one main muscle.'}${helps.length ? `<br />Helping: ${esc(muscleNames(helps))}` : ''}</p>
      <button type="button" class="btn primary" data-action="pickSave">Save exercise${pickerUi().ctx === 'alias' ? '' : ' and add it'}</button>
    </div>`;
}

/** Put the picked exercise where the panel was opened from. */
function usePicked(name) {
  const p = pickerUi();
  if (p.ctx === 'alias') {
    if (Muscles.norm(name) !== Muscles.norm(p.alias)) queueExerciseOp({ type: 'alias', name, alias: p.alias });
    // A changed automatic match keeps its place in "Matched automatically", now pointing at your choice.
    const auto = state.autoAliases.find((x) => Muscles.norm(x.alias) === Muscles.norm(p.alias));
    if (auto) {
      auto.name = name;
      save(KEYS.autoAliases, state.autoAliases);
    }
    toast(`“${p.alias}” now counts as ${name}`);
    return closePicker();
  }
  if (p.ctx === 'plan') {
    const day = p.day || planDays()[0];
    if (!state.exercises[day]) state.exercises[day] = [];
    if (state.exercises[day].some((n) => Muscles.norm(n) === Muscles.norm(name))) return toast(`Already in ${day}`, 'error');
    state.exercises[day].push(name);
    if (!state.targets[day]) state.targets[day] = {};
    if (!state.targets[day][name]) state.targets[day][name] = NEW_EXERCISE_PLAN; // a starting plan, editable with ✎
    save(KEYS.exercises, state.exercises);
    save(KEYS.targets, state.targets);
    toast(`${name} added to ${day} · plan ${state.targets[day][name]}`);
    return closePicker();
  }
  // ctx 'log': the exercise joins today's day and opens in the logging panel.
  const day = state.draft.dayType;
  if (!state.exercises[day]) state.exercises[day] = [];
  if (!state.exercises[day].includes(name)) {
    state.exercises[day].push(name);
    save(KEYS.exercises, state.exercises);
  }
  if (!planText(day, name)) {
    // A starting plan, so its dots and "next set" work (editable in More → Exercises & plans).
    if (!state.targets[day]) state.targets[day] = {};
    state.targets[day][name] = NEW_EXERCISE_PLAN;
    save(KEYS.targets, state.targets);
  }
  state.ui.picker = null;
  state.ui.form = newForm(name);
  state.ui.sheet = true;
  render();
}

/** "Names the database does not know": each with its closest matches (one tap saves the alias), Other… and New. */
function unknownNamesHtml() {
  const list = unknownNames();
  if (!list.length) return '';
  const { db } = exerciseDb();
  return group(
    'Names to match',
    `<span class="note">${list.length}</span>`,
    `<div class="card flush">${list
      .map((n) => {
        const sug = Muscles.suggest(db, n, 2);
        return `<div class="unk"><b>${esc(n)}</b><span class="hint">Not in the exercise database. Same as…</span>
          <div class="pills">${sug
            .map((e) => `<button type="button" class="pill-btn" data-action="aliasTo" data-alias="${esc(n)}" data-name="${esc(e.name)}">= ${esc(e.name)}</button>`)
            .join('')}<button type="button" class="pill-btn" data-action="aliasPick" data-alias="${esc(n)}">Other…</button><button type="button" class="pill-btn" data-action="aliasNew" data-alias="${esc(n)}">New exercise</button></div></div>`;
      })
      .join('')}</div>
    <p class="hint gnote">The name you use is kept: it is saved as another name (“Also called”) of the exercise in the Sheet, so any name you use counts for the same muscles.</p>`,
  );
}

/**
 * v2.2.1: your own names (plan and every logged workout) matched to database exercises by the app itself, so a
 * muscle is never "not in your plan" because of how an exercise is written ("DB Shoulder Press" = Seated Dumbbell
 * Shoulder Press). Only sure matches are made (Muscles.autoMatch); the rest stay in "Names to match". Each match is
 * saved as another name in the Sheet and listed under "Matched automatically", where it can be changed.
 * Runs on the Sheet's rows (not the built-in list) when the Sheet is connected, so the names it links exist there.
 */
function autoAliasUnknown() {
  const { db, fromSheet } = exerciseDb();
  if (haveApi() && !fromSheet) return 0;
  const made = [];
  for (const n of unknownNames()) {
    const m = Muscles.autoMatch(db, n);
    if (m) made.push({ alias: n, name: m.e.name, date: todayISO() });
  }
  if (!made.length) return 0;
  queueExerciseOp(made.map((x) => ({ type: 'alias', name: x.name, alias: x.alias })));
  state.autoAliases = [...state.autoAliases.filter((x) => !made.some((y) => Muscles.norm(y.alias) === Muscles.norm(x.alias))), ...made];
  save(KEYS.autoAliases, state.autoAliases);
  toast(`Matched ${made.length} of your exercise name${made.length === 1 ? '' : 's'} to the database`);
  return made.length;
}

/** "Matched automatically": each of your names and the exercise it now counts as, with Change. */
function autoMatchedHtml(open = false) {
  const list = state.autoAliases.slice().sort((a, b) => a.alias.localeCompare(b.alias));
  if (!list.length) return '';
  return `<section class="sgroup"><details class="automatch" ${open ? 'open' : ''}>
    <summary class="ghead"><h2>Matched automatically</h2><span class="note">${list.length} name${list.length === 1 ? '' : 's'} ›</span></summary>
    <div class="card flush">${list
      .map(
        (x) => `<div class="erow"><div class="tx"><b>${esc(x.alias)}</b><span>counts as ${esc(x.name)}</span></div><div class="acts"><button type="button" class="btn small pill" data-action="aliasPick" data-alias="${esc(x.alias)}">Change</button></div></div>`,
      )
      .join('')}</div>
    <p class="hint gnote">Your names stay as they are; each is saved as another name of the exercise in the Sheet's “Also called” column.</p>
  </details></section>`;
}

/** One line on database changes still waiting for the Sheet. */
function exSyncNote() {
  const n = state.exOps.length;
  if (!n) return '';
  return `<p class="small warn-text iline" style="margin:0">${icon('sync')}<span>${n} change${n === 1 ? '' : 's'} to the exercise database waiting for the Sheet${
    /unknown action/.test(exSheetError) ? ': paste the new Code.gs in Apps Script and deploy a new version' : ' (sent when online)'
  }.</span></p>`;
}

const pickerActions = {
  openPicker(el) {
    const ctx = el.dataset.ctx;
    openPicker({
      ctx,
      day: ctx === 'plan' ? el.dataset.day || (el.dataset.muscle ? dayForMuscle(el.dataset.muscle) : state.ui.manageDay) : null,
      query: el.dataset.query || '',
    });
  },
  pickClose() {
    closePicker();
  },
  pickBack() {
    pickerUi().mode = 'search';
    render();
  },
  pickDay(el) {
    pickerUi().day = el.dataset.day;
    render();
  },
  pickExercise(el) {
    usePicked(el.dataset.name);
  },
  pickCreate() {
    const p = pickerUi();
    const name = p.ctx === 'alias' ? p.alias : p.query.trim();
    // Muscles typed in the search ("rear delts") start marked as Main.
    const k = Muscles.muscleKey(p.query);
    p.create = { name: k ? '' : name, equipment: '', marks: k ? { [k]: 'main' } : {} };
    p.mode = 'create';
    render();
  },
  pickEquip(el) {
    const c = pickerUi().create;
    c.equipment = c.equipment === el.dataset.value ? '' : el.dataset.value;
    render();
  },
  pickMuscle(el) {
    const c = pickerUi().create;
    const k = el.dataset.key;
    c.marks[k] = !c.marks[k] ? 'main' : c.marks[k] === 'main' ? 'helps' : '';
    if (!c.marks[k]) delete c.marks[k];
    render();
  },
  pickSave() {
    const p = pickerUi();
    const c = p.create;
    const name = (document.getElementById('pick-name')?.value ?? c.name).trim();
    if (!name) return toast('Give the exercise a name', 'error');
    const main = Object.keys(c.marks).filter((k) => c.marks[k] === 'main');
    const helps = Object.keys(c.marks).filter((k) => c.marks[k] === 'helps');
    if (!main.length) return toast('Tap at least one main muscle', 'error');
    const { db } = exerciseDb();
    const existing = db.index.get(Muscles.norm(name));
    if (existing && Muscles.norm(existing.name) === Muscles.norm(name)) return toast(`${existing.name} is already in the database`, 'error');
    queueExerciseOp({ type: 'upsert', row: { name, equipment: c.equipment, main: muscleNames(main), helps: muscleNames(helps), aliases: p.ctx === 'alias' && Muscles.norm(p.alias) !== Muscles.norm(name) ? p.alias : '' } });
    toast(`${name} added to the exercise database`);
    if (p.ctx === 'alias') return closePicker();
    usePicked(name);
  },
  aliasTo(el) {
    queueExerciseOp({ type: 'alias', name: el.dataset.name, alias: el.dataset.alias });
    toast(`“${el.dataset.alias}” now counts as ${el.dataset.name}`);
    render();
  },
  aliasPick(el) {
    openPicker({ ctx: 'alias', alias: el.dataset.alias, query: el.dataset.alias });
  },
  aliasNew(el) {
    openPicker({ ctx: 'alias', alias: el.dataset.alias, query: el.dataset.alias });
    pickerActions.pickCreate();
  },
};

const pickerInputs = {
  pickQuery(el) {
    pickerUi().query = el.value;
    const box = document.getElementById('pick-results');
    if (box) box.innerHTML = pickResultsHtml();
  },
  pickName(el) {
    pickerUi().create.name = el.value;
  },
};
