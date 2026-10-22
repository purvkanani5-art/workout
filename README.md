# Bhimlekha · भीमलेखा

"Bhima's record": a personal workout logger that runs as a home-screen web app on iPhone and saves every set to
a Google Sheet. No framework, no build step, nothing to install. Sets are kept as a draft on the phone while
you train; the whole workout is sent once at the end, and anything that could not be sent waits and retries by
itself.

The default day types and exercises follow my six-day plan (Push A, Pull A, Legs A, Push B, Pull B, Legs B).
Everything is editable in Settings → Exercises: rename, reorder, remove, add, and change the planned
sets × reps shown under each exercise.

## Setup

### 1. Google Sheet and script

1. Create a new Google Sheet. Give it any name.
2. In the Sheet: **Extensions → Apps Script**. Delete the sample code and paste the whole of
   `apps-script/Code.gs`. Click **Save**.
3. In the function dropdown (next to Run) choose **setup** and click **Run**. Approve the permissions the first
   time (it only touches this one Sheet). This creates the `Log` tab with its header row.
4. Click the gear icon (**Project Settings**) → **Script Properties** → **Add script property**.
   Property: `TOKEN`. Value: a long random string (a password manager can generate one). Save.
5. **Deploy → New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Description: anything.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy**, approve again if asked, and copy the **Web app URL** (it ends in `/exec`).

Later code changes: paste the new `Code.gs`, Save, then **Deploy → Manage deployments → Edit (pencil) →
Version: New version → Deploy**. The URL stays the same.

### 2. GitHub Pages

1. Create a **public** repository, for example `workout`.
2. Push all the files in this folder to it (branch `main`).
3. Repository **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`,
   folder `/ (root)`. Save. After a minute the site is at `https://<your-user>.github.io/workout/`.

There are no secrets in the repo. The script URL and token live only in the app's Settings on your phone.

### 3. iPhone

1. Open `https://<your-user>.github.io/workout/` in **Safari** (not Chrome).
2. Tap **Share → Add to Home Screen → Add**. The icon and the label "Bhimlekha" appear on the home screen.
3. Open the app → **Settings** → paste the web app URL and the token → **Test connection**.
   It should say "OK — connected to sheet Log".

## Using it

- **Home → Start workout**: pick the day, check the date, Start.
- **Workout entry**: choose the exercise, the set number is pre-selected, tap the reps, the weight is pre-filled
  from last time, **Save set**. A rest timer starts. "Plan: 3 × 6-8" is the target from your programme and
  "Last: 12 Oct · 40 kg × 10, 40 × 10" is what you did last time.
- **Finish workout → Submit workout**. Rows appear in the Sheet within a second or two. With no signal the
  workout is queued and sent the next time the app opens online.
- **History** lists past workouts. On a new phone, **Sync history from Sheet** rebuilds the list from the
  last 400 days of rows.
- **Settings → Export** saves a JSON backup (including URL and token); **Import** restores it.

### Progressive overload (Progress screen)

- Each working set gets a **reps in reserve** tap (0 = failure, 1, 2, 3+). Warm-up sets are marked and ignored.
- **Double progression**, judged per exercise: stay at one weight until every planned set reaches the top of the
  plan's rep range (1 below still counts) with at least 1 rep in reserve, in **2 sessions in a row at least
  7 days apart** (the week timer). Then the app says "Increase the weight: 40 → 42.5 kg" (+2.5 upper body,
  +5 lower body, or the exercise's own step), and watches the new weight for 7 days.
- After every workout the Review screen shows each exercise as **Improved / Maintained / Dropped**: at the
  same weight by total reps (+2 reps on 30 = +6.7%), after a weight change by estimated strength (the
  one-rep max estimate w × (1 + reps/30), averaged over the working sets). Also compared with the average of
  the last 4 sessions; ±2% counts as maintained. Stall and drop warnings, and a lighter-week suggestion every
  8 weeks.
- **Progress → exercise** has charts (strength, volume, reps per set, weight; 4 weeks / 12 weeks / all) with
  the numbers and a plain-words reading of them, plus hard sets per muscle group over the last 7 days.
- Every threshold above is editable in **Settings → Progression**; weight steps and muscle groups per
  exercise in **Settings → Exercises** (pencil).

### Body and photos

- **Body**: the weekly check-in (Sunday by default) with the measurement fields from Settings, an optional
  daily weigh-in (charted as a weekly average), trends with a fat-versus-muscle reading of weight and waist.
  Measurements go to the Sheet's **Measurements** tab.
- **Photos** are an encrypted vault on the phone only: AES-256 with a key made from your passcode, never
  uploaded, never in the Photos app. The in-app camera has a timer and overlays last week's photo to match
  the pose. **Face ID** (iOS 18+) can unlock it: a passkey in the Passwords app holds the vault key.
  A forgotten passcode cannot be recovered.
- **Schedule and missed workouts** (Settings → Schedule): Home suggests the day's workout. A scheduled day
  with no workout is marked missed (not made up); Home asks why, and it goes to the Sheet's **Missed** tab.
  Missed days pause that day's exercises' warning clocks and push the lighter week back a little.
- **Weekly summary** on Home on the check-in day and the day after, and for any week on Progress.
- **Settings copy in the Sheet** (Settings tab): saved after every change; a new phone offers to restore it
  after Test connection. Needs the v1.5 Code.gs.
- **Week folders in Files**: photos are grouped by week ("Week 3 - 19 Oct to 25 Oct 2026", weeks ending on
  the check-in day, Week 1 = the week of the first workout or the date in Settings) and named from the poses
  ("Week-3 Back"). *Save Week N to Files* shares a .zip; choose **Save to Files → iCloud Drive → Bhimlekha**,
  then tap the .zip once in Files to turn it into the week's folder. These copies are readable pictures (owner's
  choice); lock the Files app with Face ID if wanted. A web app cannot save to Files on its own, so the tap is
  needed each week; a home banner names the weeks not saved yet. *Full encrypted backup* is a separate
  passcode-encrypted file for restoring the vault on a new phone.

## Updating the app

1. Change the files and push to `main`.
2. Bump `CACHE_VERSION` in `sw.js` (e.g. `wt-v2` → `wt-v3`) in the same push, or phones keep the old files.
3. On the phone, close the app fully and open it twice: the first open fetches the new version, the second
   runs it.

## Testing on Windows

From this folder:

```
python -m http.server 8000
```

then open `http://localhost:8000`. (`npx serve .` works too.) In DevTools use the device toolbar at 375 px
wide, and the Network panel's "Offline" setting to test the outbox.

## Sheet columns

`Timestamp | Date | Session ID | Day | Exercise | Set # | Reps | To failure | Weight (kg) | Volume (kg) | Session notes | Avg HR (bpm) | Active kcal | Score /10 | Satisfaction | RIR | Warm-up`

The **Measurements** tab: `Timestamp | Date | Entry ID | Type | Notes` and then one column per measurement
field (`Bodyweight (kg)`, `Waist (cm)`, …). A field added in Settings gets its column automatically.

One row per set. Volume = reps × weight (0 when a set went to failure with no count). Notes, heart rate,
calories, the score out of 10 and the satisfaction answers ("Energy 4 · Strength 5") are on the first row of
each session only. Submitting the same session twice never adds rows: the script checks the Session ID under a
lock before writing.

## What needs a Sheet change, and what does not

- **Nothing in the Sheet changes** when you rename, add, remove or reorder exercises, change the reps buttons,
  or edit the end-of-workout questions in Settings. Those are just values in the rows. Old rows keep the names
  they were logged with.
- **Only new columns need a script update.** When a newer `Code.gs` adds a column, paste it into Apps Script
  and publish a new deployment version (Deploy → Manage deployments → Edit → New version). The script then
  fills in the missing header cells on the existing `Log` tab by itself the next time it writes; earlier rows
  stay blank in those columns.
