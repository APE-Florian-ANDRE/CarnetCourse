<!-- Generated: 2026-10-16 | Files scanned: 44 | Token estimate: ~480 -->
# Backend — Carnet de course

No traditional app server. "Backend" = Supabase (DB + Auth, via REST/RPC called directly from the browser) plus an optional n8n workflow acting as a thin proxy to Claude.

## Supabase calls (from public/auth.js, public/app.js)

```
auth.signInWithOAuth(provider) → Supabase Auth (PKCE) → redirect back to site origin
auth.getSession() → session/user/JWT
SELECT consent FROM user_data WHERE user_id=uid (auth.js connect())
UPSERT user_data(user_id, consent) ON CONFLICT user_id (auth.js saveConsent()) — only call that CREATES the row
UPDATE user_data SET doc=... WHERE user_id=uid (auth.js docRef().set(), called by app.js flush()) — never creates a row
DELETE FROM user_data WHERE user_id=uid (auth.js withdrawConsent())
RPC delete_my_account() (auth.js deleteAccount()) → deletes auth.users row, cascades to user_data
```
All reads/writes are RLS-scoped to `user_id = auth.uid()`; anonymous Supabase sign-ins are explicitly rejected in every policy.

## n8n Coach webhook (integrations/n8n/workflow-coach.json, generated)

```
POST <CHAT_WEBHOOK_URL>  (public/coach.js callHook())
  └─ Webhook (n8n)
       → Préparer (nodes/prepare.js): validates body shape, extracts Bearer JWT, caps message sizes
       → [status===200?] → Vérifier le jeton Supabase: GET {SUPABASE_URL}/auth/v1/user with the user's JWT
       → Contrôle et limite (nodes/control.js): checks age≥18, re-runs client safety regexes, per-user rate limit (20/h)
       → [autorisé && !skipAI?] → Claude: POST https://api.anthropic.com/v1/messages (model claude-sonnet-5-5, max_tokens 700)
       → Réponse (nodes/reply.js): strips control chars, honors a [[drapeau:...]] safety flag from the model, truncates to 4000 chars
       → Répondre (respondToWebhook) → { reply: "..." } back to browser
```
Source of truth for the safety regex list and generated workflow is `build-workflow.js`, which splices `public/coach.js`'s `RULES`/`guard()` into the n8n Code nodes at generation time — edit the client file, then re-run `node integrations/n8n/build-workflow.js`.

## MCP server (integrations/n8n/mcp-server/server.js)

Read-only stdio MCP server, separate from the webhook flow. Exposes 3 tools, each scoped by the caller-supplied `USER_JWT` (RLS enforced by Supabase, not by this code):
```
lire_profil   → GET {SUPABASE_URL}/rest/v1/user_data?select=doc  → profile fields only
lire_suivi    → ... → last 12 weekly log entries
lire_ressenti → ... → last 20 post-session feelings (no free-text notes)
```
Never issues writes (enforced by `tests/n8n.js`).

## Key files
- `public/auth.js` (111 lines) — Supabase client adapter, session, consent, docRef
- `public/coach.js` (179 lines) — webhook client, safety guard, consent, chat UI wiring
- `integrations/n8n/build-workflow.js` (32 lines) — generates `workflow-coach.json` from `nodes/*.js` + `system-prompt.txt`
- `integrations/n8n/nodes/{prepare,control,reply,safe-msgs}.js` — n8n Code-node bodies (spliced, not run directly)
- `integrations/n8n/mcp-server/server.js` (48 lines) — read-only MCP tool server
- `supabase/schema.sql` (102 lines) — table, RLS policies, RPC functions

## Dependencies
- Supabase (Postgres, Auth, RLS) — primary data store, region UE/Francfort per config.js
- n8n (self-hosted workflow engine) — optional webhook proxy
- Anthropic Claude API (`claude-sonnet-5-5`) — called only from within n8n, never from the browser
