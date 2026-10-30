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
| Sauvegarde | Fichier JSON `stash-sauvegarde-AAAA-MM-JJ.json` : documents tels quels (chiffrés, base64), trousseau (2 copies emballées de la DEK), catalogues de collections et de tags ; images facultatives. **Format v2 uniquement** (collections) : la v1 est refusée, aucune n'existait (2026-10-29). Pas d'export en clair (refusé le 2026-10-29) | Le plan Spark n'a pas de sauvegarde Firestore ; le fichier est illisible sans mot de passe ou clé de récupération |
| Restauration | Même DEK : remplace / complète par id, ne supprime rien, collections et tags fusionnés par id (ordre du compte conservé). DEK différente (compte recréé, décidé le 2026-10-29) : compte **vide** obligatoire, mot de passe actuel vérifié avant toute écriture, ancienne DEK déballée par l'ancien mot de passe (même email) ou l'ancienne clé de récupération, puis adoptée ; **l'ancienne clé de récupération redevient la bonne** (choix utilisateur). Ids validés (`[A-Za-z0-9_-]{1,64}`) | Seul filet de sécurité en cas de perte du compte. Compte vide : ses fiches (autre DEK) deviendraient illisibles |
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
| Fiches | `users/{uid}/entries/{id}` = `{ data, thumb? }`, `users/{uid}/images/{id}` = `{ image }`, chaque champ `{ iv, data }` en `Bytes` ; écrits/supprimés dans un même lot | Le SDK web lit les documents en entier : avec l'image dans la fiche, la liste téléchargerait toutes les images. Écart assumé au modèle du cahier des charges |
| Contenu chiffré `data` | `{ name, links: [{ url, label? }], createdAt, updatedAt, imageType? }` | `imageType` sert à afficher image et miniature (WebP ou JPEG) |
| Liens | `http(s)` uniquement, `https://` ajouté si absent ; revalidés à l'affichage | Un lien `javascript:` exécuterait du code avec la DEK en mémoire |
| Images | Canvas : 1600 px / 300 px ; qualité puis taille réduites par paliers jusqu'à < 900 Ko | Limite Firestore de 1 Mio par document |
| Liste | Chargée et déchiffrée une fois par déverrouillage, cache mémoire vidé au verrouillage ; tri par nom ; recherche sans casse ni accents | Pas de rechargement de toutes les miniatures à chaque navigation |
| Préférences | Thème (auto/clair/sombre), ouverture des liens (nouvel onglet par défaut) taille des cartes S/M/L (M par défaut) et collection affichée (son id ; inconnue → la première) en `localStorage`, par appareil | Le bon réglage diffère entre PC et iPhone (PWA) ; rien de sensible |
| Interface | Tailwind CSS 4 + daisyUI 5 (thèmes `light`/`dark`, accent rouge bordeaux repris du logo), icônes SVG inline (`Icon.svelte`), composants `Field` et `ErrorAlert` | Rendu soigné sans JS tiers ni CDN : pur CSS généré au build, compatible CSP stricte. Pico jugé trop générique, Material trop lourd et peu adapté à iOS |
| Import de noms | `/fiche/import` : un nom par ligne (texte collé ou `.txt`), dans la **collection affichée** ; doublons ignorés (existants dans cette collection ou répétés, sans casse ni accents), lots de 400 écritures | Création rapide de fiches à compléter ensuite. Distinct de la sauvegarde/restauration (étape 8) |
| Collections (2026-10-29) | Catalogue chiffré `users/{uid}/meta/collections` = `{ data }` (JSON `[{ id, name }]`, AAD `meta/collections`), **l'ordre du tableau est l'ordre d'affichage** (↑ ↓ dans `/collections`). Chaque fiche a **exactement une** collection (`collectionId` dans son `data` chiffré) ; on est **toujours** dans une collection (pas de vue « Toutes ») ; bascule par le menu du titre de la liste. Suppression **seulement si vide** (la dernière comprise : retour à l'écran « Créez votre première collection »), ses tags avec elle. Changer une fiche de collection retire ses tags. Base vidée en prod pour l'occasion : pas de migration | Regroupement exclusif + changement de contexte (liste, recherche, tags, import), ce que les tags ne font pas. Mot « Thème » écarté : déjà pris par clair/sombre. Glisser-déposer écarté : capricieux sur iPhone |
| Tags | Catalogue chiffré `users/{uid}/meta/tags` = `{ data }` (JSON `[{ id, name, collectionId }]`, AAD `meta/tags`) : **propres à chaque collection** (un même nom peut exister dans deux collections) ; les fiches ne portent que `tagIds` (UUID) dans leur `data` chiffré. Admin `/tags` pour la collection active (sélecteur en haut) : ajout, renommage, suppression. Catalogues tags et collections : même code (`catalog.ts`). Filtre par pastilles : **OU par défaut**, bascule OU / ET, pastille « Sans tag » exclusive ; aucun tag sélectionné = pas de filtre ; la recherche texte porte aussi sur les noms de tags | Rien en clair, aucune sémantique côté app. Renommer ou supprimer un tag ne réécrit pas les fiches (elles ne portent que l'id) : un id orphelin est ignoré à l'affichage et retiré à la prochaine modification |

## À vérifier avant la mise en production

- Domaines autorisés (Authentication > Paramètres) : `localhost` retiré le 2026-10-29 ; y ajouter tout domaine personnalisé, sinon `sendSignInLinkToEmail` est refusé.
- Protection contre l'énumération des emails : active, vérifiée le 2026-10-29. L'app répond pareil sur « Mot de passe oublié »
  que l'adresse ait un compte ou non (inscriptions fermées → `auth/admin-restricted-operation` traité comme un envoi).
- **Collections** : prod vidée puis déployée le 2026-10-30 (`entries`, `images` et `meta` supprimés, document `users/{uid}`
  gardé : il porte le trousseau, sans lui plus de connexion). Plus aucune sauvegarde v1 : anciennes supprimées.

## Émulateurs

- `firebase-tools` est en `devDependencies` : `npm run emulators` suffit, sans installation globale (Java requis pour Firestore).
- L'émulateur n'envoie pas d'email : en mode émulateur, la page « Mot de passe oublié » affiche le lien de connexion
  vers `/action` (lu via l'API REST de l'émulateur).

## Avancement

1. [x] Squelette SvelteKit + config Firebase (rules, émulateurs)
2. [x] Module crypto + tests Vitest
3. [x] Auth : inscription (clé de récupération affichée une fois), connexion, déverrouillage, changement de mot de passe, récupération
   — déployé et validé en ligne le 2026-10-29 (PC + Safari iPhone), récupération par lien email comprise
4. [x] Fiches : CRUD Firestore (`Bytes`), liste avec miniatures, recherche locale — testé contre les émulateurs ; interface à valider à la main
5. [x] Images : redimensionnement canvas, plafond 900 Ko chiffré — canvas à valider dans le navigateur (PC + iPhone)
6. [x] PWA : manifest, service worker (app seulement, jamais de données), mise à jour proposée par un bandeau (pas de rechargement auto : il verrouillerait l'app), logo (coffre) de l’utilisateur partout, fixé au déploiement ; son illustration du livre en fond d’écran fondu (`background.jpg`) ; nom affiché « Stash » (ex-Locket, puis Wanted Archive)
7. [x] Sécurité : CSP stricte (`kit.csp` en hash + en-têtes `firebase.json`), code émulateurs hors prod, verrouillage auto
8. [x] Sauvegarde : export / import JSON chiffré, restauration dans un compte recréé — testé contre les émulateurs
9. [x] README en français
10. [x] Collections ordonnées avec tags propres à chacune (2026-10-29) — testé contre les émulateurs et à la main (mobile) ; déployé le 2026-10-30, prod vidée au préalable

Après l’étape 9 : voir [AUDIT.md](AUDIT.md) (revue du 2026-10-29).
