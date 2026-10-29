# Locket

PWA de fiches (nom, liens, image) chiffrées de bout en bout. Firebase ne voit jamais de donnée en clair,
ni le mot de passe, ni une clé. Décisions et avancement : voir [MEMORY.md](MEMORY.md).

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
- `npm run check` : svelte-check (types)
- `npm run build` : build statique dans `build/`

## Environnement
- Node ≥ 24.12 exigé par le SDK `firebase` (`.nvmrc`).
- Config Firebase dans `.env.local` (non versionné), modèle dans `.env.example`. Ne jamais lire ni afficher ses valeurs.
- Le projet est développé sur plusieurs machines (Windows, macOS) : rien de spécifique à un poste ici.
  Les particularités locales (proxy, shell, version de Node) vont dans `CLAUDE.local.md`, non versionné.

## Organisation
- `src/lib/crypto/` : **tout** le code crypto (Web Crypto), testé. Aucun autre module n'appelle `crypto.subtle`.
- `firestore.rules` : accès limité à `users/{uid}/**` pour `request.auth.uid == uid`.
- `firebase.json` : Hosting (CSP stricte à venir), émulateurs.

## Invariants de sécurité (ne jamais casser)
- Aucun `console.*` de donnée déchiffrée, mot de passe, jeton ou clé.
- Le vrai mot de passe ne quitte jamais le navigateur : Firebase Auth reçoit le jeton dérivé (`deriveKeys().authToken`).
- La DEK vit en mémoire uniquement, non extractible (sauf dans `rewrapDek`, le temps de réemballer).
- IV aléatoire neuf à chaque chiffrement, y compris en modification.
- AAD = `"<entryId>/<champ>"` (`data`, `thumb`, `image`) : un chiffré n'est valable qu'à son emplacement.
- Firestore : uniquement du type `Bytes`, pas de base64 ; aucune donnée en clair hors uid et ids de documents.
- Sauvegarde : uniquement des documents chiffrés (base64 dans le fichier) ; jamais d'export en clair.
  Tout id lu depuis un fichier est validé avant de servir de chemin Firestore.
- Ne jamais utiliser `sendPasswordResetEmail` : sa page hébergée par Firebase recevrait le vrai mot de passe.
  Récupération = connexion par lien email (`/action`) + clé de récupération (voir MEMORY.md).

## Conventions
- Interface en français, mobile-first, simple.
- Commits en anglais, Conventional Commits, une ligne, sans ligne d'attribution.
- Scopes : `crypto`, `auth`, `entries`, `images`, `pwa`, `security`, `backup`, `firebase`, `ui`, `deps`, `docs`.
