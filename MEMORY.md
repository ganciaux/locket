# Mémoire du projet

Décisions prises et avancement. À mettre à jour à chaque étape.

## Décisions (validées le 2026-10-28)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Dérivation | PBKDF2-SHA-256 600k → 256 bits → HKDF (`locket/kek`, `locket/auth`) | Demander 512 bits à PBKDF2 double le coût pour nous, pas pour un attaquant (1 bloc suffit à tester un mot de passe) |
| Sel | Email normalisé (trim + minuscules) | Cahier des charges ; conséquence : changement d'email non supporté |
| Récupération | Connexion par **lien envoyé par email** (`sendSignInLinkToEmail` → `/action` → `signInWithEmailLink`), puis clé de récupération → DEK réemballée sous la nouvelle KEK → `updatePassword(nouveauJeton)` | Sans connexion, le trousseau est illisible. `sendPasswordResetEmail` est exclu : l'URL d'action n'est plus modifiable (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`, console et API, 2026-10-28), donc son lien mène à la page Firebase qui recevrait le vrai mot de passe. Le lien de connexion, lui, redirige vers l'URL passée dans le code. Méthode « Lien envoyé par e-mail » activée dans la console le 2026-10-29 |
| Clé de récupération | 256 bits aléatoires, base32 par groupes de 4, HKDF (`locket/recovery`) | Assez d'entropie pour se passer de PBKDF2 |
| AAD | `"<entryId>/<champ>"` sur chaque chiffré | Empêche de déplacer un chiffré vers une autre fiche ou un autre champ |
| Session | DEK en mémoire seulement → écran « Déverrouiller » à chaque ouverture (session Firebase conservée) | Pas de clé au repos sur l'appareil |
| Import | Restauration sur le même compte uniquement, sans rechiffrement | Simple ; la migration entre comptes n'est pas un besoin |
| Image | Facultative ; WebP avec repli JPEG | Safari iOS n'encode pas toujours le WebP via canvas |
| Hors ligne | Pas de cache Firestore persistant ; seule l'app est mise en cache | Simplicité |
| SvelteKit | Version 2 | `@vite-pwa/sveltekit` 1.1 ne supporte pas Kit 3 |
| Node | ≥ 24.12 | Exigé par `firebase` 13 |
| Projet Firebase | `locket-403b5` ; émulateurs sous `demo-locket` | En local, aucun appel au vrai projet |
| Trousseau | Un document `users/{uid}` = `{ wrappedDek, recoveryDek }`, chacun `{ iv, data }` en `Bytes` | Une seule lecture pour se connecter, déverrouiller ou récupérer |
| Mot de passe | 12 caractères minimum | Seul rempart contre une attaque hors ligne sur `wrappedDek` |
| Session (code) | DEK rattachée à l'uid (`session.svelte.ts`) | Pas de course avec `onAuthStateChanged` lors d'un changement d'utilisateur |
| Changement de mot de passe | Réauthentification → Firestore → `updatePassword` ; si ce dernier échoue, l'ancienne `wrappedDek` est remise | Garder Auth et trousseau cohérents ; la clé de récupération reste le filet de sécurité |
| Récupération (code) | 2 étapes sur `/action` : connexion par le lien **toujours**, même si une session existe déjà (`updatePassword` exige une connexion récente, quelques minutes ; bug constaté en ligne le 2026-10-29), email redemandé s'il est ouvert dans un autre navigateur ; puis clé + nouveau mot de passe. Clé fausse → rien n'est modifié, on réessaie sans nouveau lien. Lien pour un email sans compte → le compte créé par Firebase est supprimé | Le lien est à usage unique ; sur iPhone il s'ouvre dans Safari, pas dans la PWA |
| Inscription ratée | Si l'écriture du trousseau échoue, le compte Auth est supprimé | Un compte sans trousseau est inutilisable |

## À vérifier avant la mise en production

- Domaines autorisés (Authentication > Paramètres) : `localhost`, `*.firebaseapp.com`, `*.web.app` par défaut ; y ajouter tout domaine personnalisé, sinon `sendSignInLinkToEmail` est refusé.
- Protection contre l'énumération des emails active.

## Émulateurs

- `firebase-tools` est en `devDependencies` : `npm run emulators` suffit, sans installation globale (Java requis pour Firestore).
- L'émulateur n'envoie pas d'email : en mode émulateur, la page « Mot de passe oublié » affiche le lien de connexion
  vers `/action` (lu via l'API REST de l'émulateur).

## Avancement

1. [x] Squelette SvelteKit + config Firebase (rules, émulateurs)
2. [x] Module crypto + tests Vitest
3. [x] Auth : inscription (clé de récupération affichée une fois), connexion, déverrouillage, changement de mot de passe, récupération
4. [ ] Fiches : CRUD Firestore (`Bytes`), liste avec miniatures, recherche locale
5. [ ] Images : redimensionnement canvas, plafond 900 Ko chiffré
6. [ ] PWA : manifest, service worker, icônes, iOS
7. [ ] Sécurité : CSP stricte (hashes SvelteKit), revue des logs
8. [ ] Sauvegarde : export / import JSON
9. [ ] README en français
