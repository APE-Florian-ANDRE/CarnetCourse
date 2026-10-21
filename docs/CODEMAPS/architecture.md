<!-- Generated: 2026-10-16 | Files scanned: 44 | Token estimate: ~550 -->
# Architecture — Pacebook

Static, no-build, vanilla-JS training-log site. No framework, no bundler, no root package.json.
Local-first: fully usable as a guest (localStorage only); Supabase account sync and an n8n/Claude coach are optional, config-gated add-ons.

## System diagram

```
Browser (public/*.html, app.js, auth.js, coach.js)
   │
   ├─ localStorage ............... always-on local save (guest mode, offline-capable)
   │
   ├─ Supabase (Postgres + Auth) .. optional account sync, gated by config.js SUPABASE_URL/ANON_KEY
   │     table public.user_data: one row per user, RLS-enforced, doc(jsonb) + consent(jsonb)
   │
   └─ n8n webhook (HTTPS) ......... optional "Coach" tab, gated by config.js CHAT_WEBHOOK_URL
         Webhook → Préparer → [valid?] → Vérifier le jeton Supabase → Contrôle et limite
                 → [autorisé?] → Claude (Anthropic API) → Réponse → Répond au navigateur

Deploy: Vercel static hosting (public/ = outputDirectory), buildCommand runs tests/static-checks.js
```

## Service boundaries

- **Frontend** (`public/`): all app logic, no server-side rendering. See frontend.md
- **Data store** (`supabase/schema.sql`): single `user_data` table, RLS policies, SQL functions for account deletion/inactivity purge. See data.md
- **Coach integration** (`integrations/n8n/`): generates a self-hosted n8n workflow JSON that proxies chat to Claude with auth/rate-limit/safety gating. Entirely optional — hidden if `CHAT_WEBHOOK_URL` is empty.
- **Build/ops tooling** (`tools/`): `set-csp.js` keeps CSP in sync across `vercel.json`, `public/_headers`, and HTML meta tags from the single source `config.js`.

## Data flow (guest vs. account)

1. Guest: profile/log/plan state lives only in `localStorage` (`public/app.js` `persist()`/`loadLocal()`).
2. Signed in: `auth.js` loads Supabase JS (vendored, same-origin) only when a session exists; `app.js` syncs the same local doc to `user_data.doc` (debounced `flush()`), bounded by `doc_max_size` (1.5 MB).
3. Coach (if configured): `coach.js` sends only the last few chat turns + optional profile/feel/stats summary (never raw health notes) to the n8n webhook, with the Supabase access token for server-side identity check.

## Key cross-cutting concerns

- **CSP/security**: single source of truth in `config.js`, propagated by `node tools/set-csp.js`; verified by `tests/static-checks.js`.
- **Safety filters** (self-harm/medical-emergency/disordered-eating phrase detection) are duplicated by design in both `public/coach.js` (client) and `integrations/n8n/nodes/*.js` (server) — n8n's `build-workflow.js` copies the client regex block verbatim as the single source.
- **Privacy/consent**: distinct, versioned consent flows for account/health data (`auth.js`) and coach data sharing (`coach.js`) — both required before any network send.

See frontend.md, backend.md, data.md, dependencies.md for details.
