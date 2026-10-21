<!-- Generated: 2026-10-16 | Files scanned: 44 | Token estimate: ~520 -->
# Frontend — Pacebook

Single-page app served as static HTML, no framework, no build step. `public/index.html` is the shell; `public/app.js` (3448 lines) holds nearly all logic.

## Page tree

```
public/index.html .......... main app shell (tabs below), loads config.js → auth.js → app.js → coach.js
public/404.html
public/cgu.html, confidentialite.html, cookies.html, mentions-legales.html, contact.html
  (legal pages, share legal.css/legal.js, pull EDITEUR_* fields from config.js)
```

## Tab structure (index.html, single page, role="tab"/role="tabpanel")

```
#tab-semaine  → #p-semaine   Semaine (today/this week's sessions, default tab)
#tab-plan     → #p-plan      Plan (full multi-week plan)
#tab-suivi    → #p-suivi     Suivi (log: weight, sleep, fatigue, done/skipped)
#tab-profil   → #p-profil    Profil (wizard + full settings form)
#tab-reperes  → #p-reperes   Repères (zones, stats, imports)
#tab-coach    → #p-coach     Coach (hidden unless CHAT_WEBHOOK_URL configured)
```

## app.js — major logic groups (by line range)

```
1–45     date/iso helpers, dynamic text (dynApply)
46–345   IMP14: Apple Health / Polar Flow import parser (also tested standalone via tests/import-pure.js, delimited by /*PURE14:start*//*PURE14:end*/)
345–560  pace/VMA/HR zone math, session-block constructors (S, easyRun, longRun, quality…)
558–1270 plan builders: buildPlan → buildPlanRun/buildSportPlan → buildWeek/endWeek/forceWeek (per-sport: course/trail/vtt/force/forme)
1294–1770 render pipeline: recompute() → renderSummary/renderWeek/renderPlan/renderZones/renderChart/renderLog/renderAdvice
1744–2420 form I/O (fillForm/readForm/valid), session move/drag-and-drop, timer sheet, ICS/zip export, news banner
2419–2870 "14-day" feature set: feel-after-session (RPE/mood/pain), stats sheets, sport-specific UI (wzSport*, fillSObj)
2907–3448 persistence: persistLocal/persist/flush (Supabase sync), loadState, account UI (renderAcct/openAccount), wizard (wz*)
```

## State management

No framework store — a single mutable `state` object (profile, log, moves, done, feel, deleted, seen, week) plus module-level `plan`/`P`/`E` derived caches recomputed by `recompute()`. Persistence is manual:
- `persistLocal()` → `localStorage` (debounced, always)
- `persist()` → marks dirty, debounced `flush()` → Supabase `UPDATE user_data` (only if signed in + consented)
- `loadState(d)` → merges local and remote docs on load/sign-in, using per-field "last write wins" via timestamps (`mergeStamped`)

## Key files
- `public/app.js` (3448 lines) — plan generation, rendering, state, persistence
- `public/auth.js` (111 lines) — Supabase account layer (see backend.md)
- `public/coach.js` (179 lines) — Coach tab UI + webhook client (see backend.md)
- `public/config.js` (31 lines) — all runtime config (Supabase keys, webhook URL, legal fields) — no secrets
- `public/legal.js` (17 lines) — renders `LEGAL` fields from config.js into legal pages
- `public/app.css`, `public/legal.css` — all styling, no CSS framework
- `public/index.html` (365 lines) — app shell/markup for all tabs

## Notable constraints
- CSP is `script-src 'self'` with no inline scripts anywhere — all behavior lives in the external `.js` files above.
- Supabase JS client is vendored at `public/vendor/supabase-<version>.js` and lazy-loaded only when a session exists or on OAuth return (see `tools/update-vendor.sh`).
