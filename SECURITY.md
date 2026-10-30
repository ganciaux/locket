# Sécurité de Stash : modèle de menace et plan d'audit

Document de référence pour relire ou auditer l'app. Il dit ce qu'on protège, contre qui, ce que chaque attaquant
obtient et quel code porte chaque garantie. Les règles de développement sont dans [CLAUDE.md](CLAUDE.md) (section
« Invariants de sécurité »), les décisions et leurs raisons dans [MEMORY.md](MEMORY.md).

Rédigé le 2026-10-29. À mettre à jour à chaque changement de la crypto, de l'auth, des règles ou de la CSP.

## 1. Contexte et périmètre

- **Usage** : app personnelle, un seul utilisateur. Les inscriptions sont fermées dans la console Firebase.
- **Hébergement** : Firebase, plan Spark. Hosting sert l'app statique, Auth gère l'email + mot de passe, Firestore
  (Europe) stocke les documents. Pas de Cloud Functions, pas de Storage, aucun code serveur à nous.
- **Code sensible** (~1 300 lignes, le cœur à relire) :
  - `src/lib/crypto/` : toute la crypto (Web Crypto) ;
  - `src/lib/auth/account.ts` : inscription, connexion, changement de mot de passe, récupération ;
  - `src/lib/backup/` : export et restauration ;
  - `src/lib/entries/repository.ts`, `src/lib/entries/catalog.ts` : écriture dans Firestore ;
  - `firestore.rules`, `firebase.json` (en-têtes), `svelte.config.js` (CSP).

## 2. Ce qu'on protège

| Bien | Où il vit | Protection |
|---|---|---|
| Contenu des fiches (nom, liens, dates, tags associés) | Firestore `users/{uid}/entries/{id}.data` | AES-GCM-256 avec la DEK |
| Images et miniatures | `users/{uid}/images/{id}.image`, `entries/{id}.thumb` | AES-GCM-256 avec la DEK |
| Noms et ordre des collections | `users/{uid}/meta/collections.data` | AES-GCM-256 avec la DEK |
| Noms des tags | `users/{uid}/meta/tags.data` | AES-GCM-256 avec la DEK |
| DEK (clé de données) | Firestore, sous forme emballée (2 copies) ; en clair seulement en mémoire, non extractible | Emballée par la KEK (mot de passe) et par la clé de récupération |
| Mot de passe | Jamais stocké ni transmis | Seul un jeton dérivé est envoyé à Firebase Auth |
| Clé de récupération | Chez l'utilisateur, hors ligne | Affichée une seule fois à l'inscription |

**Restent visibles en clair** pour qui a accès à Firebase :
- l'email du compte et les uid ;
- les identifiants de documents (aléatoires) et le nombre de fiches ;
- la taille des chiffrés, la présence ou non d'une image ;
- les dates d'écriture tenues par Firestore.

## 3. Chaîne de clés (résumé)

```
mot de passe + email normalisé (sel) ──PBKDF2-SHA-256, 600 000 itérations──► maître 256 bits
maître ──HKDF "locket/kek"──► KEK (emballe la DEK)
maître ──HKDF "locket/auth"──► jeton envoyé à Firebase Auth comme « mot de passe »
clé de récupération (256 bits aléatoires) ──HKDF "locket/recovery"──► KEK de récupération (2e emballage)
DEK aléatoire AES-GCM-256 ──► chiffre chaque champ, IV aléatoire de 12 octets à chaque écriture,
                              AAD = "<id>/<champ>" (data, thumb, image), "meta/tags" ou "meta/collections"
sauvegarde v3 : manifeste chiffré par la DEK, AAD "backup/manifest" (compteurs, date, SHA-256 de tout le contenu, trousseau compris)
```

## 4. Attaquants et ce qu'ils obtiennent

| Attaquant | Ce qu'il obtient | Ce qu'il n'obtient pas | Mesures |
|---|---|---|---|
| **Accès aux données Firebase** (fuite, compte console compromis, Google) | Les chiffrés et les métadonnées de la section 2 ; il peut effacer ou remplacer des documents | Le contenu ; il ne peut pas déplacer un chiffré d'une fiche ou d'un champ à l'autre (AAD) | AES-GCM + AAD ; sauvegardes chiffrées hors ligne |
| **Même attaquant, attaque hors ligne** sur la DEK emballée | Peut tester des mots de passe à 600 000 itérations PBKDF2 chacun | Rien si le mot de passe est fort ; la clé de récupération (256 bits) est hors de portée | 12 caractères minimum ; PBKDF2 600k |
| **Vol du fichier de sauvegarde** | Comme ci-dessus, plus l'emballage **avec le mot de passe en vigueur au moment de l'export** | Le contenu sans ce mot de passe ou la clé de récupération | Fichier chiffré, aucun export en clair |
| **Contrôle de la boîte email** | Se connecter à Firebase par lien email, donc lire les chiffrés, et **effacer** ou corrompre les données | Le contenu : la récupération exige aussi la clé de récupération | Récupération = lien + clé ; jamais `sendPasswordResetEmail` ; sauvegardes |
| **Script injecté dans la page** (XSS) | Pendant la session : utiliser la DEK pour tout déchiffrer et exfiltrer | — | CSP stricte (scripts du site et hash SvelteKit seulement, `connect-src` limité à Firebase) ; aucun `{@html}` ; liens limités à http(s) |
| **Dépendance npm compromise** (chaîne d'approvisionnement) | Tout : son code est servi par le site lui-même, la CSP ne l'arrête pas | — | Peu de dépendances, `package-lock.json`, `npm audit` (voir § 7) |
| **PC laissé déverrouillé** | Les fiches tant que la session est ouverte | Après le verrouillage auto : il faut le mot de passe | Verrouillage après inactivité (5 min par défaut) ; DEK en mémoire seulement |
| **Site tiers qui intègre l'app** (clickjacking) | — | — | `frame-ancestors 'none'` |

## 5. Limites connues et acceptées

- **Le serveur fournit le code.** Comme toute app web chiffrée de bout en bout, si Firebase Hosting (ou notre
  compte de déploiement) sert un JavaScript modifié, il peut lire le mot de passe à la saisie. Seule parade : une
  app installée et signée, hors périmètre.
- **Retour en arrière non détecté.** Quelqu'un qui accède à Firestore peut remettre une ancienne version d'une fiche
  (même id, même champ : l'AAD l'accepte) ou en supprimer une sans que l'app le remarque.
- **Métadonnées visibles** (section 2).
- **Appareil compromis** (logiciel espion, extension de navigateur autorisée sur tous les sites) : hors périmètre.
  Une extension peut lire les pages déchiffrées.
- **Ancien mot de passe dans une sauvegarde** : un fichier exporté reste ouvrable avec le mot de passe de l'époque,
  même après un changement de mot de passe.
- **Ancienne sauvegarde valide** : le manifeste prouve qu'un fichier est intact, pas qu'il est le plus récent. Sa date
  affichée est en revanche authentique. Restaurer remplace tout le compte : ce qui est plus récent que le fichier est
  supprimé, après confirmation.
- **Quota d'emails de récupération** : Firebase plafonne les emails de connexion par jour. Comme « Mot de passe oublié »
  est public, n'importe qui peut l'épuiser en demandant des liens pour notre adresse et bloquer la récupération jusqu'au
  lendemain. Pas d'accès aux données ; à attendre ou à contourner avec le dernier lien déjà reçu, s'il n'a pas été ouvert.
- **Aperçu iOS** : le sélecteur d'apps peut montrer une capture de l'écran déverrouillé.

## 6. Plan d'audit

Un vrai audit est un regard **indépendant** : quelqu'un qui n'a pas écrit le code et cherche à le casser. Les revues
faites par l'IA qui a co-écrit le code ne comptent pas comme telles.

### Niveau 1 : préparer (fait)
- [x] Modèle de menace (ce document).
- [x] Invariants écrits ([CLAUDE.md](CLAUDE.md)), tests unitaires de la crypto, tests contre les émulateurs :
      isolation des règles, `Bytes` uniquement, IV neuf à chaque écriture, refus d'un chiffré déplacé.

### Niveau 2 : outils automatiques (gratuit)
- [x] `npm audit` : voir le journal (§ 7).
- [ ] Dependabot (ou `npm audit` régulier) : alertes sur les dépendances.
- [ ] [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) et
      [securityheaders.com](https://securityheaders.com) sur https://locket-403b5.web.app.
- [ ] OWASP ZAP, scan « baseline » (passif) du site en ligne.
- [ ] Tests exhaustifs des règles Firestore avec `@firebase/rules-unit-testing`.
- [ ] `/security-review` (Claude Code) avant chaque changement de crypto ou d'auth. Utile, mais pas indépendant.

### Niveau 3 : relecture humaine
- [ ] **Relecture par un pair** compétent en crypto appliquée, sur `src/lib/crypto/` et `src/lib/auth/account.ts`.
      C'est la priorité : le meilleur rapport qualité/prix pour un projet personnel.
- [ ] Si un rapport écrit est souhaité : revue de code ciblée crypto + auth par un spécialiste indépendant
      (de l'ordre de 1 à 3 jours de travail).
- [ ] Pentest complet : seulement si d'autres personnes stockent un jour leurs données dans l'app.

**Cadrage à donner au relecteur** :
1. Le dépôt et ce document.
2. Vérifier chaque garantie de la section 4 et les invariants de CLAUDE.md.
3. Insister sur la dérivation des clés, l'emballage de la DEK, l'AAD, la récupération (lien email + clé),
   le changement de mot de passe (`replacePassword` : Firestore d'abord, retour arrière si Auth échoue) et la
   restauration dans un compte recréé (`adoptBackupKeyring`).
4. Préciser qu'on accepte les critiques sur la conception, pas seulement sur le code.

## 7. Journal des vérifications

| Date | Vérification | Résultat |
|---|---|---|
| 2026-10-29 | `npm audit` | 4 « high », toutes via `@grpc/grpc-js` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4), dépendance du SDK Firestore **côté Node** uniquement. Le navigateur passe par WebChannel/HTTPS et n'embarque pas gRPC. Failles côté serveur gRPC ou vérification de certificat Node : **non applicables** à l'app en ligne. `npm audit fix --force` ferait revenir `firebase` à la 9.14 : **ne pas l'appliquer**, attendre une mise à jour du SDK. |
| 2026-10-30 | Fichier de sauvegarde altéré à la main | Bug trouvé : seule la 1re fiche était vérifiée, le reste écrasait des fiches saines, et l'erreur vide de Web Crypto sous Chrome laissait le loader tourner. Corrigé : tout le fichier est déchiffré avant la première écriture, y compris pour l'adoption du trousseau. Le manifeste chiffré (format v3) couvre aussi les pièces retirées, les métadonnées et le trousseau, et le contrôle a lieu dès le choix du fichier. |
| 2026-10-29 | Bundle de prod | Aucun code d'émulateur (`demo-locket`, `127.0.0.1`) ; CSP en `<meta>` avec le hash du script de démarrage vérifié. |
