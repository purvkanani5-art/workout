# CLAUDE.md — Bhimlekha (भीमलेखा) · Workout Tracker (GitHub Pages + Google Sheets)

## Brand
- **Name:** Bhimlekha — "Bhima's record". Use "Bhimlekha" everywhere the app is named (page title, header, manifest, Home Screen label, README).
- **Icon:** the letter भ whose shirorekha (top line) is a loaded barbell, sitting on the letter like a hat. **Final icon files are provided in `icons/` — use them as-is; do not redraw or regenerate them.**
  - `icons/icon.svg` (master, square — iOS rounds the corners itself), `icons/apple-touch-icon.png` (180), `icons/icon-192.png`, `icons/icon-512.png`.
  - Also use `icon.svg` as the favicon and as a 32px mark beside "Bhimlekha" in the Home screen header.
- **Brand colours (CSS variables):** `--ink: #17120F`, `--saffron: #F07F1E`, `--ivory: #F6EEE3`.
  - `theme-color` and manifest `background_color`/`theme_color`: `#17120F`.
  - Primary button stays black/ink; use saffron as the accent (selected reps chip, active set radio, rest-timer bar, success toasts) **instead of the green in the screenshot spec below**.

## What we are building
A personal workout logger used as a home-screen web app on iPhone.
- **Frontend:** static site (vanilla HTML/CSS/JS, no framework, no build step) hosted on **GitHub Pages**.
- **Backend:** a **Google Apps Script** web app bound to a **Google Sheet**. The app POSTs a finished workout; the script appends one row per set.
- Sets are saved locally as a **draft** while training; the whole workout is **submitted once** at the end.
- Must keep working with poor gym signal: drafts and unsent workouts live in `localStorage`, unsent workouts retry automatically.

Owner: single user (me). Units: **kg**. Locale: India (dates shown DD MMM YYYY, stored YYYY-MM-DD local time).

---

## Project structure (create exactly this)
```
/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── icons/
│   ├── icon.svg
│   ├── apple-touch-icon.png   (180x180)
│   ├── icon-192.png
│   └── icon-512.png
├── apps-script/
│   └── Code.gs                (pasted manually into Google Apps Script — not served)
├── README.md                  (setup steps for me, see "README content" below)
└── .nojekyll
```
- Icons are already provided (see Brand). Do not generate or replace them.
- **All paths relative** (`./app.js`, `./sw.js`, `start_url: "./"`, `scope: "./"`) because Pages serves from `https://<user>.github.io/<repo>/`.
- **No secrets in the repo.** The repo will be public. Script URL and token are entered in the app's Settings screen and stored in `localStorage` only.

---

## iPhone / PWA requirements
- In `<head>`: `viewport` with `width=device-width, initial-scale=1, viewport-fit=cover`; `apple-mobile-web-app-capable=yes`; `apple-mobile-web-app-status-bar-style=default`; `apple-mobile-web-app-title=Bhimlekha`; `apple-touch-icon` link; `theme-color` `#17120F`; favicon `icons/icon.svg`; link to manifest.
- `manifest.webmanifest`: name "Bhimlekha", short_name "Bhimlekha", display `standalone`, icons 192/512, relative start_url/scope.
- Respect safe areas: `padding: env(safe-area-inset-*)`.
- All inputs `font-size: 16px` minimum (prevents iOS zoom on focus). Weight input: `inputmode="decimal"`. Reps "Other" input: `inputmode="numeric"`.
- Tap targets ≥ 48px. No hover-only interactions.
- `sw.js`: cache-first for the app shell (html, css, js, manifest, icons) with a versioned cache name `wt-v1` — bump on every deploy and delete old caches on `activate`. **Never cache or intercept requests to `script.google.com` / `googleusercontent.com`.**
- Do not use `navigator.vibrate` (unsupported on iOS).

---

## Visual design (match the reference screenshot)
- Light, minimal: page background `#f4f4f4`, card `#fafafa` with 1px `#e2e2e2` border, radius 20px.
- Font: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Card title 24px semibold; labels 16px semibold; muted subtitle `#666`.
- Inputs/select: pill shape (radius 999px), 1px `#d6d6d6` border, 52px tall.
- Reps chips: 5-column grid, radius 10px, background `#f1f1f1`, border `#d9d9d9`; **selected** = background `#FDEBDB`, border `#F07F1E`, text `#9A4A0B` (saffron accent).
- Set number: radio row (Set 1–4 plus a small "+" to add Set 5+).
- Primary button: full width, black `#111`, white text, pill, 56px tall. Secondary: outlined.
- Support dark mode via `prefers-color-scheme: dark` (invert surfaces, keep green selection readable). Use CSS variables for all colours.
- Single column, max-width 520px, centred.

---

## Screens & flow

### 1. Home
- **Start workout** → choose day type: Push / Pull / Legs / Upper / Lower / Full body / Custom (custom = free text). Date defaults to today (editable).
- If a draft exists: banner "Resume workout — Push · 12 sets logged" with **Resume** and **Discard** (confirm with an in-page modal, never `alert/confirm`).
- If unsent workouts exist in outbox: badge "1 workout waiting to sync" + **Retry now**.
- Links: **History**, **Settings**.

### 2. Workout entry (the reference screenshot)
Header: "Workout entry", subtitle "Push day · Today".
Fields:
1. **Exercise** — select. Shows the current day type's list first, then a divider, then all other known exercises, then "+ Add new exercise…" (opens text input; new name is saved to the exercise list for that day type).
2. **Set number** — radios; auto-selects the next set for the chosen exercise (e.g. if Set 1 and 2 are logged, Set 3 is pre-selected).
3. **Reps** — chips `6 8 10 12 15 / 16 18 20 Other Failure`.
   - `Other` reveals a numeric input for reps.
   - `Failure` marks the set `toFailure = true` and reveals a numeric "Reps done" input (optional).
4. **Weight (kg)** — decimal input, step 0.5, 0 allowed (bodyweight). **Pre-fill** with the last weight used for this exercise (from this session, else from history).
5. **"Last time" hint** under the exercise select: e.g. `Last: 14 Oct · 40 kg × 10, 40 × 10, 42.5 × 8` (from local history). Hide if none.
6. Primary button **Save set** — validates (exercise + reps or failure + weight required), appends to the draft, keeps exercise + weight, advances set number, clears reps selection, starts the rest timer, shows a toast "Set 2 saved".

Below the form:
- **Rest timer** strip (appears after saving a set): counts down from default (Settings, 90s), buttons −15s / +15s / Skip. Visual only; turns green at 0.
- **Logged this workout** — sets grouped by exercise, each row `Set 2 · 10 reps · 40 kg` with edit (re-opens values in the form) and delete (in-page confirm).
- Secondary button **Finish workout** → Review.

### 3. Review & submit
- Summary: day type, date, duration (first set → now), per exercise: sets, best set, total volume (Σ reps × weight). Workout totals: sets, volume.
- Optional **Notes** textarea for the whole session.
- **Submit workout** → sends to Google Sheet (see API). States: sending… / ✅ Saved to Sheet (n rows) / ⚠️ Offline — saved, will sync automatically.
- On success OR on queueing: move session into local **history**, clear draft, return Home.
- **Back to editing** link.

### 4. History
- List of past sessions (newest first): date, day type, sets, volume, sync status (✅ synced / ⏳ pending).
- Tap → details read-only.
- Button **Sync history from Sheet** (GET `action=history`) to rebuild local history on a new phone.

### 5. Settings
- Apps Script web app URL (text), Secret token (password field, show/hide).
- **Test connection** (GET `action=ping`) → shows OK / error message.
- Default rest seconds (number).
- **Manage exercises**: per day type, list with rename / delete / reorder (up/down buttons) / add.
- **Export local data** (download JSON) and **Import** (upload JSON) for backup.
- App version string.

---

## Data model (localStorage, all reads/writes wrapped in try/catch)
Keys, prefixed `wt.`:
- `wt.settings` → `{ scriptUrl, token, restSeconds: 90 }`
- `wt.exercises` → `{ "Push": ["Machine chest press", ...], "Pull": [...], ... }`
- `wt.draft` → current Session or null
- `wt.outbox` → Session[] awaiting upload
- `wt.history` → Session[] (keep last 200 sessions)

```js
Session = {
  id: "uuid (crypto.randomUUID)",
  date: "YYYY-MM-DD",          // local date
  dayType: "Push",
  startedAt: "ISO", finishedAt: "ISO|null",
  notes: "",
  synced: false,
  sets: [Set]
}
Set = {
  id: "uuid",
  exercise: "Machine chest press",
  setNo: 2,
  reps: 10,            // number, or null if failure with no count
  toFailure: false,
  weightKg: 40,
  loggedAt: "ISO"
}
```
Save the draft to localStorage **after every change** so killing Safari loses nothing.

### Default exercise lists
- **Push:** Machine chest press, Barbell bench press, Incline dumbbell press, Seated shoulder press, Lateral raise, Cable fly, Triceps pushdown, Overhead triceps extension
- **Pull:** Lat pulldown, Seated cable row, Pull-up, Barbell row, Face pull, Rear delt fly, Barbell curl, Hammer curl
- **Legs:** Back squat, Leg press, Romanian deadlift, Leg extension, Lying leg curl, Walking lunge, Standing calf raise, Hip thrust
- **Upper / Lower / Full body:** start empty; dropdown shows all known exercises.

---

## API contract (app ⇄ Apps Script)

**Important CORS rule:** send POST with header `Content-Type: text/plain;charset=utf-8` and a JSON string body. This avoids a CORS preflight, which Apps Script cannot answer. Use `redirect: "follow"`. Do not set any other headers.

### POST `{scriptUrl}` — submit workout
Body:
```json
{ "token": "...", "action": "submit", "session": { ...Session } }
```
Response: `{ "ok": true, "rows": 14, "duplicate": false }` or `{ "ok": false, "error": "..." }`.

### GET `{scriptUrl}?action=ping&token=...` → `{ "ok": true, "sheet": "Log" }`
### GET `{scriptUrl}?action=history&token=...&days=120` → `{ "ok": true, "sessions": [Session...] }` (rebuilt by grouping rows by Session ID)

### Outbox / retry logic
- On submit: push session to `wt.outbox` first, then attempt upload.
- On success: remove from outbox, mark `synced: true` in history.
- Retry the outbox on app load, on `window` `online` event, on `visibilitychange` → visible, and via **Retry now**.
- Timeout each request at 15s (`AbortController`).
- Server is idempotent by Session ID, so retries never create duplicate rows.

---

## apps-script/Code.gs (write complete, commented code)
Requirements:
- Sheet tab `Log` (create with headers if missing, freeze header row, bold):
  `Timestamp | Date | Session ID | Day | Exercise | Set # | Reps | To failure | Weight (kg) | Volume (kg) | Session notes`
- Token check against Script Property `TOKEN` (`PropertiesService.getScriptProperties()`); reject with `{ok:false,error:"unauthorized"}`.
- `doPost(e)`: parse `e.postData.contents`; `LockService.getScriptLock().waitLock(20000)`; if Session ID already present in column C → return `{ok:true, duplicate:true, rows:0}`; else build all rows and write with a single `setValues` call (not per-row `appendRow`). Volume = reps × weight (0 if reps null). Session notes only on the first row of the session. Release lock in `finally`.
- `doGet(e)`: `action=ping` and `action=history` as above.
- Always return `ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)`.
- Include a `setup()` function I can run once from the editor that creates the `Log` sheet and logs instructions to set the TOKEN property.

---

## README content (write README.md with these steps, in plain language)
1. **Google Sheet:** create a new Sheet → Extensions → Apps Script → replace code with `apps-script/Code.gs` → Save → run `setup()` once and approve permissions.
2. Project Settings (gear) → Script Properties → add `TOKEN` = a long random string.
3. Deploy → New deployment → type **Web app** → Execute as **Me** → Who has access **Anyone** → Deploy → copy the `/exec` URL.
   - Code changes later: Deploy → Manage deployments → Edit → Version: **New version** (URL stays the same).
4. **GitHub:** create a public repo (e.g. `workout`), push these files, Settings → Pages → Deploy from branch `main` / root.
5. **iPhone:** open `https://<user>.github.io/workout/` in **Safari** → Share → **Add to Home Screen**.
6. Open the app → Settings → paste URL + token → **Test connection**.
7. Updating the app: change files, bump `CACHE_VERSION` in `sw.js`, push; reopen the app twice to load the new version.

Local testing on Windows: `npx serve .` (or `python -m http.server 8000`) then open `http://localhost:8000`.

---

## Coding rules
- Vanilla ES2020, no dependencies, no build tools. Code split into small functions; one `state` object; re-render sections from state.
- Never use `alert`, `confirm`, `prompt` — use in-page modals and toasts.
- Escape all user text before inserting into HTML (or use `textContent`).
- Accessibility: real `<label>`s, radio groups via `<fieldset>`/`<legend>`, chips as `<button aria-pressed>`.
- Keep total app JS reasonably small and readable; comment non-obvious logic (outbox, idempotency, SW caching).

## Build order
1. Static UI for Workout entry matching the screenshot + draft saving.
2. Home, Review, History, Settings screens.
3. `Code.gs` + submit/outbox/ping/history.
4. Manifest, icons, service worker.
5. README.

## Acceptance checklist (verify before saying done)
- [ ] Log 3 exercises × 3 sets, close the tab, reopen → draft resumes intact.
- [ ] Set number auto-advances; weight pre-fills; "Last time" hint shows after one submitted workout.
- [ ] Other and Failure chips behave as specified.
- [ ] Submit with wrong token → clear error, workout stays in outbox.
- [ ] Submit offline (DevTools offline) → queued; go online → syncs automatically; submitting the same session twice creates no duplicate rows.
- [ ] Rows in Sheet match columns above; volume correct.
- [ ] Lighthouse/DevTools: manifest valid, SW registered, app works offline after first load.
- [ ] Layout correct at 375px width, light and dark mode, no horizontal scroll.
- [ ] No secrets committed (`git grep -i token` shows only code, no values).

---

## Owner's decisions (2026-10-14, after the spec above)

1. **Day types and default exercises follow the owner's six-day plan**, not the generic Push/Pull/Legs lists in
   "Default exercise lists" above. Day types: Push A, Pull A, Legs A, Push B, Pull B, Legs B, Custom. Day 7
   (active recovery: walk + mobility) is not a lifting day and has no day type. Cardio lines from the plan are
   kept as a per-day "After lifting" note, not as exercises.
2. **Each exercise carries its planned sets × reps** (e.g. "3 × 6-8"), shown as "Plan: …" under the exercise
   select. Stored in `wt.targets` as `{ day: { exercise: "3 × 6-8" } }`; the per-day cardio note in `wt.cardio`.
   `wt.exercises` keeps the spec's shape (`{ day: [names] }`).
3. **Exercise names are editable from Settings → Exercises** (rename, plan text, reorder, remove, add).
   A rename applies to every day the exercise appears in and to the draft, outbox and local history, so the
   "Last time" hint and weight pre-fill keep working. Rows already in the Sheet keep the old name.
4. **Brand (revision of 2026-10-14):** the app is Bhimlekha; saffron replaces the green accent everywhere,
   including the rest timer at 0 and success toasts (error toasts are ink). The owner supplied `icons/icon.svg`;
   the three PNGs are straight Chromium renders of that SVG at 180, 192 and 512 px, not redrawn.
5. Toasts: saffron for good news, ink for validation and failures (`toast(message, 'error')`).
6. **Reps buttons are the even numbers between 5 and 15** (6, 8, 10, 12, 14) followed by Other (any number)
   and Failure. The list of numbers is editable in Settings → Logging ("Reps buttons", stored in
   `wt.settings.repsChips`).
7. **End of workout** (Review screen): average heart rate (bpm), active calories (kcal), a satisfaction matrix
   of 1–5 per question (default questions Energy, Strength, Focus, Pump, Enjoyment; editable in Settings,
   stored in `wt.settings.questions`) and an overall score out of 10. Stored on the Session as `avgHeartRate`,
   `activeCalories`, `satisfaction: { question: 1–5 }`, `score`; saved to the draft on every change.
8. **Sheet columns** gained `Avg HR (bpm) | Active kcal | Score /10 | Satisfaction` (first row of a session
   only; satisfaction as "Energy 4 · Strength 5" text so questions can change freely). `Code.gs` fills missing
   header cells on an existing Log tab by itself (`ensureHeaders_`), so a column addition only needs the new
   code pasted and a new deployment version. Exercise, reps and question edits never need a Sheet change.

## Owner's decisions (2026-10-22, v1.1: progress, body, photos)

9. **Files:** `progress.js` (pure progression/analysis engine, also `require`-able in Node), `charts.js` (SVG line
   charts), `vault.js` (encrypted photo vault), `track.js` (Progress, Body, Photos screens; its handlers are merged
   into app.js's tables). Load order in index.html: progress, charts, vault, track, app. All are in sw.js SHELL.
10. **Sets** gain `rir` (0–3, 3 = "3+"; failure ⇒ 0; null when unknown) and `warmup`. RIR is required on working
    sets unless Settings turns it off. Log columns 16–17: `RIR | Warm-up`.
11. **Double progression per exercise.** Rep range = the exercise's plan text ("3 × 8-12"; timed plans are not
    tracked). Ready = every planned set ≥ top − tolerance with RIR ≥ readyRir, in `readySessions` sessions in a
    row whose first and last are ≥ `readyMinDays` apart (the "week timer"). Then suggest +stepUpper/+stepLower
    (lower = muscle group in legs/glutes/calves/lower back, else day name has "Leg") or the exercise's own step.
    After an increase, `watchDays` of watching that reps stay ≥ range min. All thresholds live in
    `settings.progression` (defaults `Progress.PROGRESSION_DEFAULTS`), editable in Settings → Progression.
12. **Verdict** (Improved/Maintained/Dropped, band ±maintainBand %): same weight → total reps change; weight
    changed → change in `perf` = mean Epley e1RM over working sets. Best-set e1RM was rejected because it stays
    flat during rep progression (12-10-8 → 12-11-9 read as 0%). Charts' "Strength" metric is `perf` too.
13. **Measurements**: `wt.measurements` + `wt.mOutbox`; kinds `checkin` and `weighin`; fields editable
    (`settings.measureFields`, unit in brackets, the one containing "weight" is bodyweight). Sheet tab
    `Measurements` with dynamic field columns; POST `action=measure` (idempotent by Entry ID), GET
    `action=measurements`. Check-in day `settings.checkinDay` (0 = Sunday) drives a home banner.
14. **Photos never leave the phone unencrypted** and never touch GitHub or Google. IndexedDB `bhimlekha-vault`;
    PBKDF2-SHA-256 600k → AES-256-GCM; meta, thumbnail and image encrypted separately. Vault locks on leaving
    the Photos screen, on `visibilitychange` hidden, and after `autoLockMinutes` idle. Backup = `.bhimvault`
    binary of the already-encrypted records, shared via the Web Share sheet (owner saves to iCloud Drive); a
    web app cannot write to Files without a tap, so a home banner nags until `lastBackupAt ≥ lastPhotoAt`.
    (v1.4 relaxes this: see 18. The week folders are readable JPEGs, by the owner's choice.)
15. **Sync from Sheet** keeps the local copy of a workout already on the phone (it can hold more detail).
16. **v1.2 (2026-10-22): per-set line above Save set** (`Progress.setComparison`): the set being entered vs the
    same set number last time (weight ± kg, reps ±), live as reps/weight change. ⚠️ Shortfall when this set has
    been below its earlier best level (Epley e1RM) for ≥ `shortfallDays` (14); ⚠️ Stagnant when no new best for
    > `stagnantDays` (30) over ≥ 3 sessions, except a set already at the top of its rep range (shown as ℹ️
    instead: it can only move when the weight goes up). The lighter-week (recovery) alert shows on Home and in
    the post-workout insight as well as on Progress.
17. **v1.3 (2026-10-22): recovery alert with four triggers** (`settings.recovery`, defaults
    `Progress.RECOVERY_DEFAULTS`, each switchable/editable in Settings → Recovery; any one fires it):
    A every 8 weeks since the last lighter week (or first workout); B overall strength (`Progress.weeklyStrength`:
    per Monday-week, each exercise's mean perf vs its own previous 4 weeks, averaged) below −1% for 2 consecutive
    recent weeks; C ≥ 3 exercises flagged dropping; D Energy+Strength ratings averaging ≤ 2.5 over the last 3 rated
    workouts. Home always shows the countdown ("Next lighter week: date · in N weeks · last one …") or the alert
    (Start lighter week / Not now = snooze 3 days). A lighter week is a window in `settings.deloads` (7 days); its
    workouts are excluded everywhere via `statsHistory()` (no comparisons, no warnings, no add-weight banner).
    Ending on the start day undoes it; otherwise it ends yesterday. `progression.deloadWeeks` (v1.1) migrates to
    `recovery.schedWeeks`. Shortfall (red) and stagnant (amber) lines above Save set are tinted and lead with the
    key number.
18. **v1.4 (2026-10-22): Face ID and week folders.**
    - **Face ID** = a platform passkey with the WebAuthn **PRF** extension (iOS 18+). The PRF output → HKDF →
      AES key that encrypts the 32 raw vault-key bytes, stored as `meta.faceId { credId, prfSalt, wrapped }`.
      The raw key is kept in memory only while unlocked (`deriveRaw`, same key as before). If the phone makes the
      passkey without returning the secret, a second tap ("Confirm with Face ID") fetches it. No PRF → the card
      says iOS 18 is needed; there is no non-cryptographic "gate" fallback. Changing the passcode drops
      `faceId`. WebAuthn calls must be the first thing a tap does; `faceIdBusy` stops the lock-on-hide meanwhile.
    - **Week folders** (owner chose readable JPEGs and Week 1 = first workout's week): weeks end on
      `checkinDay` (Sunday → Mon–Sun), Week 1 = week of `settings.programStart` or else the first logged
      workout. Folder "Week 3 - 19 Oct to 25 Oct 2026", file "Week-3 Back.jpg" (pose from settings; `\/:*?"<>|`
      → "-"; duplicates " (2)"). *Save Week N to Files* shares "<folder>.zip" (stored zip, built by
      `Vault.exportWeek` before the tap) holding that one folder; Files unpacks it on a tap. Saved state:
      `vaultInfo.weeksChanged` / `weeksSaved` keyed by folder name (renaming settings makes all weeks unsaved);
      Home banner lists unsaved weeks. The `.bhimvault` backup stays for restoring on a new phone.
    - The file inputs live in `#pickers` in index.html (outside `#app`), because a background re-render while
      the iPhone camera was open replaced the input and lost the photo. Dialogs (`.modal`, z 48) now sit above
      the photo viewer (45); before this, Delete in the viewer could not be confirmed.
19. **v1.5 (2026-10-22): schedule, missed days, settings copy, weekly summary, week comparison.**
    - **Schedule** `settings.schedule` (weekday → day type, '' = rest; owner: Mon Push A … Sat Legs B, Sun rest).
      Home pre-selects the date's scheduled day until the owner picks one (`ui.startPicked`).
    - **Missed** (owner's rule: never made up, never swapped): `detectMissed()` marks each scheduled day from
      `settings.scheduleFrom` (first v1.5 run; no back-fill; capped 60 days) to yesterday with no workout that
      date. Id `missed-YYYY-MM-DD`. A workout logged later for that date takes the mark back (row deleted in the
      Sheet). Home asks for a reason (`settings.missReasons`, editable; "Other" = own words + note); History
      lists them. Sheet tab **Missed** (Timestamp, Date, Weekday, Day, Reason, Note, Entry ID), upserted by
      Entry ID via `wt.missedOutbox`, for the owner's dashboard.
    - **Pause**: each missed day subtracts `progression.missedPauseDays` (7) from the shortfall, stagnant and
      watch clocks of the exercises planned on that day (`missedPause` → `pause`/`pauseFor` in progress.js);
      the scheduled lighter week moves back `missedSchedDays` (1) per missed day. Comparisons already use the
      last workout done. `neglectDays` (7) flags planned muscle groups on Home.
    - **Settings copy**: Sheet tab **Settings**, one row (Saved at, JSON of settings minus URL/token +
      exercises/targets/cardio). `save()` of those keys → upload 3 s later (`wt.backup`). A phone links once:
      empty tab → upload; a copy there → ask (Settings or after Test connection), never overwrite silently.
      Restoring sets `scheduleFrom` = today (the new phone lacks old workouts) and fetches the Missed tab.
    - **Weekly summary** (`weekSummary`, weeks = photo-folder weeks): Home on the check-in day and the day after;
      Progress has a picker back to the first workout.
    - **Small workout** (v1.5.1, Sheet in v1.6): Body card between the weekly check-in and the daily weigh-in.
      Check in = { date, time (default now, editable), optional note } in `wt.small`; edit (✎) and delete
      upsert/delete the row in the Sheet tab **Small workouts** (Timestamp, Date, Time, Notes, Entry ID) via
      `wt.smallOutbox`. Not a workout: it never affects missed days or progress. Fetched back with Sync history
      and on a settings restore.
    - **Compare weeks**: two week pickers (default first vs latest), every pose side by side (thumbnails); a
      pose with both photos opens a full-screen slider (after-photo clipped over the before-photo).

## Owner's decisions (2026-10-24, v1.7: closing a workout, calories, body fat, recovery)

20. **Finish closes the workout.** `finishedAt` is set on the Finish tap (the clock stops; Duration = first set →
    finish, Log column 18 `Duration (min)`); a finished draft redirects Entry → Review; *Reopen* clears it after a
    confirm. Required before Submit (`reviewMissing`): score 1–10 ("How was the workout?"), avg HR 40–220 and active
    kcal 1–3000, unless "The watch did not record this workout" (`session.noWatch`). The 1–5 matrix stays optional.
21. **No food logging** (MyFitnessPal does that). `body.js` (pure, Node-testable, wrapped in an IIFE because
    progress.js shares the global scope) holds the maths. Profile `settings.profile {sex, dob, heightCm}`;
    `settings.calories` (defaults `Body.CALORIE_DEFAULTS`). BMR: Katch-McArdle with body fat ≤ `bfMaxAgeDays` old,
    else Mifflin-St Jeor; TDEE = BMR × `lifeFactor` + logged workout kcal/day over `workoutDays` less
    `watchDiscountPct`; target = TDEE ∓ `ratePct`% bodyweight × 7700 / 7, floored at BMR (`floorBmr`, else 1,200).
    Weight = mean of ≥ 3 entries in 7 days, else the latest. The MyFitnessPal number is `settings.calorieLock`; it
    moves (`Body.shouldUpdateTarget`) on the first calculation, a newer body fat date, ≥ `recalcKg` (5) weight change,
    or after ≥ 7 days when it differs by ≥ `changeKcal` (100); settings changes apply at once. A move shows a Home
    banner until "Done, it is in MyFitnessPal".
22. **Body fat**: US Navy, metric. Owner's definitions: **Abdomen = at the navel** (used for men), **Waist = where the
    waistband sits** (used for women with hips). Fields found by name (`Body.navyFields`); "Abdomen (cm)" was added
    once after Waist (`settings.abdomenAdded`). A check-in stores `Body fat (%, Navy)` in its values for the Sheet;
    the app recalculates from the tape numbers for charts.
23. **Recovery score** (`settings.recoveryScore`, defaults `Body.RECOVERY_SCORE_DEFAULTS`): an iPhone Shortcut
    automation POSTs a flat body `{token, action:'recovery', sleep:'start|end;…', rhr, hrv}` (Code.gs merges
    overlapping sleep spans and averages numbers in text); the app adds soreness (1–10, required on the Home
    morning card) and the optional Watch sleep score. Sheet tab **Recovery**, one row per date, each writer fills
    only its cells. Parts 0–100: sleep (hours vs target, −25/h short; averaged with sleep score), HRV and RHR as
    20 points per SD from the last `baselineDays` (needs `minBaseline` days; SD floor 5% of mean), soreness linear;
    weighted and rescaled over what is present. Bands green ≥ 70, amber ≥ 40, red. Advice only.
