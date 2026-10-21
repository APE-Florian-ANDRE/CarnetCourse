<!-- Generated: 2026-10-16 | Files scanned: 44 | Token estimate: ~430 -->
# Data — Pacebook

Single Postgres table in Supabase (`supabase/schema.sql`, 102 lines). No migration history/tooling — one hand-maintained SQL file, run manually in the Supabase SQL Editor.

## Table: public.user_data

```sql
user_id    uuid primary key references auth.users(id) on delete cascade  -- account deleted ⇒ row deleted
doc        jsonb not null default '{}'  -- the whole local "carnet" state, mirrors the client's `state` object
consent    jsonb                        -- {cgu, privacy, terms, health, age15, at} — all required to be truthy/dated
updated_at timestamptz not null default now()  -- server-set via trigger, client cannot forge it
```
Constraints: `doc` must be a JSON object ≤ 1.5 MB; `consent` (if present) must be an object ≤ 1000 bytes with all required keys set and ISO dates for `cgu`/`privacy`.

## `doc` shape (client-defined, not schema-enforced — see public/app.js dataOut()/loadState())

```json
{
  "profile": { "sport": "course|trail|vtt|force|forme", "niveau": "deb|int|conf", "objectif": "...", "seances": 4,
               "start": "2026-01-05", "raceDate": "2026-12-13", "age": 35, "poids": "80" },
  "log":     [ { "date": "2026-09-27", "poids": 81, "sommeil": 7, "fatigue": 2, "at": 1700000000000 } ],
  "done":    { "<weekKey>": { "at": 1700000000000 } },
  "feel":    { "2026-09-27": { "rpe": 7, "mood": 4, "pain": 0, "sig": "...", "at": 1700000000000 } },
  "moves":   { }, "deleted": { },
  "week": 2, "seen": 13, "appliedByDate": { }
}
```
Every sub-object uses a per-entry `at` (epoch ms) timestamp for last-write-wins merge across devices (`mergeStamped` in app.js). No server-side validation of this inner shape — only overall size/type is enforced by the DB constraint.

## RLS policies (table: public.user_data)

```
anon:          no access (revoked entirely)
authenticated: select/delete own row only, and only if NOT is_anonymous
               insert own row only if consent IS NOT NULL (client never auto-creates the row)
               update own row only if existing row already has consent IS NOT NULL
```

## Functions

```
delete_my_account()                 security definer, auth.uid()-scoped, deletes auth.users row → cascades
purge_inactive_accounts(months=24)  security definer, callable only by postgres/cron role, not by any client;
                                     inactive = no sign-in/session-refresh/doc-update within N months
```
Scheduled via commented-out `pg_cron` call (`select cron.schedule('purge-comptes-inactifs', '0 3 * * 0', ...)`) — not active by default, must be opted into per deployment.

## Relationships
`user_data.user_id` → `auth.users.id` (Supabase-managed), 1:1, cascade delete. No other tables.
