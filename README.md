# Stash

PWA personnelle de fiches (nom, liens, image, tags), rangées en collections, **chiffrées de bout en bout**. Tout est chiffré dans le
navigateur avant d'arriver dans Firebase. Firebase ne voit jamais de donnée en clair, ni le mot de passe, ni une clé.

- Code : SvelteKit 2 (SPA statique), Svelte 5, TypeScript, Tailwind CSS 4 + daisyUI 5.
- Hébergement : Firebase Hosting, Auth (email + mot de passe) et Firestore (Europe), plan gratuit Spark.
- Crypto : Web Crypto uniquement, dans `src/lib/crypto/` (voir [MEMORY.md](MEMORY.md) pour le détail des choix).

« Stash » est le nom affiché. L'identifiant interne reste `locket` : le projet Firebase, la dérivation des clés et le
format des sauvegardes en dépendent. Ne pas le renommer.

## Prérequis

- **Node ≥ 24.12**, exigé par le SDK `firebase`. Avec nvm : `nvm use` (lit `.nvmrc`).
- **Java 21+**, pour les émulateurs Firebase.
- Firebase CLI : déjà dans les dépendances, toujours l'appeler via `npx firebase`.

```sh
npm install
```

## Lancer en local (émulateurs, aucun appel au vrai projet)

Dans deux terminaux :

```sh
npm run emulators   # Auth 9099, Firestore 8080, interface http://127.0.0.1:4000 (projet fictif demo-locket)
npm run dev         # http://localhost:5173
```

En dev, `.env.development.local` contient `PUBLIC_USE_EMULATORS=true` : l'app parle aux émulateurs, quelle que soit la
configuration de `.env.local`. L'émulateur n'envoie pas d'email. Sur « Mot de passe oublié », le lien de connexion
s'affiche directement dans la page.

## Tests

```sh
npm test                 # tests unitaires (crypto, modèle, format de sauvegarde…)
npm run test:emulators   # intégration Firestore + règles, émulateurs lancés à part
npm run test:e2e         # parcours complets dans Chrome (Playwright) ; démarre les émulateurs et le serveur de test
npm run check            # types (svelte-check)
```

Les tests `test:e2e` ne visent que les émulateurs (`--mode test`, port 5174), jamais le vrai projet. Ils utilisent le
Chrome installé sur le poste. Fermez `npm run emulators` avant de les lancer : ils ont besoin des mêmes ports.

Derrière un proxy, les tests d'intégration ont besoin de `NO_PROXY=127.0.0.1,localhost` : gRPC suit `HTTPS_PROXY`.

## Configurer Firebase (une fois par projet)

Dans la [console Firebase](https://console.firebase.google.com/) :

1. **Firestore** : créer la base en mode production, région Europe.
2. **Authentication > Méthode de connexion** : activer « Adresse e-mail/Mot de passe » et « Lien envoyé par e-mail ».
   Le lien sert à la récupération du compte.
3. **Authentication > Paramètres** :
   - désactiver la création de comptes : l'app est personnelle. La réactiver le temps de recréer un compte ;
   - activer la protection contre l'énumération des adresses e-mail ;
   - domaines autorisés : `<projet>.web.app` et `<projet>.firebaseapp.com`.
4. **Paramètres du projet > Vos applications** : créer une app Web, puis copier sa configuration dans `.env.local`
   (modèle : `.env.example`). Ces valeurs ne sont pas secrètes, mais le fichier n'est pas versionné.

## Déployer

```sh
npm run build
npx firebase deploy --only hosting --project locket-403b5
npx firebase deploy --only firestore:rules --project locket-403b5   # seulement si firestore.rules a changé
```

- **Ce que règle `firebase.json`** : les en-têtes de sécurité (iframe interdite, HSTS…) et le cache. Les pages et
  `sw.js` sont revalidées à chaque visite, les fichiers `/_app/immutable/` sont gardés en cache un an.
- **La CSP** est générée par SvelteKit (`svelte.config.js`), en `<meta>` dans `index.html`.
- **Après un déploiement**, l'app ouverte affiche « Nouvelle version disponible ». Elle ne se recharge jamais seule :
  un rechargement la verrouillerait en pleine saisie.

## Installer sur iPhone

1. Ouvrir le site dans **Safari** (seul navigateur qui installe une PWA sur iOS).
2. Partager → **Sur l'écran d'accueil** → Ajouter.
3. Ouvrir Stash depuis l'écran d'accueil : plein écran, sans barre Safari.

iOS garde l'icône et le nom choisis à l'installation. Après un changement d'icône, supprimer l'app de l'écran
d'accueil puis l'ajouter à nouveau. Les données ne sont pas touchées, elles sont dans Firestore.

## Sécurité : ce qu'il faut savoir

- **Le mot de passe ne quitte pas le navigateur** : Firebase Auth reçoit un jeton qui en est dérivé.
- **Mot de passe et clé de récupération perdus = données perdues.** Personne ne peut les récupérer, pas même avec un
  accès à Firebase.
- **La clé de récupération** est affichée une seule fois à l'inscription. La garder hors ligne.
- **La sauvegarde** (Paramètres > Sauvegarde) produit un fichier **chiffré**. Avec la clé de récupération ou l'ancien
  mot de passe, il permet de tout restaurer, même dans un compte recréé. Le plan Spark ne sauvegarde rien de lui-même :
  l'app le rappelle tous les 30 jours.
- **L'app se verrouille** après 5 minutes d'inactivité (réglable dans Paramètres) : le mot de passe est alors
  redemandé.

Règles de développement à ne pas casser : voir [CLAUDE.md](CLAUDE.md). Modèle de menace : [SECURITY.md](SECURITY.md). Améliorations prévues : [AUDIT.md](AUDIT.md).
