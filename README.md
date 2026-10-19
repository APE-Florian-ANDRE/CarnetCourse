# Carnet de course : site statique

Plan d'entraînement (course à pied, trail, VTT, haltérophilie et force, remise en forme), allures et calories, ressenti après séance, import de tes stats Apple Santé ou Polar Flow. **Local-first** : sans connexion, tout fonctionne dans le navigateur. Avec un compte (Google, Microsoft, GitHub, Apple en option), les données sont aussi enregistrées dans Supabase pour les retrouver sur tous tes appareils.

```
public/                            ce qui est PUBLIÉ (rien d'autre n'est servi)
  index.html  app.css  app.js        l'application (aucun script ni style en ligne)
  config.js                          configuration PUBLIQUE (Supabase, fournisseurs, CHAT_WEBHOOK_URL du Coach, infos légales)
  coach.js                           onglet Coach (assistant IA via un webhook n8n) : caché tant que CHAT_WEBHOOK_URL est vide
  auth.js                            adaptateur de compte (Supabase, OAuth PKCE)
  vendor/                            supabase-js 2.45.4 hébergé ici (+ HASHES.txt, licence) : aucun script de tiers
  cgu / confidentialite / mentions-legales / cookies / contact / 404 .html   pages légales
  _headers  .nojekyll                en-têtes (Netlify / Cloudflare Pages), GitHub Pages
vercel.json                        en-têtes de sécurité, outputDirectory = public
supabase/schema.sql                table, règles RLS, suppression de compte, purge des comptes inactifs
tools/set-csp.js  update-vendor.sh écrit la CSP partout (Supabase + webhook du Coach) / met à jour la bibliothèque hébergée
api/coach.js                       Coach sans n8n : fonction Vercel (générée, Gemini gratuit) : voir integrations/vercel/README.md
integrations/vercel/               modèle et générateur de api/coach.js, guide pas à pas
integrations/n8n/                  workflow n8n exportable, prompt du coach, serveur MCP en lecture seule (hors du site publié) : voir son README
tests/                             tests (faux Supabase, aucun réseau)
.github/workflows/pages.yml        déploiement GitHub Pages (secours)
```

## 0. Coach IA (option, désactivé par défaut)
L'onglet « Coach » n'existe que si `CHAT_WEBHOOK_URL` (https) est renseignée dans `public/config.js`. Il envoie les messages à **ton** webhook n8n (qui appelle l'IA avec ta clé, stockée dans n8n : jamais dans ce dépôt ni dans le navigateur). Étapes complètes : `integrations/n8n/README.md`. Garanties : consentement séparé avant le premier envoi (profil, ressenti et stats décochés par défaut), JWT Supabase envoyé en en-tête si connecté, réponses affichées en texte seul, message de prudence sans appel au serveur pour la détresse, la douleur forte et les troubles alimentaires, désactivé avant 18 ans. **Le filet de sécurité est « au mieux » (best effort), non exhaustif** : doublé côté n8n (classification avant l’IA, drapeau demandé au modèle, protocole de crise 3114 / 15 / 112), il ne remplace pas un humain. Un encart permanent « 3114 / 15 / 112 » est affiché dans l’onglet Coach. Après avoir renseigné l'adresse : `node tools/set-csp.js`.

## 1. Essayer en local (mode invité)
```
python3 -m http.server 8080 -d public      # puis http://localhost:8080
```
Sans clés dans `config.js`, la connexion est désactivée et l'écran Compte l'explique : normal.

## 2. Créer le projet Supabase
1. https://supabase.com : **New project**, région **UE** (note-la pour `SUPABASE_REGION`).
2. **SQL Editor** : colle et exécute `supabase/schema.sql` (table `user_data`, RLS, fonction `delete_my_account`).
3. **Project Settings > API** : copie *Project URL* et la clé **anon / publishable** (publique par conception). **Ne copie jamais la clé `service_role`** : `auth.js` la refuse et `tests/static-checks.js` cherche les secrets.
4. **Authentication > URL Configuration** :
   - *Site URL* : l'adresse du site (ex. `https://carnet.example.org/`).
   - *Redirect URLs* : exactement la même adresse (avec `/` final), plus `http://localhost:8080/` pour tester. Pas de joker `*` : c'est ce qui empêche les redirections ouvertes.
5. **Authentication > Providers** (active ceux que tu veux ; l'URL de rappel à déclarer chez le fournisseur est toujours `https://<ref-du-projet>.supabase.co/auth/v1/callback`) :
   - **Google** : Google Cloud Console > APIs & Services > Credentials > *OAuth client ID* (Web). Origine autorisée : ton site. URI de redirection : l'URL de rappel ci-dessus. Colle *Client ID* et *Secret* dans Supabase.
   - **Microsoft (Azure)** : portail Azure > Microsoft Entra ID > App registrations > *New registration* ; types de comptes « tous les annuaires et comptes Microsoft personnels » ; URI de redirection (Web) = l'URL de rappel ; *Certificates & secrets* > nouveau secret. Dans Supabase (fournisseur « Azure »), Tenant URL : `https://login.microsoftonline.com/common`.
   - **GitHub** : Settings > Developer settings > OAuth Apps > *New*. Authorization callback URL = l'URL de rappel.
   - **Apple** (option) : compte développeur Apple requis (Services ID + clé). Ajoute `"apple"` dans `PROVIDERS`.
   - Désactive le fournisseur **Email** (le carnet n'a pas de mot de passe) si tu n'en veux pas.
6. **Authentication > Rate Limits** : garde les valeurs par défaut ou durcis-les (connexions, jetons). Les limites s'appliquent par IP côté Supabase : c'est la protection contre les abus de connexion. Désactive aussi **Allow anonymous sign-ins** (les règles RLS les excluent de toute façon). Option : activer **CAPTCHA** (non géré par ce front, donc à n'activer qu'après l'avoir ajouté) et, en offre payante, un délai d'inactivité de session.
7. **Authentication > Sessions** : active la rotation des jetons de rafraîchissement (par défaut).

## 3. Configurer le site
1. Dans `public/config.js` : `SUPABASE_URL`, `SUPABASE_ANON_KEY` (une clé « anon » : `auth.js` refuse toute clé dont le rôle n'est pas `anon`), `PROVIDERS` (ex. `["google","azure","github"]`).
2. **CSP** : lance `node tools/set-csp.js`. Il lit `SUPABASE_URL` et écrit la même politique dans `vercel.json`, `public/_headers` et les 7 balises meta : `connect-src 'self'` + l'URL **exacte** du projet (pas de joker). `node tests/static-checks.js` échoue si ce n'est pas fait.
3. **supabase-js** est hébergé dans `public/vendor/` (version exacte, empreinte du paquet npm vérifiée, voir `HASHES.txt`) : aucun script de tiers, pas de SRI externe. Il n'est chargé que si une session existe ou au retour d'une connexion. Pour changer de version : `tools/update-vendor.sh X.Y.Z`, puis modifie `VERSION` dans `auth.js` et relance `set-csp.js` et les tests.
4. Remplis les infos légales (`LEGAL`) : voir **PLACEHOLDERS.md**. Tant qu'un « À COMPLÉTER » reste **et** que `SUPABASE_URL` est renseignée, `static-checks.js` échoue (le workflow Pages s'arrête avant publication ; sur Vercel, lance-le avant de pousser).

## 4. Déployer sur Vercel (cible principale)
1. Pousse ce dossier dans un dépôt GitHub (le `.gitignore` exclut `.env`, clés, `.vercel`).
2. vercel.com > *Add New > Project* > importe le dépôt. *Framework Preset* : **Other**. Laisse les champs *Build Command* et *Output Directory* tels quels : `vercel.json` les fixe (voir 3).
3. `vercel.json` fixe `buildCommand: node tests/static-checks.js` (le déploiement est refusé si un contrôle échoue : secret, CSP, placeholders légaux avec Supabase renseigné…) et `outputDirectory: public` : seul ce dossier est servi (README, SQL, tests et outils ne le sont pas). Domaine : Settings > Domains. Ajoute-le dans **Supabase > Redirect URLs** et **Site URL**.
4. Vérifie les en-têtes : `curl -sI https://ton-domaine/ | grep -i -E "content-security|strict-transport|x-content|referrer|permissions|cross-origin"` (ou https://securityheaders.com).

## 5. Déployer sur GitHub Pages (secours)
1. Repo > Settings > Pages > *Source* : **GitHub Actions** ; pousse sur `main` (workflow `.github/workflows/pages.yml` : lance les contrôles bloquants puis publie `public/` seulement). **À faire avant la production** : épingler les actions du workflow par SHA de commit (voir les `TODO` dans le fichier).
2. Limites : Pages ne permet pas d'ajouter des en-têtes. La **CSP** est donc appliquée par les balises `<meta>` (sans `frame-ancestors`, qui n'existe qu'en en-tête : le site pourrait être mis dans un cadre) ; HTTPS et HSTS sont fournis par Pages. Pour un vrai jeu d'en-têtes, passe par Vercel/Netlify/Cloudflare Pages (le fichier `_headers` est lu par Netlify et Cloudflare Pages).
3. Tous les liens sont relatifs : un site « projet » (`https://user.github.io/repo/`) fonctionne. La page `404.html` utilise des chemins absolus depuis la racine : pour un site « projet », garde un domaine personnalisé (ou accepte une 404 sans style).
4. Ajoute l'adresse de la page dans les *Redirect URLs* de Supabase (avec le chemin et le `/` final).

## 6. Sécurité : ce qui est en place
| Sujet | Mesure |
|---|---|
| Scripts / styles | CSP stricte : `script-src 'self'` + l'URL exacte de supabase-js, `style-src 'self'`, pas d'`unsafe-inline` ni d'`eval`. Les styles dynamiques passent par l'API CSSOM. |
| Bibliothèque d'authentification | Hébergée sur le site (version exacte, empreinte vérifiée), aucun script de tiers : `script-src 'self'`. Chargée seulement avec une session. Cadre : `top!==self` masque la page. |
| Authentification | OAuth, flux PKCE, aucun mot de passe géré ; session gérée par supabase-js (`sb-carnet-auth`). |
| Redirection | `redirectTo` calculé depuis l'origine du site, jamais depuis l'URL ; liste blanche exacte côté Supabase ; paramètres d'erreur OAuth effacés et jamais affichés. |
| Données | RLS : chacun ne lit/écrit que sa ligne ; la ligne n'est CRÉÉE que par l'acceptation du consentement (trois cases : âge, CGU, santé) et jamais recréée par une écriture ; mise à jour seulement si un accord existe ; comptes anonymes exclus ; `doc` borné à 1,5 Mo ; cascade à la suppression du compte ; `anon` sans accès. |
| Appareil partagé | `carnet.owner` : des données créées avec un autre compte ne sont jamais fusionnées ni envoyées sans choix explicite ; déconnexion avec effacement de l'appareil cochée par défaut ; déconnexion locale seulement. |
| Effacement durable | Marqueur d'effacement avec époque aléatoire (`eid`) : un appareil resté dans une ancienne époque abandonne ses données au lieu de les réécrire. |
| Contenu importé / reçu | Mêmes nettoyeurs que la v13 : champs connus, nombres, énumérations, `__proto__` ignoré, 2 Mo au plus, échappement systématique. |
| Données locales | Ni nom ni e-mail stockés ; déconnexion avec effacement local au choix ; effacement durable (marqueur dans le compte) comme en v13. |
| En-têtes | HSTS, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (tout coupé), COOP/CORP `same-origin`, `X-Frame-Options`, `frame-ancestors 'none'`. |
| Abus | Limites de débit de Supabase Auth (étape 2.6), taille de ligne bornée par contrainte SQL. |

**Limites connues** : le front ne gère pas de CAPTCHA ; la fusion entre appareils est « dernier écrit gagne » au niveau du profil entier (voir CHANGELOG de la v13 de l'app) ; la lecture puis l'écriture dans le compte n'est pas atomique.

## 7. RGPD : ce que doit faire l'éditeur
- Remplir **PLACEHOLDERS.md**, faire relire les pages légales (bandeau « modèle à faire valider »), puis retirer le bandeau.
- Signer/accepter les **DPA** de Supabase et de l'hébergeur ; choisir une région UE ; vérifier les garanties pour les transferts (DPF / CCT).
- Tenir un **registre des traitements** ; envisager une **AIPD** (données de santé).
- **Droit à l'effacement et portabilité** : déjà dans l'appli (Compte). `delete_my_account()` supprime le compte et, en cascade, les données.
- **Comptes inactifs** : `supabase/schema.sql` fournit `public.purge_inactive_accounts(months)` : supprime les comptes sans connexion **ni session renouvelée ni écriture de données** depuis N mois (`greatest(last_sign_in_at, auth.sessions.refreshed_at, user_data.updated_at)` : une session qui se renouvelle compte comme une activité), en cascade. Active l'extension `pg_cron` (Database > Extensions) puis planifie-la (ligne en commentaire à la fin du schéma, ex. chaque dimanche à 3 h avec 24 mois). La durée doit être la même que `INACTIVITE_MOIS` dans `config.js` (texte de la politique de confidentialité). La fonction n'est appelable par aucun client (réservée à `postgres` / cron).
- **Âge minimal** : 15 ans (case obligatoire à la connexion ; les textes l'expliquent).
- **Preuve du consentement** : colonne `consent` (trois accords + versions des textes + horodatage). Si tu modifies les textes, change `CONSENT_V` dans `public/auth.js` (et la date des pages) : l'accord est redemandé à la connexion suivante.

## 7bis. v14 : nouvelles données de santé (à relire avant l'ouverture)
- Nouvelles données, toutes saisies ou importées par la personne : sport choisi et heures par semaine ; ressenti après séance (effort, forme, douleur et zone, note libre de 200 caractères) ; activités importées (date, type, durée, distance, énergie, FC moyenne), pesées hebdomadaires et FC de repos issues d'un fichier Apple Santé ou Polar Flow.
- Le fichier importé est lu dans le navigateur et n'est jamais envoyé ni conservé ; seules les valeurs extraites sont gardées (plafonds : 500 ressentis, 1 500 activités, 260 semaines de FC de repos). Elles suivent le régime des autres données de santé : appareil seul, ou compte avec le consentement santé existant (même finalité : synchroniser le carnet).
- Les pages `confidentialite`, `cgu` et `cookies` sont mises à jour (les champs `[À COMPLÉTER]` restent ceux de `PLACEHOLDERS.md`). L'AIPD envisagée doit couvrir ces données. `CONSENT_V` vaut `2026-10-10` (accord redemandé aux comptes existants à cause des nouvelles données de santé) ; à changer de nouveau, avec la date des pages, à chaque modification des textes.
- Aucun ajustement automatique des calories à partir de l'import ou du ressenti : planchers, disponibilité énergétique, mineurs et IMC bas restent absolus. Les messages de douleur ou de fatigue sont des rappels de prudence, jamais un diagnostic.

## 8. Tests (aucun réseau réel : faux client Supabase)
Playwright est utilisé depuis l'installation globale existante :
```
export NODE_PATH=$(npm root -g)
node tests/static-checks.js      # CSP identique partout, aucun secret, code inline, schéma SQL
node tests/flows.js              # invité, connexion, consentement, déconnexion, retrait, suppression, effacement durable, CSP
node tests/pages.js              # pages légales : rendu, 320 à 1440 px clair/sombre, contrastes, CSP
node tests/vendor.js             # supabase-js hébergé : vraie bibliothèque, CSP, aucune requête de tiers
node tests/sheets.js             # toutes les feuilles (modales) ont la même taille
node tests/cmp.js                # plans et calories identiques à la v13 (V13=chemin du fichier v13)
node tests/v14.js                # sports, ressenti, import Apple Santé / Polar, synchronisation avec un compte
node tests/import-pure.js        # lecteur de fichiers Apple Santé / Polar : fichiers piégés, énormes, bombes zip
node tests/wiz-regression.js     # assistant : entrées invalides refusées, plans identiques à la v12
node tests/profil15.js           # profil en sections repliables, Semaine allégée, 320 à 1440 px, clair/sombre, contrastes
node tests/coach.js              # Coach avec un faux webhook : consentement, JWT, garde-fous santé, erreurs, HTML hostile, annulation, mineurs
node tests/vercel-coach.js       # fonction Vercel du Coach (faux Supabase, fausse IA, aucun réseau)
node tests/n8n.js                # workflow n8n (structure, aucun secret, nœuds Code) et serveur MCP en lecture seule
```
