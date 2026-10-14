# Coach IA : n8n (et serveur MCP optionnel)

Le navigateur n'appelle **jamais** l'IA directement : il envoie les messages à un **webhook n8n** que tu héberges. n8n vérifie la personne (jeton Supabase), applique une limite de débit, appelle Claude avec **ta** clé (stockée dans n8n) et renvoie `{ "reply": "texte" }`. Aucune clé d'IA ni aucun secret n'est dans ce dépôt ni dans le navigateur.

```
Navigateur (coach.js)  --POST JSON + Authorization: Bearer <JWT Supabase>-->  Webhook n8n
   Webhook → Préparer (forme de la requête) → Vérifier le jeton (GET /auth/v1/user)
           → Contrôle et limite (20 messages/heure/utilisateur) → Claude (API Messages) → Réponse → { "reply": "..." }
```

Le site n'affiche l'onglet Coach que si `CHAT_WEBHOOK_URL` est renseignée dans `public/config.js`. Avant le premier envoi, l'utilisateur donne un **consentement séparé** (et choisit s'il joint son profil, son ressenti, ses stats : décoché par défaut).

## Pas à pas

1. **Crée ton n8n** : n8n Cloud (le plus simple) ou auto-hébergé (Docker, derrière HTTPS). Le webhook doit être en **https**.
2. **Credential Anthropic** : n8n > *Credentials* > *Create credential* > **Anthropic** > colle ta clé d'API (console.anthropic.com > API keys). Elle reste dans n8n. Ne la copie jamais ailleurs.
3. **Importe le workflow** : n8n > *Workflows* > *Import from file* > `workflow-coach.json`. Puis, dans les nœuds :
   - **Webhook** > *Options* > **Allowed Origins (CORS)** : l'adresse exacte de ton site, par exemple `https://carnet.example.org` (pas de `*`).
   - **Vérifier le jeton Supabase** : remplace l'URL par `https://<ton-projet>.supabase.co/auth/v1/user` et `apikey` par la clé **anon** (publique) de ton projet.
   - **Claude** : choisis le credential Anthropic créé à l'étape 2.
   - **Contrôle et limite** : `MODEL` (modèle Claude) et `LIMIT` (messages par heure et par personne) en tête du code.
4. **Active** le workflow (interrupteur *Active*). L'URL de production du webhook est affichée dans le nœud Webhook : `https://<n8n>/webhook/carnet-coach` (pas l'URL « test »).
5. **Configure le site** : dans `public/config.js`, `CHAT_WEBHOOK_URL: "https://<n8n>/webhook/carnet-coach"`, puis `node tools/set-csp.js` (ajoute l'origine exacte à `connect-src`) et `node tests/static-checks.js`. Redéploie.
6. **Teste** : connecte-toi sur le site, ouvre l'onglet Coach, accepte l'envoi, pose une question. Sans connexion, le navigateur n'envoie rien (il invite à se connecter) et le serveur répondrait 401.
7. **Limitation de débit (OBLIGATOIRE avant l'ouverture au public)** : le workflow limite chaque utilisateur (20 messages/heure) et rejette tôt toute requête sans jeton, mais il ne protège ni contre l'inondation d'une adresse ni contre la dépense. Mets donc en place les trois : (a) une **limite par IP** devant n8n (nginx `limit_req`, Cloudflare *Rate limiting* ou équivalent) ; (b) une **taille de corps maximale de 16 Ko** (nginx `client_max_body_size 16k`, règle Cloudflare, ou `N8N_PAYLOAD_SIZE_MAX` pour le plafond de n8n) ; (c) un **plafond de dépense mensuel** dans la console Anthropic. Sur n8n Cloud, surveille aussi le quota d'exécutions.
8. **Confidentialité** : le workflow n'enregistre pas les exécutions (`saveDataSuccessExecution: none`). Garde ce réglage. Renseigne dans `public/config.js` / les pages légales la durée de conservation chez n8n et chez le fournisseur d'IA (voir la section « Coach » de la politique de confidentialité).

## Ce que le navigateur envoie

```json
{ "v": 1, "lang": "fr",
  "messages": [ {"role":"user","content":"..."}, ... 6 derniers au plus ],
  "context": { "profil": { "age": 35, ...le reste seulement si coché }, "ressenti": [...], "stats": [...] } }
```
Les messages de détresse, de douleur forte et de troubles alimentaires ne partent jamais : le navigateur affiche un message fixe de prudence. **Ce filtre est « au mieux » (best effort), jamais exhaustif** : il repère des mots et des tournures, pas le sens ; il est doublé côté serveur (ci-dessous) mais aucun des deux ne garantit de reconnaître un message grave. Le coach est désactivé avant 18 ans (le serveur le revérifie).
L'âge est **toujours** joint (seul champ du profil envoyé par défaut) ; un invité sans jeton est bloqué dans le navigateur avant tout envoi.

## Sécurité : ce que fait le workflow

- Refuse toute requête mal formée (rôles, tailles : 1000 caractères par message, 8 messages, contexte 4 000 caractères).
- Rejette tout de suite (401) une requête sans jeton, puis exige un jeton Supabase **valide**, non anonyme ; l'identifiant vient de Supabase, jamais du corps de la requête.
- Limite par utilisateur (20 par heure par défaut ; mémoire bornée : au-delà de 5 000 utilisateurs suivis, les plus anciens sont purgés).
- Réservé aux adultes : le navigateur envoie toujours l'âge (`context.profil.age`) avec le consentement ; le serveur répond 403 si l'âge est absent ou inférieur à 18.
- Traite le contexte comme **donnée**, pas comme instruction (balise `<donnees>` + règle dans le prompt).
- Renvoie du texte seulement (4 000 caractères au plus) ; toute erreur de l'IA devient un message générique.
- **Classification de sécurité AVANT l'IA** (nœud « Contrôle et limite ») : les mêmes règles que le navigateur (copiées de `public/coach.js` par `build-workflow.js`) sont appliquées aux messages de l'utilisateur ; si l'une se déclenche, le workflow répond par un message fixe (3114 / 15 / 112, aucun conseil de nutrition ou d'entraînement), n'appelle pas Claude et ne décompte pas la limite de débit.
- **Drapeau demandé au modèle** : le prompt impose une première ligne `[[DRAPEAU: aucun|crise|urgence|alimentation]]`. Le nœud « Réponse » la retire ; si elle vaut crise, urgence ou alimentation, la réponse du modèle est jetée et remplacée par le message fixe. Si le modèle oublie la ligne, sa réponse est gardée (limite connue : les règles du serveur sont alors la seule protection).
- **Protocole de crise** dans le prompt : réponse fixe et courte (3114, 15, 112), jamais de conseil de nutrition ni d'entraînement pendant une crise.
- Protection « au mieux » : ni les règles ni le modèle ne sont infaillibles ; les pages légales et les CGU le disent. Une personne en danger doit appeler le 3114, le 15 ou le 112.
- Prompt de coach prudent : `system-prompt.txt` (source unique ; relance `node build-workflow.js` après l'avoir modifié).

## Serveur MCP (optionnel, lecture seule)

`mcp-server/server.js` : serveur MCP stdio sans dépendance, **3 outils en lecture seule** (`lire_profil`, `lire_suivi`, `lire_ressenti`). Il lit la ligne de l'utilisateur dans Supabase avec **son** jeton : les règles RLS de `supabase/schema.sql` l'empêchent de voir autre chose. Il n'émet que des requêtes `GET` et ne renvoie jamais les notes libres.

```
SUPABASE_URL=https://<projet>.supabase.co SUPABASE_ANON_KEY=<clé anon publique> USER_JWT=<jeton de l'utilisateur> node mcp-server/server.js
```
Usage typique : une session personnelle (Claude Desktop, n8n *MCP Client Tool* en stdio) pour **ton propre** compte, avec ton jeton (valable environ une heure : copie-le depuis les outils de ton navigateur ou génère-en un par script). Pour un service multi-utilisateurs, ne laisse **jamais** le modèle choisir ou voir un jeton : récupère-le dans le workflow (celui du webhook) et lance une instance par requête. Ce serveur ne remplace pas la vérification du jeton du workflow.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Impossible de joindre le coach » | CORS (origine non autorisée dans le nœud Webhook), workflow inactif, URL « test » au lieu de « production », CSP non mise à jour (`set-csp.js`) |
| « Connecte-toi… » | pas de session, ou `apikey`/URL Supabase fausse dans le nœud de vérification |
| « Trop de messages » | limite de débit atteinte (HTTP 429) |
| « La réponse est illisible » | le dernier nœud ne renvoie pas `{ "reply": "..." }` |
