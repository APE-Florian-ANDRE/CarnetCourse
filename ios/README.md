# Pace'Run — app iPhone

App native SwiftUI (iOS 18+, iPhone, thème sombre aux couleurs du site).

## Ouvrir et lancer

1. Ouvrir `ios/PaceRun.xcodeproj` dans Xcode.
2. Choisir un simulateur iPhone (ou ton iPhone branché, avec ton équipe de signature dans *Signing & Capabilities*).
3. ⌘R.

En ligne de commande :

```sh
xcodebuild -project ios/PaceRun.xcodeproj -scheme PaceRun -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## Moteur de plan : une seule source

Le plan n'est **pas** réécrit en Swift : `PaceRun/Engine/engine.js` est extrait de `public/app.js` (partie « calculs », sans DOM)
et exécuté par JavaScriptCore. Le site et l'app donnent donc le même plan pour le même profil.

Après toute modification du moteur dans `public/app.js` :

```sh
npm run build:ios-engine    # regénère ios/PaceRun/Engine/engine.js
npm run check:ios-engine    # vérifie qu'il est à jour
```

## Organisation

| Dossier | Rôle |
| --- | --- |
| `PaceRun/Engine` | `engine.js` (généré) et `PlanEngine.swift` (pont JavaScriptCore, modèles du plan) |
| `PaceRun/Store` | `AppStore` : document local (même format que le site), séances faites, ressenti, suivi |
| `PaceRun/Theme` | Couleurs de `public/app.css`, cartes, boutons |
| `PaceRun/Views` | Accueil (dashboard), Plan, Suivi, Profil, onboarding, tuto |
| `PaceRunTests` | Tests du moteur et du store |
| `tools/build-engine.js` | Génération de `engine.js` |

Le projet utilise des dossiers synchronisés (Xcode 16+) : un fichier ajouté dans `PaceRun/` est compilé sans toucher au `.xcodeproj`.

## Données

Tout reste sur l'iPhone (`Application Support/pacerun-doc.json`, chiffré par la protection de fichiers iOS).
Le format est celui de `user_data.doc` du site : la synchro Supabase pourra le réutiliser tel quel.

## Pas encore fait

- Connexion au compte et synchro Supabase
- Coach IA et ajustement du plan par l'IA
- Import de séances (Apple Santé / montre cardio)
- Déplacement des séances dans la semaine, calories détaillées
- Widgets, notifications de rappel
