# Coach IA sans n8n : fonction Vercel (Gemini gratuit)

`api/coach.js` fait le même travail que le workflow n8n, mais dans ton propre site :
- il reçoit le message du navigateur et vérifie la connexion (Supabase) ;
- il refuse les mineurs et applique le filet de sécurité **avant** l'IA ;
- il limite le débit ;
- il appelle **Google Gemini (offre gratuite)** avec **ta** clé, stockée dans une variable d'environnement Vercel, jamais dans le dépôt ;
- il renvoie `{ "reply": "texte" }`.

La fonction est sur la même origine que le site : pas de CORS, aucun service à héberger en plus, rien à payer (offre Hobby de Vercel et offre gratuite de Gemini).

Choisis **l'un ou l'autre**, ce guide ou le workflow n8n (`integrations/n8n/README.md`) : `CHAT_WEBHOOK_URL` ne prend qu'une seule adresse.

## Pas à pas

1. **Clé Gemini gratuite** : https://aistudio.google.com > *Get API key* > *Create API key*. Un compte Google suffit, sans carte bancaire. **N'active pas la facturation** sur le projet Google de cette clé : il reste ainsi sur l'offre gratuite, sans aucun coût possible.
2. **Variables d'environnement** : Vercel > ton projet > *Settings > Environment Variables* (environnements Production et Preview), puis **redéploie** (*Deployments > … > Redeploy*) :

   | Nom | Valeur | Sensible |
   |---|---|---|
   | `GEMINI_API_KEY` | ta clé Gemini (commence par `AIza`) | oui (coche « Sensitive ») |
   | `SUPABASE_URL` | `https://yunidhwvpusrsgxqdzpb.supabase.co` (la même que dans `config.js`) | non |
   | `SUPABASE_ANON_KEY` | la clé anon publique, la même que dans `config.js` | non |
   | `COACH_MODEL` (facultatif) | un modèle Gemini ; par défaut `gemini-flash-lite-latest` (le plus de requêtes gratuites par jour). Autre choix : `gemini-flash-latest` (un peu meilleur, moins de requêtes gratuites) | non |

   Le dossier `api/` est détecté tout seul. `vercel.json` fixe la durée maximale de la fonction à 30 s.
3. **Branche le site** : dans `public/config.js` :
   - `CHAT_WEBHOOK_URL: "https://carnetcourse.vercel.app/api/coach"` (l'adresse **exacte** de ton site) ;
   - `CHAT_PROVIDER_NAME: "Google Gemini, États-Unis"`.

   Lance ensuite `node tools/set-csp.js` puis `node tests/static-checks.js`, et pousse (`git push`).
4. **Teste** :
   - connecte-toi, ouvre l'onglet Coach, accepte le consentement et pose une question normale : le coach doit répondre ;
   - envoie une phrase de détresse : tu dois recevoir le message fixe 3114 / 15 / 112, sans appel à l'IA ;
   - un compte de moins de 18 ans reçoit 403.

## Quotas gratuits : à lire

- Le quota gratuit de Gemini est **par projet Google, partagé par tous les utilisateurs** du coach. Il change souvent, consulte https://ai.google.dev/gemini-api/docs/rate-limits.
- Quand le quota du jour est épuisé, Google répond 429 et le coach affiche « Le coach n'a pas pu répondre. Réessaie dans un moment. » jusqu'au lendemain.
- Si le quota est petit, baisse `USER_LIMIT` dans `integrations/vercel/coach.template.js` (puis relance `build-api.js`), pour qu'une seule personne ne le vide pas pour tout le monde.

## Limites de débit

- **Dans la fonction** : 20 messages par heure et par personne, 60 par heure et par IP, corps de 16 Ko au plus, réponse de 4 000 caractères au plus.
- **Ces compteurs vivent dans la mémoire d'une instance** : Vercel peut en lancer plusieurs ou les recycler. C'est donc un filet « au mieux », pas une garantie.
- **Avant d'ouvrir au public**, ajoute une règle de limitation de débit dans le pare-feu Vercel (*Firewall > Rules*) sur le chemin `/api/coach`. Vérifie ce que ton plan autorise.
- Pour un compteur fiable, la suite logique est un stockage partagé (Upstash Redis, Vercel KV).
- Le plan Hobby de Vercel est réservé à un usage non commercial.

## Confidentialité

Sur l'offre gratuite de l'API Gemini, Google peut utiliser les contenus envoyés pour améliorer ses produits, et des personnes peuvent les relire. La politique de confidentialité le dit déjà.

Le contexte envoyé ne contient ni nom, ni e-mail, ni identifiant de compte : seulement des chiffres (âge, poids, séances, effort…). La fonction n'enregistre rien. N'active pas de journaux de requêtes qui garderaient le contenu des messages.

Pour supprimer cette réutilisation par Google, passe à l'offre payante de Gemini (activer la facturation), puis mets à jour la politique de confidentialité.

## Sécurité

- **Origine** : même origine seulement. Un site tiers ne peut pas appeler la fonction depuis un navigateur.
- **Connexion** : jeton vérifié par Supabase, sessions anonymes refusées, adultes seulement.
- **Messages graves** : filet de sécurité avant l'IA et drapeau demandé au modèle, comme pour n8n.
- **Filtres de Google** : si Gemini bloque la question ou la réponse, le coach renvoie un message fixe prudent, jamais un texte partiel. Les « pensées » des modèles qui raisonnent ne sont jamais renvoyées.
- **Clé** : envoyée à Google dans l'en-tête `x-goog-api-key`, jamais dans l'URL. Le nom du modèle est vérifié (minuscules, chiffres, points, tirets).
- **Erreurs** : génériques. Aucune clé ni aucun détail technique n'est renvoyé.

Le filtre de détresse reste « au mieux » (voir la politique de confidentialité).

## Maintenance

Le fichier `api/coach.js` est **généré**. Si tu modifies l'un de ces fichiers, lance `node integrations/vercel/build-api.js` :
- `integrations/n8n/system-prompt.txt` ;
- `integrations/n8n/nodes/safe-msgs.js` ;
- les règles de `public/coach.js` ;
- `integrations/vercel/coach.template.js`.

`node tests/static-checks.js` échoue tant que `api/coach.js` n'est pas à jour, et le déploiement Vercel est alors refusé. Tests de la fonction : `node tests/vercel-coach.js` (faux Supabase et fausse IA, aucun réseau).

**Pas encore testé sur un vrai Vercel ni avec la vraie API Gemini** : fais l'essai de l'étape 4.
