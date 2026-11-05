# Stash

PWA de fiches (nom, liens, image) chiffrées de bout en bout. Firebase ne voit jamais de donnée en clair,
ni le mot de passe, ni une clé. Décisions et avancement : voir [MEMORY.md](MEMORY.md) ; améliorations à faire : [AUDIT.md](AUDIT.md) ;
modèle de menace et plan d'audit : [SECURITY.md](SECURITY.md) (à tenir à jour si la crypto, l'auth, les règles ou la CSP changent).
Nom affiché : **Stash** ; « locket » reste l'identifiant interne (HKDF `locket/*`, format de sauvegarde,
clé `locket.prefs`) : ne pas le renommer, ce serait casser les clés et les sauvegardes existantes.

## Stack
- SvelteKit 2 (pas 3 : `@vite-pwa/sveltekit` ne le supporte pas) + Svelte 5 runes + TypeScript strict + Vite.
- `adapter-static` en SPA (`ssr = false`, fallback `index.html`).
- Firebase (plan Spark) : Hosting, Auth email/mot de passe, Firestore (Europe). Pas de Cloud Storage ni de Functions.
- Tests : Vitest (`src/**/*.test.ts`).
- UI : Tailwind CSS 4 + daisyUI 5 (classes daisyUI d'abord, utilitaires Tailwind ensuite), icônes dans `Icon.svelte`.
  `data-theme` sur `<html>` (préférence Thème) est l'attribut natif de daisyUI.

## Commandes
- `npm run dev` : serveur Vite
- `npm run emulators` : émulateurs Auth + Firestore + Hosting (projet fictif `demo-locket`)
- `npm test` : tests unitaires
- `npm run test:emulators` : tests d'intégration (`*.emulator.test.ts`) contre les émulateurs lancés à part (`.env.test`)
- `npm run test:e2e` : parcours Playwright dans Chrome (`e2e/`), démarre les émulateurs ; jamais contre la prod
- `npm run check` : svelte-check (types)
- `npm run build` : build statique dans `build/`
- CI (`.github/workflows/ci.yml`) : job `check` (types, tests unitaires, build) et job `e2e` (intégration + Playwright sur émulateurs)

## Environnement
- Node ≥ 24.12 exigé par le SDK `firebase` (`.nvmrc`).
- Config Firebase dans `.env.local` (non versionné), modèle dans `.env.example`. Ne jamais lire ni afficher ses valeurs.
- Le projet est développé sur plusieurs machines (Windows, macOS) : rien de spécifique à un poste ici.
  Les particularités locales (proxy, shell, version de Node) vont dans `CLAUDE.local.md`, non versionné.

## Organisation
- `src/lib/crypto/` : **tout** le code crypto (Web Crypto), testé. Aucun autre module n'appelle `crypto.subtle`.
- `firestore.rules` : accès limité au propriétaire, emplacements et champs fixes, chiffrés `Bytes` uniquement, trousseau non supprimable.
  Tout nouveau champ d'un document Firestore doit y être ajouté.
- `src/lib/entries/` : règles pures par domaine (`types`, `text`, `sites`, `tags`, `countries`, `duels`, `docSize`, `framing`),
  qui ne dépendent que de `types` et `text` ; `model.ts` garde le reste (corbeille, note, tri…) et les réexporte toutes.
- `src/lib/entries/cache.ts` : copie IndexedDB des fiches chiffrées, valide tant que le jeton `meta/version` n'a pas changé.
- `firebase.json` : Hosting (cache, en-têtes de sécurité dont `frame-ancestors`), émulateurs.
- `svelte.config.js` : CSP (`kit.csp` en `<meta>`, hash du script de démarrage recalculé à chaque build).
- `src/tools/decrypt/` : outil autonome de lecture d'une sauvegarde, un seul `.html` (`vite.decrypt.config.ts`,
  `build/stash-dechiffrer.html`), qui réutilise `src/lib/backup/` et le modèle pur, jamais Firebase.

## Invariants de sécurité (ne jamais casser)
- Aucun `console.*` de donnée déchiffrée, mot de passe, jeton ou clé.
- Le vrai mot de passe ne quitte jamais le navigateur : Firebase Auth reçoit le jeton dérivé (`deriveKeys().authToken`).
- Tout état qui garde des données déchiffrées (ou des ids qui en découlent) s'inscrit à `onLock` (`session.svelte.ts`) :
  un seul point de remise à zéro au verrouillage, jamais un `$effect` qui surveille `session.dek`.
- La DEK vit en mémoire uniquement, non extractible (sauf à la génération, dans `rewrapDek` et `unwrapBackupDek`, le temps de l'emballer).
- IV aléatoire neuf à chaque chiffrement, y compris en modification.
- AAD = `"<entryId>/<champ>"` (`data`, `thumb`, `image`), `meta/tags` ou `meta/collections` pour les catalogues, `meta/backup` pour la date de dernière sauvegarde,
  `backup/manifest` pour le manifeste d'une sauvegarde, `keyring/check` pour le sceau de `recoveryDek` :
  un chiffré n'est valable qu'à son emplacement.
- Firestore : uniquement du type `Bytes`, pas de base64 ; aucune donnée en clair hors uid et ids de documents.
  Le jeton `meta/version` est un aléa sans contenu, changé dans la transaction de chaque écriture de fiche (`commitEntries`),
  qui refuse l'écriture s'il n'est plus celui lu au chargement (autre appareil, `stale.ts`) ; les catalogues font de même avec leur IV.
- Cache local (`cache.ts`) : chiffrés uniquement, tels que dans Firestore ; jamais de clé, de donnée déchiffrée
  ni d'image complète. Effacé à la déconnexion, y compris une session terminée sans `signOut`.
  Une copie indéchiffrable entraîne une relecture de Firestore, jamais une fiche « illisible » (sa suppression agirait sur le serveur).
- Face ID (`faceId.ts`) : seule exception au « jamais de clé » local, la DEK **emballée** par la clé de Face ID (PRF,
  salée par le poivre `faceIdPepper` du trousseau), dans `localStorage`, jamais dans Firebase ; ni la sortie PRF ni la
  DEK en clair. Effacée à la déconnexion, au changement de compte et à l'adoption d'une clé ; un nouveau mot de passe
  retire le poivre (Face ID désactivé partout) ; une DEK qui n'ouvre pas le sceau `keyringCheck` est refusée.
- Sauvegarde : uniquement des documents chiffrés (base64 dans le fichier) ; jamais d'export en clair depuis l'app.
  Seul l'outil de lecture (`src/tools/decrypt/`) enregistre une page en clair : sur action volontaire et avertie,
  sans aucun script, hors ligne (sa CSP n'a aucun réseau).
  Tout id lu depuis un fichier est validé avant de servir de chemin Firestore.
  Une sauvegarde est vérifiée en entier (déchiffrement, manifeste) avant la première écriture.
- Ne jamais utiliser `sendPasswordResetEmail` : sa page hébergée par Firebase recevrait le vrai mot de passe.
  Récupération = connexion par lien email (`/action`) + clé de récupération (voir MEMORY.md).

## Conventions
- Interface en français, mobile-first, simple.
- Commits en anglais, Conventional Commits, une ligne, sans ligne d'attribution.
- Scopes : `crypto`, `auth`, `entries`, `images`, `pwa`, `security`, `backup`, `firebase`, `ui`, `deps`, `docs`.
