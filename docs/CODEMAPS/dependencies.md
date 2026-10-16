<!-- Generated: 2026-10-16 | Files scanned: 44 | Token estimate: ~380 -->
# Dependencies — Carnet de course

No root `package.json` — the deployed site has **zero npm dependencies**. All "dependencies" below are either vendored static files or external HTTPS services, each opt-in via `public/config.js`.

## External services

- **Supabase** (Postgres + Auth, hosted, EU/Frankfurt per config.js) — account storage, OAuth, RLS. Required for any account features; app runs fully guest/local without it.
- **Vercel** — static hosting + edge headers (`vercel.json`), `buildCommand: node tests/static-checks.js` gates deploys on the static checks passing.
- **n8n** (self-hosted, not bundled) — optional workflow engine for the Coach webhook. Config: `CHAT_WEBHOOK_URL`.
- **Anthropic Claude API** (`claude-sonnet-5-5`) — called only from inside the n8n workflow (`nodes/control.js`), never from the browser; API key lives in n8n credentials, never in this repo.
- OAuth providers (Google, GitHub, optionally Azure/Apple) — configured in Supabase Auth, selected via `config.js PROVIDERS`.

## Vendored (same-origin, no CDN)

- `public/vendor/supabase-<version>.js` — supabase-js, pinned version, fingerprint-checked on update via `tools/update-vendor.sh`. Loaded lazily by `auth.js` only when a session exists or on OAuth return — never a third-party script load at runtime.

## Dev/test tooling (not shipped to production)

- `playwright` — used by most `tests/*.js` (browser-driven E2E: `cmp.js`, `coach.js`, `flows.js`, `pages.js`, `sheets.js`, `smoke.js`, `v14.js`, `vendor.js`, `wiz-regression.js`, `profil15.js`). No package.json pins a version — expected to be globally available or installed ad hoc.
- Plain Node (`fs`, `http`, `vm`, `child_process`) — `tests/static-checks.js`, `tests/n8n.js`, `tests/import-pure.js`, `tests/lib.js` run with no external deps.
- `integrations/n8n/mcp-server/` has its own `package.json` (separate, minimal) for the MCP stdio server — check that file directly for its exact deps.

## Build/config propagation chain

```
public/config.js (SUPABASE_URL, CHAT_WEBHOOK_URL)
  └─ tools/set-csp.js → writes matching CSP into vercel.json, public/_headers, and every HTML <meta> tag
  └─ integrations/n8n/build-workflow.js → splices public/coach.js safety rules into integrations/n8n/workflow-coach.json
```
Run both generator scripts after editing their respective sources; `tests/static-checks.js` (run on every Vercel build) fails the deploy if CSP is out of sync.
