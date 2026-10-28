# Mémoire du projet

Décisions prises et avancement. À mettre à jour à chaque étape.

## Décisions (validées le 2026-10-28)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Dérivation | PBKDF2-SHA-256 600k → 256 bits → HKDF (`locket/kek`, `locket/auth`) | Demander 512 bits à PBKDF2 double le coût pour nous, pas pour un attaquant (1 bloc suffit à tester un mot de passe) |
| Sel | Email normalisé (trim + minuscules) | Cahier des charges ; conséquence : changement d'email non supporté |
| Récupération | Email de reset Firebase **avec page d'action personnalisée** dans l'app : nouveau mot de passe → `confirmPasswordReset(code, jetonDérivé)`, puis clé de récupération → réemballage de la DEK | Sans ça, un mot de passe oublié empêche de se connecter, donc de lire la DEK emballée. La page hébergée par Firebase est interdite (elle recevrait le vrai mot de passe) |
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
| Récupération (code) | 2 étapes sur `/action` : `confirmPasswordReset` + connexion, puis déballage par la clé de récupération. Clé fausse → on ne redemande que la clé | Le trousseau n'est lisible qu'une fois connecté ; un abandon entre les deux se rattrape par un nouveau lien |
| Inscription ratée | Si l'écriture du trousseau échoue, le compte Auth est supprimé | Un compte sans trousseau est inutilisable |

## Lien de réinitialisation : problème ouvert (bloquant avant la mise en production)

- L'URL d'action personnalisée ne peut pas être modifiée : la console et l'API
  (`notification.sendEmail.callbackUri`) répondent `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` (constaté le 2026-10-28).
  Le lien de l'email mène donc à `/__/auth/action`, la page Firebase interdite.
- Piste A, à tester contre le vrai projet : `sendPasswordResetEmail(..., { url: origin + '/action', handleCodeInApp: true })`
  pour que Firebase redirige vers `/action` sans afficher son formulaire. Non vérifié.
- Piste B, en repli : l'utilisateur colle le lien de l'email dans `/action`, qui en extrait l'`oobCode`.
- Domaines autorisés : les 3 domaines par défaut (`localhost`, `*.firebaseapp.com`, `*.web.app`) suffisent.
- Vérifier que la protection contre l'énumération des emails est active.

## Émulateurs

- `firebase-tools` n'est pas une dépendance du projet : `npm i -g firebase-tools` ou `npx firebase-tools emulators:start --project demo-locket`.
- L'émulateur n'envoie pas d'email : en mode émulateur, la page « Mot de passe oublié » affiche le lien vers `/action`
  (lu via l'API REST de l'émulateur). Ne pas utiliser le lien de l'émulateur, qui mène à sa propre page.

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
