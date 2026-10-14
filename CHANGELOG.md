# Changelog

## 1.3.0 (site) : app v15 : profil rangé, Coach IA (option)
Même code que `plan-course/work.html` (v15, **sans** le Coach réseau) : `qa/w14/p14.py` (v13 vers v14) puis `qa/w15/p15.py` (v14 vers v15), un seul jeu de fonctions. Plans et calories de la course identiques à la v13 (400 profils).

**5. Interface**
- L'écran Semaine ne garde que le quotidien (plan de la semaine, jour, nutrition du jour, prochaine séance, actions). Le bandeau chiffré (maintien, objectif, déficit, poids visé, protéines, VMA) est dans Profil, section « Mon bilan ».
- Plan, Repères et listes mobiles : le texte passe à la ligne, plus rien n'est rogné de 320 à 360 px (tous sports). « Mes données » montre la valeur saisie hors limites (ou « ramené au maximum ») au lieu d'une valeur écrêtée ; « Mon bilan » affiche les chiffres en direct ; onglets de 44 px.
- Profil en sections repliables avec un résumé toujours visible : **Mon objectif** (sport, niveau, course et date, début du plan, poids visé), **Mes données** (sexe, âge, taille, poids, masse grasse, activité, FC max, forme actuelle, référence de vitesse), **Mes entraînements** (lieu, séances, matériel, renforcement, jour de sortie longue), **Ma nutrition** (déficit, supplément, ajustement). État ouvert/replié mémorisé (`carnet.psec`, borné). Aucun champ perdu (mêmes identifiants), aucun calcul modifié. `tests/profil15.js`.

**Correctifs, 2e passe (tests UI et calcul)**
- **Coach, 3e passe** : 7 nouvelles phrases du testeur bloquées (« m'endormir pour toujours », « lettre d'adieu », « mieux sans moi », « parole pâteuse », « vision trouble », « jours sans manger », « compense chaque repas par du sport / me punis », « honte de manger », « me restreins ») et leurs variantes proches, dans le navigateur, le nœud n8n et `tests/coach-phrases.json`. Le filtre **n'est pas et ne sera jamais exhaustif** (« au mieux », dit dans la feuille de consentement, la confidentialité, les CGU et les README) : protection structurelle en plus, un encart permanent dans le Coach « En cas de détresse : 3114 (24 h/24) · urgence : 15 / 112 », visible même pour un mineur, et le modèle comme deuxième barrière (drapeau + protocole de crise côté n8n). Onglets à 320 px : chevron « › » tant qu'il reste des onglets à droite, et l'onglet touché est ramené à l'écran.
- **Calcul VTT / remise en forme (heures par semaine ≤ 2 h, 4 à 6 séances)** : quand des séances sont retirées en semaine 1 pour respecter 1,5 × les heures déclarées, la semaine 2 part de la charge réellement placée (+10 % au plus, plus de saut de +42 à +55 %) et « N demandées, M placées » est exact (cas du testeur : 6 demandées, 3 placées, S1 95 min, S2 72 min). Grille `qa/r5/calc2/grid.js` : sport × niveau × séances × heures × 7 jours de début = 1 344 cas, 0 anomalie (avant : 66 anomalies) ; même contrôle dans `tests/v14.js` (V7). VTT à 2 h : semaine 1 de 170 min au plus (plafond 180 min). Le renforcement compte dans les heures de la semaine 1 (relecture de `w1q.js` : 4 h 10 affichées pour 2 h déclarées). Exception de plancher : s'il ne reste qu'une séance (heures déclarées très basses), la semaine 2 peut remonter jusqu'à la durée minimale d'une séance (environ 50 min). Limite documentée : quand le début tombe en milieu de semaine, la semaine 1 est partielle et la première semaine complète peut dépasser 1,5 × les heures (jusqu’à environ 1,7 × les heures déclarées pour un petit volume).
- **Minuteur de force** : les minutes affichées de chaque bloc sont arrondies en cumulé ; la durée affichée de la séance et la somme des blocs du minuteur ne diffèrent plus que de l'arrondi à la minute (au plus 30 s ; avant : plus d'1 min sur 36 % des séances). `tests/v14.js` (V8).
- **Veille de l'objectif** : en force, le jour de l'objectif n'était pas repéré (la veille et le jour restaient en déficit) ; corrigé. VTT, force et remise en forme : jour de l'objectif et veille à l'équilibre (V8). La course à pied reste identique à la v13 (400/400, `tests/cmp.js`) : sa veille n'est à l'équilibre qu'au semi et au marathon, comme avant.
- **Force, semaine 1** : les heures par semaine ne sont pas demandées ; si la première semaine dépasse 3 h (1,5 × 2 h), un rappel discret propose de retirer une séance.
- **Semaine allégée** : au plancher du plan (séances déjà au minimum), elle peut être égale à la semaine précédente ; c'est voulu, on ne descend pas sous la durée minimale d'une séance utile.
- **Saisie hors limites** (âge, taille, poids…) : `aria-invalid`, message sous le champ, valeur précédente gardée pendant la saisie (la valeur invalide n'est jamais enregistrée telle quelle) ; à la validation, la valeur ramenée aux limites est dite dans « Mes données » et dans le bilan (« Valeur corrigée »), qui ne montre plus de kcal sans avertissement.
- **Interface** : onglets d'au moins 44 px de large (320 à 375 px) ; avec le Coach (6 onglets à 320 px) la barre défile horizontalement au lieu de rogner. Cases à cocher du consentement : bordure de 2 px, contraste 9,8:1 en clair et 17,7:1 en sombre. Mineur : seul « Le coach est désactivé avant 18 ans. » est affiché. Version du consentement du Coach incrémentée (`COACH_V`), le texte de la feuille ayant changé.

**Correctifs du test de calcul v15**
- **B1** : `dropped` = `{asked, placed}` (message d'en-tête exact) ; le plafond d'heures par semaine ne s'applique qu'au VTT et à la remise en forme, `hSem` est ignoré et effacé pour la force, la course et le trail.
- **M1** : trail, D+ de la semaine à +10 % au plus de la dernière semaine normale ; plancher documenté : sous 100 m, +30 m au plus par semaine (le « +60 m » est supprimé). Semaine allégée : D+ à 80 % au plus. Kilométrage trail : issu du moteur de la course (inchangé, identique à la v13), le texte ne promet plus « comme le kilométrage ».
- **M2** : VTT et remise en forme avec 2 h par semaine ou moins et 4 à 6 séances : message de réduction, semaine allégée plus légère que la précédente, progression à +10 % au plus (grille 0 anomalie).
- **m1** force : durée affichée = durée du minuteur (le dernier repos n'est plus compté ; voir la 2e passe). **m2** trail : jour de course avec D+ dans le titre, l'ICS, la durée et le temps estimé. **m3** force : la vague de RPE repart à zéro à chaque changement de phase et après chaque semaine allégée (saut maximal +7 %). **m4** : jour de l'objectif et veille à l'équilibre pour VTT, force et remise en forme, avec l'alerte « semaine de ton objectif » pour tous les sports (la course à pied reste comme dans la v13). **m5** : « déficit réduit / augmenté de N kcal (ajustement) » (plus de confusion de signe). **m6** : semaine 1 jamais vide (séance d'introduction le jour du début) pour VTT, force, remise en forme et trail ; la course à pied reste identique à la v13 (400/400).

**4. Coach IA via n8n (site seulement)**
- `public/coach.js` + onglet Coach, caché si `CHAT_WEBHOOK_URL` est vide. Webhook https obligatoire, origine exacte ajoutée à `connect-src` par `tools/set-csp.js`.
- Consentement séparé et explicite avant le premier envoi ; profil, ressenti et stats décochés par défaut ; retrait possible. JWT Supabase en en-tête `Authorization` (`CarnetAuth.accessToken`). Pas de clé d'IA, pas de secret.
- Réponses : texte seul (mini-markdown sans HTML ni lien), 4 000 caractères et 64 Ko au plus, redirections refusées, délai 45 s, bouton Annuler, erreurs claires. Historique local de 40 messages au plus, effacé avec les données.
- Effacement : « Effacer mes données », changement de compte et effacement venu d'un autre appareil vident aussi la conversation (mémoire, écran, stockage) et jettent une réponse en vol (`CarnetCoach.wipe()`).
- Âge : toujours joint avec le consentement (seule donnée de profil envoyée par défaut) ; le serveur n8n répond 403 sous 18 ans. Invité sans jeton : bloqué dans le navigateur avant tout envoi ; n8n rejette aussi un jeton absent (401).
- Feuille de consentement : mentionne les informations de santé, le serveur n8n, le fournisseur d'IA nommé par `CHAT_PROVIDER_NAME`, les transferts hors UE et l'âge joint. Pages légales (§3, 4, 7, 8, 9, CGU) corrigées : catégories, bases 6.1.a et 9.2.a, destinataires, transferts, droits, jeton de connexion.
- Filet santé élargi (français et anglais, accents, casse, ponctuation, caractères invisibles, lettres espacées, fautes courantes) : 101 formulations des testeurs (75 du test précédent + 26) (dont les 26 du dernier test UI : « ne jamais me réveiller », « don't want to live anymore », « un poids pour tout le monde », « attenter à ma vie », perte de connaissance, cœur à 220, douleur écrasante dans le torse, « me prive de manger »…) toutes bloquées sans envoi, et aucun faux positif sur les phrases ordinaires (« envie d'en finir avec ce plan de 5 km »). Protection assumée « au mieux » (best effort), dite comme telle dans la feuille de consentement, la politique de confidentialité, les CGU et le README.
- Côté n8n : classification de sécurité AVANT l'IA (mêmes règles, message fixe 3114 / 15 / 112, aucun appel à Claude), drapeau crise / urgence / alimentation demandé au modèle en première ligne (réponse jetée si levé) et protocole de crise dans le prompt (jamais de conseil de nutrition ou d'entraînement pendant une crise).
- Santé : rappel permanent « pas un avis médical », mots-clés de détresse / douleur forte / troubles alimentaires : message fixe, aucun appel ; désactivé avant 18 ans ou sans profil.
- `integrations/n8n/` : workflow exportable (Webhook, vérification du JWT, limite par utilisateur, Claude via credential n8n, réponse `{reply}`), prompt prudent, serveur MCP en lecture seule, README pas à pas. Pages légales (confidentialité, CGU, stockage local) mises à jour. `tests/coach.js`, `tests/n8n.js`.

## 1.2.1 (site) : correctifs du test de sécurité v14
- **M1** : lecture de fichiers linéaire. Balises `<Record` / `<Workout` sans `>` : arrêt immédiat avec au plus 16 Ko gardés pour la tranche suivante, un `>` éloigné n'est cherché qu'une fois, une balise lue n'est jamais relue (fichier de 2,4 Mo : 5 s avant, moins de 0,1 s). `JSON.parse` sans reviver (30 fois plus rapide, aucune pollution possible : lecture par `Object.hasOwn`). Entrées JSON, CSV et TCX plafonnées à 16 Mo (texte cumulé 128 Mo) ; seul `export.xml` peut être gros (lu en flux). Entrées de zip qui se recouvrent ou au même décalage : archive refusée. Rapport de compression contrôlé sur l'ensemble de l'archive. Le travail rend la main au navigateur toutes les 30 ms : l'interface ne gèle pas et « Annuler la lecture » répond tout de suite (test avec un fichier de 300 Mo).
- **m1** : le plan d'un sport hors course ne démarre jamais à plus de 1,5 fois les heures déclarées. VTT, remise en forme et force : si la semaine 1 dépasse 1,5 × les heures déclarées, les dernières séances de la semaine sont retirées (au moins une reste) au lieu d'être rallongées ; sans heures déclarées, le départ prudent selon le niveau s'applique.
- **m2** : `CONSENT_V` = `2026-10-10`, pages légales mises à jour le 10 octobre 2026, case « Données de santé » : cite le ressenti, les activités et pesées importées d'Apple Santé ou de Polar Flow et la fréquence cardiaque de repos.
- **m3** : clé de dédoublonnage `date|type|durée|heure de début|distance` (deux séances du même jour et de même durée ne sont plus confondues).
- **m5** : `export.xml` jusqu'à 8 Go (au lieu de 500 Mo pour tous les fichiers), avec un message dédié au-delà ; archive, JSON, CSV, TCX : messages propres à chaque limite.
- **m4** : `cookies.html` liste déjà `sb-carnet-auth-code-verifier` (vérifié par `static-checks`).

## 1.2.0 (site) : app v14 : sports, ressenti après séance, import de stats
Même code que l'artifact `plan-course/work.html` (v14) : un seul jeu de fonctions, deux emballages. Les plans et les calories de la **course à pied** restent identiques à la v13 (400 profils comparés).

**1. Import de stats Apple Santé / Polar Flow (entièrement local)**
- Apple Santé : `export.zip` ou `export.xml` ; Polar Flow : JSON, CSV, TCX (ou une archive .zip qui les contient). Lecture par morceaux dans le navigateur, lecteur ZIP minimal (DecompressionStream), plafond 500 Mo (8 Go pour export.xml), garde-fou contre les bombes de décompression, 16 Mo par fichier JSON, CSV ou TCX, 20 000 séances examinées. Seuls `Workout`, `BodyMass` et `RestingHeartRate` sont extraits ; DTD et entités XML ignorées ; aucun `innerHTML` de texte du fichier.
- Aperçu (nombre par type, période) avant d'importer, choix « Importer / Annuler », dédoublonnage (date, type, durée), pesées hebdomadaires (moyenne) limitées aux 12 dernières semaines, FC de repos par semaine.
- Suivi : « Activités importées » (retrait d'une séance ou de tout l'import, avec annulation) et comparaison prévu / réalisé de la semaine. **Les imports ne modifient jamais les calories** : planchers 1 200 / 1 500, disponibilité énergétique, mineurs et IMC bas inchangés.

**2. Ressenti après séance**
- Bouton « Ressenti » sur chaque séance passée ou du jour : effort perçu (1 à 10), forme (1 à 5), douleur (aucune, légère, forte) et zone (liste fermée), note libre de 200 caractères (affichée en texte seulement). Tendances sur 4 semaines dans Suivi.
- Sécurité : douleur forte, ou RPE 9 ou plus deux fois de suite : message explicite (repos, avis médical, aucun diagnostic) et prochaine séance dure signalée « À alléger ». Le plan n'est jamais modifié sans que tu le décides.

**3. Objectifs et sports**
- Sport principal : course à pied (inchangé), trail (dénivelé positif par sortie, +10 % par semaine au plus), VTT (durées en minutes, sortie longue en heures), haltérophilie et force (3 à 5 séances, charge pilotée au RPE, semaine allégée toutes les 4 semaines, minuteur de séries et de repos), remise en forme générale.
- Dépense : MET du Compendium des activités physiques, mêmes planchers, mineurs, IMC et plafonds de +10 % que la course. Date d'objectif et durée du plan pour tous les sports ; l'assistant et le profil proposent le sport.

**Données et RGPD**
- Nouvelles données dans le profil et le document du compte (`feel`, `acts`, `rhr`, `sport`, `sObj`, `hSem`) : nettoyées, plafonnées (500 ressentis, 1 500 activités, 260 semaines de FC de repos), fusionnées par horodatage avec marques d'effacement, effacées par « Effacer mes données », exportées et importées avec le reste. Pire cas : environ 0,25 Mo pour une limite de 1,5 Mo.
- `schema.sql` et `cleanConsent` inchangés. Pages confidentialité, CGU et stockage local mises à jour (nouvelles données de santé, import local). Le consentement existant couvre la même finalité (synchroniser le carnet) ; si le site est déjà en ligne avec des comptes, change `CONSENT_V` dans `public/auth.js` et la date des pages pour redemander l'accord.
- Tests : `tests/v14.js` (invariants des plans, nettoyage hostile, parcours ressenti et import, synchronisation avec un compte), `tests/import-pure.js` (lecteur de fichiers, fichiers piégés et énormes), `tests/sheets.js` étendu (20 feuilles de même taille), `tests/static-checks.js` étendu.

## 1.1.0 (site) : 2026-10-09 : correctifs du test de sécurité
- **M1** : écrire ne recrée plus jamais la ligne du compte (`update` + contrôle « 0 ligne » = erreur `NOROW`) ; seul l'accord la crée. Un appareil dont l'accord a été retiré ailleurs passe en « accord à redonner ». Politique SQL de mise à jour : ligne existante avec accord.
- **M2** : `carnet.owner` : des données d'un autre compte ne sont ni fusionnées ni envoyées ; choix explicite (utiliser ce compte / repartir de zéro / se déconnecter) ; déconnexion avec effacement de l'appareil cochée par défaut.
- **M3** : supabase-js hébergé dans `public/vendor/` (npm, empreinte vérifiée) : CSP `script-src 'self'`, plus de jsDelivr ni de SRI ; chargé seulement avec une session ; le dépôt est séparé en `public/` (servi) et le reste.
- **M4** : trois accords distincts (15 ans ; CGU + confidentialité ; santé avec finalité) ; contrainte SQL `terms` et `health`.
- Époque d'effacement (`eid`) à la place d'une comparaison d'horloges ; accord en attente valable 10 min ; accord redemandé si les textes changent ; déconnexion locale ; session `sb-carnet-auth` décrite (e-mail et nom) ; purge des comptes inactifs (`pg_cron`) ; blocage du déploiement si des champs légaux restent à compléter ; anti-framing ; `update-vendor.sh` (pipefail, dossier temporaire) ; `set-csp.js` (URL exacte dans `connect-src`) ; clé `anon` exigée ; comptes anonymes exclus ; textes légaux complétés (journaux en mode invité, caractère obligatoire, AIPD, médiateur configurable).

## 1.0.0 (site) : 2026-10-09 : premier déploiement
Basé sur l'application v13 (plans et calories inchangés : 400 profils comparés, résultats identiques).

**Architecture**
- Projet statique : `index.html` + `app.css` + `app.js` (extraits de la page unique), `config.js`, `auth.js`, pages légales.
- Hébergement visé : Vercel (`vercel.json`, en-têtes de sécurité) ; GitHub Pages en secours (`_headers`, balises meta CSP, `.nojekyll`, workflow).
- **Connexion** : adaptateur Supabase (`auth.js`) à la place de `claude.use("db"/"user")`. OAuth Google, Microsoft (Azure), GitHub, Apple en option, flux PKCE. Le code de synchronisation, de fusion et d'effacement durable de la v13 est inchangé.
- Base : table `user_data` (une ligne par utilisateur) protégée par RLS, taille bornée, suppression en cascade, fonction `delete_my_account()`.
- Toujours local-first : sans configuration ou sans connexion, tout fonctionne en mode invité (stockage local).

**Écran Compte**
- Boutons « Continuer avec … » (seulement les fournisseurs configurés), cases non précochées (15 ans, CGU et consentement explicite aux données de santé), consentement horodaté.
- Se déconnecter (avec option d'effacer les données de l'appareil), retirer le consentement, supprimer le compte (deux temps), export / import / effacement comme en v13.

**Sécurité**
- CSP sans `unsafe-inline` ni `unsafe-eval` : tous les styles en ligne sont remplacés (classes, API CSSOM) ; aucun script en ligne.
- HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'`.
- supabase-js à version exacte, chargé seulement avec une empreinte SRI valide ; clé `service_role` refusée ; URL de retour OAuth calculée (jamais lue dans l'URL) ; erreurs OAuth jamais affichées ; aucun nom ni e-mail stocké hors session Supabase.

**Pages légales** : mentions légales, confidentialité (RGPD), CGU, stockage local, contact et droits, 404 ; pied de page partout.
