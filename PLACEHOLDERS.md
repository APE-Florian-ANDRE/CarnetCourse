# Champs à compléter avant la mise en ligne

Tout se règle dans **`config.js`** (section `LEGAL`) : les pages légales lisent ces valeurs. Tant qu'un champ commence par « [À COMPLÉTER », il est surligné en jaune dans les pages et un compteur s'affiche en haut de chaque page légale.

| Clé (`config.js`) | Où elle apparaît | À mettre |
|---|---|---|
| `EDITEUR_NOM` | Mentions légales, confidentialité, CGU, contact | Ton nom (particulier) ou la raison sociale |
| `EDITEUR_STATUT` | Mentions légales | Particulier / association / société (forme, capital) |
| `EDITEUR_ADRESSE` | Mentions légales, confidentialité, CGU, contact | Adresse postale (un particulier peut donner l'adresse de l'hébergeur, art. 6 III 2 LCEN, à condition de lui avoir communiqué la sienne) |
| `EDITEUR_EMAIL` | Partout (lien « mailto » sur la page contact) | Adresse e-mail de contact et d'exercice des droits |
| `EDITEUR_SIRET` | Mentions légales | SIRET, ou « sans objet » |
| `DIRECTEUR_PUBLICATION` | Mentions légales | Nom du directeur de la publication |
| `HEBERGEUR_NOM`, `HEBERGEUR_ADRESSE` | Mentions légales, confidentialité | Hébergeur du site (ex. Vercel Inc., adresse indiquée sur vercel.com/legal) |
| `SUPABASE_REGION` | Mentions légales, confidentialité | Région choisie à la création du projet (choisis une région de l'UE) |
| `DPO_EMAIL` | Confidentialité, contact | E-mail du DPO, ou « sans objet » |
| `MEDIATEUR` | CGU, article 12 | Médiateur de la consommation (nom et site), ou « sans objet » |
| `INACTIVITE_MOIS` | Confidentialité | Durée d'inactivité avant suppression des comptes (ex. 24), à appliquer réellement (voir README et `purge_inactive_accounts` dans `supabase/schema.sql`) |

Autres points à valider (texte dans les pages, hors `config.js`) :

- **AIPD** : confidentialité, article 5 (entre crochets) : indique son statut.
- **Durée de conservation des journaux** : confidentialité, article 6 (« au plus douze mois ») : à confirmer avec l'hébergeur et Supabase.
- **Transferts hors UE** : confidentialité, article 8 : à confirmer selon les contrats (DPA) signés.
- **Relecture juridique** : chaque page légale porte la mention « Modèle à faire valider ». Retire le bandeau (la `div class="banner"` en haut des 5 pages légales) une fois validé.
- **Versions de consentement** : `CONSENT_V` dans `app.js` et la date « Dernière mise à jour » des pages doivent changer ensemble quand les textes changent.

**Blocage** : dès que `SUPABASE_URL` est renseignée, `node tests/static-checks.js` (et le workflow GitHub Pages) échoue tant qu'un « À COMPLÉTER » reste dans `config.js`.

## Coach (si activé)
- `CHAT_WEBHOOK_URL` (config.js) : adresse https du webhook n8n. Vide = Coach caché.
- Pages légales : renseigne la durée de conservation des échanges chez n8n et chez le fournisseur d'IA (repère « À COMPLÉTER » dans la section Coach de la confidentialité, dans `qa/site/genlegal.py` si tu régénères les pages).
