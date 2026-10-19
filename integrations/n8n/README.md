# Coach IA : mise en place avec n8n

Ce guide active l'onglet **Coach** du site : un assistant qui répond aux questions d'entraînement et propose d'adapter les séances (alléger, décaler, remplacer) à partir du profil et du ressenti de la personne.

Le navigateur n'appelle **jamais** l'IA directement. Il envoie les messages à un **webhook n8n** que tu héberges. n8n vérifie la personne (jeton Supabase), applique une limite de débit, appelle Claude avec **ta** clé (stockée dans n8n) et renvoie `{ "reply": "texte" }`. Aucune clé d'IA ni aucun secret n'est dans ce dépôt ni dans le navigateur.

```
Navigateur (public/coach.js)
   │  POST JSON + Authorization: Bearer <JWT Supabase>
   ▼
Webhook n8n ─► Préparer ─► Requête valide ? ─► Vérifier le jeton Supabase ─► Contrôle et limite ─► Autorisé ? ─► Claude ─► Réponse ─► { "reply": "..." }
                              └─ non : 400                                       (âge, débit, filet de sécurité)   └─ non : 401 / 403 / 429 / message fixe
```

Fichiers de ce dossier :

| Fichier | Rôle |
|---|---|
| `workflow-coach.json` | Le workflow à importer dans n8n (généré, ne pas modifier à la main) |
| `system-prompt.txt` | Le texte du coach (source unique) |
| `nodes/*.js` | Le code des nœuds « Préparer », « Contrôle et limite », « Réponse » et les messages fixes de sécurité |
| `build-workflow.js` | Régénère `workflow-coach.json` depuis les fichiers ci-dessus et les règles de sécurité de `public/coach.js` |
| `mcp-server/` | Serveur MCP optionnel, en lecture seule (voir en bas) |

---

## 1. Ce qu'il te faut

- Un **n8n accessible en HTTPS** : n8n Cloud (le plus simple) ou auto-hébergé derrière un proxy HTTPS (voir l'annexe Docker).
- Une **clé d'API Anthropic** : https://console.anthropic.com > *API keys*. Fixe tout de suite un **plafond de dépense mensuel** (*Billing > Limits*).
- Les infos Supabase du projet (déjà dans `public/config.js`) :
  - `SUPABASE_URL` : `https://yunidhwvpusrsgxqdzpb.supabase.co`
  - `SUPABASE_ANON_KEY` : la clé **anon** (publique). N'utilise **jamais** la clé `service_role`.
- L'adresse du site : `https://carnetcourse.vercel.app` (ou ton domaine).

## 2. Créer le credential Anthropic dans n8n

n8n > *Credentials* > *Create credential* > **Anthropic** > colle ta clé > *Save*. Garde le nom proposé (« Anthropic account »). La clé reste dans n8n : ne la copie ni dans ce dépôt, ni dans `config.js`, ni dans un nœud.

## 3. Importer et régler le workflow

1. n8n > *Workflows* > *Import from file* > `integrations/n8n/workflow-coach.json`.
2. Règle les nœuds suivants (les valeurs `REMPLACE-…` doivent toutes disparaître) :

| Nœud | Champ | Valeur |
|---|---|---|
| **Webhook** | *Options* > *Allowed Origins (CORS)* | `https://carnetcourse.vercel.app` (adresse exacte, sans `/` final, jamais `*`). Plusieurs domaines : séparés par une virgule |
| **Vérifier le jeton Supabase** | *URL* | `https://yunidhwvpusrsgxqdzpb.supabase.co/auth/v1/user` |
| **Vérifier le jeton Supabase** | en-tête `apikey` | la clé **anon** de `public/config.js` |
| **Claude** | *Credential* | « Anthropic account » (étape 2) |
| **Contrôle et limite** | en tête du code | `MODEL` (par défaut `claude-sonnet-5-5`), `LIMIT` (messages par heure et par personne, 20 par défaut), `MAX_TOKENS` (longueur maximale d'une réponse) |

3. Vérifie les réglages du workflow (*Settings*) : *Save successful executions* et *Save failed executions* sur **Do not save**. C'est déjà le cas à l'import : les messages, qui peuvent contenir des données de santé, ne sont pas conservés dans n8n.
4. **Active** le workflow (interrupteur *Active* en haut à droite).
5. Copie l'**URL de production** affichée dans le nœud Webhook : `https://<ton-n8n>/webhook/carnet-coach`. N'utilise pas l'URL « test » (`/webhook-test/…`) : elle ne marche que quand l'éditeur est ouvert.

## 4. Brancher le site

1. Dans `public/config.js` :
   ```js
   CHAT_WEBHOOK_URL: "https://<ton-n8n>/webhook/carnet-coach",
   ```
   L'adresse doit être en `https`. Tant qu'elle est vide, l'onglet Coach reste caché.
2. Mets à jour la CSP (ajoute l'origine exacte du n8n à `connect-src`, partout) :
   ```
   node tools/set-csp.js
   node tests/static-checks.js
   ```
3. Complète la politique de confidentialité (`public/confidentialite.html`, section « Coach ») : hébergeur et pays du n8n, fournisseur d'IA, durée de conservation chez chacun.
4. Commit, push, déploie.

## 5. Tester

**Depuis le terminal** (sans jeton, la réponse doit être 401 et rien n'est envoyé à Claude) :
```
curl -i -X POST https://<ton-n8n>/webhook/carnet-coach \
  -H "Content-Type: application/json" \
  -d '{"v":1,"lang":"fr","messages":[{"role":"user","content":"Bonjour"}]}'
```

**Depuis le site** :
1. Connecte-toi (le coach exige un compte) et remplis ton profil, âge compris (le coach est réservé aux 18 ans et plus).
2. Ouvre l'onglet **Coach**, accepte l'envoi. Coche, si tu veux, le résumé du profil, le ressenti et les stats importées (décochés par défaut).
3. Pose une question, par exemple : « J'ai les jambes lourdes après le fractionné de lundi, j'allège mercredi ? ».

**Tests du dépôt** (aucun réseau) : `node tests/n8n.js` et `node tests/coach.js`.

## 6. Ce que le coach sait faire, et ce qu'il ne fait pas

**Il sait :**
- Répondre aux questions d'entraînement, de récupération, de matériel, de motivation et d'organisation de la semaine.
- Proposer d'**adapter une séance** : alléger, raccourcir, décaler, remplacer par du cardio sans impact. Il s'appuie sur ce que la personne écrit et, si elle l'a coché, sur son profil (sport, niveau, objectif, séances par semaine, âge, poids), ses 8 derniers ressentis (effort, forme, douleur) et ses stats importées des 4 dernières semaines.

**Il ne fait pas :**
- **Il ne modifie jamais le plan.** C'est la personne qui applique ses conseils dans l'onglet Semaine : déplacer une séance, cocher « Pas faite », ou régénérer le plan depuis l'onglet Profil.
- **Il ne voit pas le détail des séances de la semaine.** Seul le résumé du profil est envoyé, pas le plan calculé. Pour qu'il réponde précisément, la personne décrit la séance dans son message (« 6 × 800 m lundi »).
- Il ne pose aucun diagnostic et ne donne aucun conseil médical.
- Il ne conseille rien sous 1 500 kcal (homme) ou 1 200 kcal (femme), ni jeûne, ni perte de poids rapide.

**Pour changer son ton ou ses règles** : modifie `system-prompt.txt`, puis lance `node integrations/n8n/build-workflow.js` et réimporte `workflow-coach.json` dans n8n. Tu devras alors refaire les réglages de l'étape 3.2. Garde le bloc « PREMIÈRE LIGNE OBLIGATOIRE » et le protocole de crise : le nœud « Réponse » en dépend.

## 7. Avant d'ouvrir au public (obligatoire)

Le workflow limite chaque compte à 20 messages par heure et rejette tôt toute requête sans jeton. Il ne protège pourtant ni contre l'inondation depuis une adresse IP, ni contre la dépense. Il faut donc aussi :

1. une **limite par IP** devant n8n (nginx `limit_req`, Cloudflare *Rate limiting* ou équivalent) ;
2. une **taille de corps maximale de 16 Ko** (nginx `client_max_body_size 16k`, règle Cloudflare, ou `N8N_PAYLOAD_SIZE_MAX`) ;
3. un **plafond de dépense mensuel** dans la console Anthropic.

Sur n8n Cloud, surveille aussi le quota d'exécutions.

## 8. Sécurité : ce que fait déjà le workflow

- **Forme de la requête** : rôles vérifiés, 1 000 caractères par message, 8 messages au plus, contexte limité à 4 000 caractères. Tout le reste est refusé (400).
- **Identité** : sans jeton, rejet immédiat (401). Le jeton est ensuite vérifié auprès de Supabase (`GET /auth/v1/user`) et un compte anonyme est refusé. L'identifiant vient de Supabase, jamais du corps de la requête.
- **Âge** : 403 si l'âge (`context.profil.age`, toujours envoyé) est absent ou inférieur à 18 ans.
- **Débit** : 20 messages par heure et par compte. La mémoire est bornée : au-delà de 5 000 comptes suivis, les plus anciens sont purgés.
- **Filet de sécurité avant l'IA** : les règles du navigateur (copiées de `public/coach.js` par `build-workflow.js`) sont rejouées sur le serveur. Détresse, douleur forte ou trouble alimentaire : le workflow renvoie un message fixe (3114 / 15 / 112), sans appeler Claude et sans décompter la limite de débit.
- **Drapeau du modèle** : chaque réponse commence par `[[DRAPEAU: aucun|crise|urgence|alimentation]]`. Si le drapeau n'est pas « aucun », la réponse est remplacée par le message fixe. Si le modèle oublie la ligne, sa réponse est gardée : les règles du serveur restent alors la seule protection.
- **Injection** : le contexte est placé dans une balise `<donnees>` et traité comme de la donnée, jamais comme une instruction.
- **Sortie** : texte seul, 4 000 caractères au plus. Le navigateur l'affiche sans HTML. Toute erreur de l'IA devient un message générique (502).
- **Limite** : ces protections fonctionnent « au mieux ». Ni les règles ni le modèle ne reconnaissent à coup sûr un message grave. Les CGU et la politique de confidentialité le disent. Une personne en danger doit appeler le 3114, le 15 ou le 112.

### Ce que le navigateur envoie

```json
{ "v": 1, "lang": "fr",
  "messages": [ {"role":"user","content":"..."}, "... 6 derniers au plus" ],
  "context": { "profil": { "age": 35, "...le reste seulement si coché" }, "ressenti": [...], "stats": [...] } }
```
L'en-tête `Authorization: Bearer <jeton Supabase>` accompagne la requête. Les messages repérés comme détresse, douleur forte ou trouble alimentaire ne partent jamais : le navigateur affiche un message fixe de prudence.

## 9. Désactiver le coach

Vide `CHAT_WEBHOOK_URL` dans `public/config.js`, relance `node tools/set-csp.js` et redéploie. Puis désactive le workflow dans n8n.

## 10. Dépannage

| Symptôme | Cause probable |
|---|---|
| L'onglet Coach n'apparaît pas | `CHAT_WEBHOOK_URL` vide ou pas en `https`, site non redéployé |
| « Impossible de joindre le coach » | origine absente de *Allowed Origins* (CORS), workflow inactif, URL « test » au lieu de « production », CSP non mise à jour (`set-csp.js`) |
| « Connecte-toi… » (401) | pas de session, ou URL / `apikey` Supabase fausse dans « Vérifier le jeton Supabase » |
| « Le coach est réservé aux personnes de 18 ans et plus » (403) | âge absent du profil ou inférieur à 18 |
| « Trop de messages » (429) | limite de débit atteinte (`LIMIT`) |
| « Le coach n'a pas pu répondre » (502) | credential Anthropic absent ou invalide, `MODEL` inconnu, plafond de dépense atteint : ouvre l'exécution en erreur dans n8n (active temporairement *Save failed executions*, puis remets *Do not save*) |
| « La réponse est illisible » | le dernier nœud ne renvoie pas `{ "reply": "..." }` (workflow modifié à la main) |

---

## Annexe A : n8n auto-hébergé (Docker)

Exemple minimal derrière un proxy HTTPS (Caddy, nginx, Traefik) :

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    restart: unless-stopped
    environment:
      - N8N_HOST=n8n.ton-domaine.fr
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.ton-domaine.fr/
      - N8N_PAYLOAD_SIZE_MAX=1          # en Mo : plafond global de n8n
      - GENERIC_TIMEZONE=Europe/Paris
      - EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
      - EXECUTIONS_DATA_SAVE_ON_ERROR=none
    ports:
      - "127.0.0.1:5678:5678"           # n'expose n8n qu'au proxy
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:
```

Côté nginx, en plus du HTTPS :
```nginx
limit_req_zone $binary_remote_addr zone=coach:10m rate=10r/m;
location /webhook/carnet-coach {
  limit_req zone=coach burst=5 nodelay;
  client_max_body_size 16k;
  proxy_pass http://127.0.0.1:5678;
}
```
Héberge-le dans l'UE si possible, et indique l'hébergeur dans la politique de confidentialité.

## Annexe B : serveur MCP (optionnel, lecture seule)

`mcp-server/server.js` est un serveur MCP stdio sans dépendance. Il expose **3 outils en lecture seule** : `lire_profil`, `lire_suivi`, `lire_ressenti`. Il lit la ligne de l'utilisateur dans Supabase avec **son** jeton : les règles RLS de `supabase/schema.sql` l'empêchent de voir autre chose. Il n'émet que des requêtes `GET` et ne renvoie jamais les notes libres.

```
SUPABASE_URL=https://yunidhwvpusrsgxqdzpb.supabase.co SUPABASE_ANON_KEY=<clé anon> USER_JWT=<jeton de l'utilisateur> node integrations/n8n/mcp-server/server.js
```

Usage typique : une session personnelle (Claude Desktop, ou le *MCP Client Tool* de n8n en stdio) pour **ton propre** compte, avec ton jeton. Il est valable environ une heure : copie-le depuis les outils de développement de ton navigateur.

Pour un service multi-utilisateurs, ne laisse **jamais** le modèle choisir ou voir un jeton : récupère-le dans le workflow (celui du webhook) et lance une instance par requête. Ce serveur ne remplace pas la vérification du jeton faite par le workflow. S'il est activé, mentionne-le dans la politique de confidentialité : c'est déjà prévu dans le texte de la section « Coach ».
