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
  - `src/lib/auth/account.ts` : inscription, connexion, changement de mot de passe, récupération, Face ID ;
  - `src/lib/auth/faceId.ts` : clé d'accès WebAuthn (`prf`) et copie de la DEK propre à l'appareil ;
  - `src/lib/backup/` : export et restauration ; `keyring.ts`, `verify.ts`, `reader.ts` : ouverture, contrôle et
    lecture d'une sauvegarde sans Firebase, partagés avec l'outil de lecture ;
  - `src/tools/decrypt/`, `vite.decrypt.config.ts` : outil autonome de lecture d'une sauvegarde et sa CSP ;
  - `src/lib/entries/repository.ts`, `src/lib/entries/catalog.ts` : écriture dans Firestore ;
  - `src/lib/entries/cache.ts` : copie locale des chiffrés ;
  - `firestore.rules`, `firebase.json` (en-têtes), `svelte.config.js` (CSP).

## 2. Ce qu'on protège

| Bien | Où il vit | Protection |
|---|---|---|
| Contenu des fiches (nom, liens, dates, tags associés, note, pays, remarques, validation, cadrage) | Firestore `users/{uid}/entries/{id}.data` | AES-GCM-256 avec la DEK |
| Images et miniatures | `users/{uid}/images/{id}.image`, `entries/{id}.thumb` | AES-GCM-256 avec la DEK |
| Noms et ordre des collections, modèles d'URL de leurs sites, classement de leurs fiches (ids) | `users/{uid}/meta/collections.data` | AES-GCM-256 avec la DEK |
| Noms des tags | `users/{uid}/meta/tags.data` | AES-GCM-256 avec la DEK |
| Date de la dernière sauvegarde (2026-11-04) | `users/{uid}/meta/backup.data` | AES-GCM-256 avec la DEK |
| DEK (clé de données) | Firestore, sous forme emballée (2 copies) ; une 3e sur l'appareil si Face ID est activé ; en clair seulement en mémoire, non extractible | Emballée par la KEK (mot de passe), par la clé de récupération, et par la clé de Face ID |
| Mot de passe | Jamais stocké ni transmis | Seul un jeton dérivé est envoyé à Firebase Auth |
| Clé de récupération | Chez l'utilisateur, hors ligne | Affichée une seule fois à l'inscription |

**Restent visibles en clair** pour qui a accès à Firebase :
- l'email du compte et les uid ;
- les identifiants de documents (aléatoires) et le nombre de fiches ;
- la taille des chiffrés, la présence ou non d'une image ;
- les dates d'écriture tenues par Firestore ;
- `meta/version` : un aléa de 16 octets, sans contenu, changé à chaque écriture de fiche ;
- l'existence de `meta/backup` et sa date d'écriture Firestore, donc le moment des exports (déjà visible par les
  lectures massives qu'ils provoquent).

**Sur l'appareil**, entre deux déconnexions : IndexedDB `stash-cache` garde les chiffrés `data` et `thumb` des fiches, le
jeton, l'uid et la date de remplissage. Ni clé, ni trousseau, ni image complète, ni donnée déchiffrée. Conservée au
verrouillage ; effacée quand la session se termine, à la déconnexion ou si elle est révoquée (constaté à la prochaine
ouverture si l'app est fermée). Qui lit le disque voit le nombre de fiches, leurs ids, la taille des chiffrés et la présence
d'une miniature, sans pouvoir les lire.

Limites de cette copie :
- un chiffré modifié échoue au déchiffrement et déclenche une relecture de Firestore, mais la copie n'est **pas authentifiée
  dans son ensemble** : une fiche retirée, ou un ancien chiffré valide de la même fiche, passe inaperçu ;
- les règles n'imposent pas de changer le jeton : une écriture qui ne le change pas (ancienne version de l'app, client
  modifié) reste invisible des autres appareils jusqu'à la relecture imposée après 7 jours, et le serveur peut rejouer un
  ancien jeton. Pendant ce temps, modifier une fiche périmée écrase sa version récente, et la purge de la corbeille à 30 jours
  se fonde sur la copie ;
- le jeton n'est pas chiffré parce que cela n'empêcherait pas ce rejeu.

Les sauvegardes sont toujours lues sur Firestore, jamais dans la copie.

**Face ID** (2026-11-04, si activé dans les paramètres) : `localStorage` `locket.faceId` garde l'uid, l'identifiant de la
clé d'accès et la DEK emballée par la clé de Face ID. Ni la sortie PRF ni la DEK en clair. Effacé à la déconnexion, au
changement de compte, à la désactivation, à l'adoption d'une clé et quand la copie n'ouvre plus le compte. La clé
d'accès « Stash » (une par activation, identifiant d'utilisateur aléatoire) vit dans le trousseau du système (iCloud
sur iPhone, synchronisée). La clé de Face ID exige trois éléments : la clé d'accès avec Face ID (ou le code de
l'appareil), la copie de l'appareil, et le poivre `faceIdPepper` du trousseau Firestore (32 octets aléatoires, sel
HKDF). Aucun ne suffit seul ; Firebase ne voit que le poivre. Un nouveau mot de passe retire le poivre : toutes les
copies, sur tous les appareils, cessent de s'ouvrir.

## 3. Chaîne de clés (résumé)

```
mot de passe + email normalisé (sel) ──PBKDF2-SHA-256, 600 000 itérations──► maître 256 bits
maître ──HKDF "locket/kek"──► KEK (emballe la DEK)
maître ──HKDF "locket/auth"──► jeton envoyé à Firebase Auth comme « mot de passe »
clé de récupération (256 bits aléatoires) ──HKDF "locket/recovery"──► KEK de récupération (2e emballage)
clé d'accès + Face ID ──WebAuthn prf, sel "locket/face-id/v1"──► 32 octets ──HKDF "locket/face-id", sel = poivre──► KEK de Face ID
                                       (poivre : faceIdPepper du trousseau ; 3e emballage, gardé sur l'appareil seulement)
DEK aléatoire AES-GCM-256 ──► chiffre chaque champ, IV aléatoire de 12 octets à chaque écriture,
                              AAD = "<id>/<champ>" (data, thumb, image), "meta/tags" ou "meta/collections"
sauvegarde v4 : manifeste chiffré par la DEK, AAD "backup/manifest" (compteurs, date, pièces écartées, SHA-256 de tout le contenu, trousseau compris)
sceau keyringCheck : SHA-256 de recoveryDek chiffré par la DEK, AAD "keyring/check", contrôlé au déverrouillage et à l'export
```

## 4. Attaquants et ce qu'ils obtiennent

| Attaquant | Ce qu'il obtient | Ce qu'il n'obtient pas | Mesures |
|---|---|---|---|
| **Accès aux données Firebase** (fuite, compte console compromis, Google) | Les chiffrés et les métadonnées de la section 2 ; il peut effacer ou remplacer des documents | Le contenu ; il ne peut pas déplacer un chiffré d'une fiche ou d'un champ à l'autre (AAD) | AES-GCM + AAD ; sauvegardes chiffrées hors ligne |
| **Même attaquant, attaque hors ligne** sur la DEK emballée | Peut tester des mots de passe à 600 000 itérations PBKDF2 chacun | Rien si le mot de passe est fort ; la clé de récupération (256 bits) est hors de portée | 12 caractères minimum ; PBKDF2 600k |
| **Vol du fichier de sauvegarde** | Comme ci-dessus, plus l'emballage **avec le mot de passe en vigueur au moment de l'export** | Le contenu sans ce mot de passe ou la clé de récupération | Fichier chiffré ; l'app n'exporte rien en clair, seul l'outil de lecture enregistre une page en clair, sur demande (§ 5) |
| **Écriture dans le dossier de l'outil de lecture** (dossier synchronisé ou partagé) | Remplacer `stash-dechiffrer.html` par une copie piégée qui envoie le secret saisi (une CSP se retire, une navigation passe) | Rien tant que l'outil n'est pas utilisé | Conseil sur la page Sauvegarde : ranger l'outil à part, hors dossier synchronisé ou partagé ; le retélécharger depuis Stash en cas de doute |
| **Contrôle de la boîte email** | Se connecter à Firebase par lien email, donc lire les chiffrés, et **effacer** ou corrompre les données | Le contenu sans le mot de passe : la récupération exige la clé, mais il lit `wrappedDek` et peut tester des mots de passe hors ligne (ligne ci-dessus) | Récupération = lien + clé ; jamais `sendPasswordResetEmail` ; sauvegardes ; règles Firestore (types, emplacements, trousseau non supprimable) ; sceau de `recoveryDek` |
| **Script injecté dans la page** (XSS) | Pendant la session : utiliser la DEK pour tout déchiffrer et exfiltrer | — | CSP stricte (scripts du site et hash SvelteKit seulement) ; aucun `{@html}` ; liens limités à http(s). `connect-src` n'est pas une barrière de sortie : Firestore accepte aussi un projet tiers, et une navigation reste possible |
| **Dépendance npm compromise** (chaîne d'approvisionnement) | Tout : son code est servi par le site lui-même, la CSP ne l'arrête pas | — | Peu de dépendances, `package-lock.json`, `npm audit` (voir § 7) |
| **PC laissé déverrouillé** | Les fiches tant que la session est ouverte | Après le verrouillage auto : le contenu, qui exige le mot de passe. La session Firebase reste ouverte : il peut lire `wrappedDek` ou effacer via un client modifié | Verrouillage après inactivité (5 min par défaut) ; DEK en mémoire seulement ; mot de passe pour les actions destructrices de l'app |
| **Téléphone volé dont on connaît le code** (Face ID activé) | En ligne : déverrouiller Stash comme le propriétaire (iOS propose le code en secours de Face ID). En exécutant son propre JavaScript sur l'origine (Inspecteur web depuis un Mac), la **DEK brute, durablement** : elle ne change jamais | Hors ligne : rien, le poivre est dans Firestore. Rien non plus après un changement de mot de passe fait depuis un autre appareil (poivre retiré, sessions révoquées) | Option désactivée par défaut, mot de passe exigé pour l'activer, avertissement dans les paramètres. **Appareil perdu : changer de mot de passe au plus vite** |
| **Script injecté, Face ID activé** | En plus du XSS ci-dessus : avec un seul Face ID accepté (une invite qui paraît normale), la **DEK brute, durablement**, valable pour les données futures, même après un changement de mot de passe | — | Comme pour le XSS ; seule une recréation du compte (nouvelle DEK) répare |
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
- **Liens de sites** : au clic, le nom de la fiche (ou son terme propre) part en clair vers le site, comme tout lien
  ouvert. Rien n'est appelé à l'affichage. Le nom est encodé en entier ; un terme propre peut être un chemin
  (« / » gardés, « . » et « .. » retirés) ou une adresse du même domaine. Le domaine du modèle reste fixe : une fiche ne
  peut pas rediriger vers un autre site.
- **Fiches cachées** : un simple filtre d'affichage, propre à chaque appareil. Quiconque a la session ouverte clique sur
  « Cachées ». Le drapeau est chiffré avec la fiche.
- **Fiches illisibles** : la liste les signale et l'export les écarte en le disant. Une altération côté Firebase se voit
  donc, à la prochaine relecture de Firestore si l'appareil a une copie valide (l'export, lui, relit toujours), mais la fiche
  d'origine n'est récupérable que depuis une sauvegarde saine.
- **Corbeille** : une fiche supprimée reste 30 jours dans Firestore, chiffrée, et sa présence dans la corbeille n'est
  visible qu'après déchiffrement. La purge se fait à l'ouverture de l'app : sans ouverture, rien n'est effacé. Sur un PC
  laissé ouvert, vider la corbeille ne demande pas le mot de passe. Pour effacer tout de suite : « Vider la corbeille ».
- **Actions destructrices** (suppression totale, restauration, purge des fiches illisibles) : le mot de passe est
  contrôlé par l'app, pas par les règles Firestore. Il protège d'une fausse manœuvre ou d'un PC laissé ouvert, pas d'un
  client modifié disposant d'une session Firebase. Irréversible sans sauvegarde : le plan Spark n'en garde aucune.
- **Email de réinitialisation externe (confirmé le 2026-11-05, risque accepté)** : avec notre adresse et la clé API
  publique, un tiers déclenche un vrai email `PASSWORD_RESET` de Firebase (`accounts:sendOobCode`), que l'app n'utilise
  jamais. Y saisir son vrai mot de passe l'enverrait à Firebase, qui détient aussi `wrappedDek`. Aucune parade sur le
  plan Spark : ni le message du modèle ni l'URL d'action ne sont modifiables. **Ne jamais suivre un tel email** : passer
  par « Mot de passe oublié » dans l'app, qui le rappelle sur ses pages Connexion et Mot de passe oublié.
- **Rotation limitée** : remplacer la clé de récupération protège Firestore, pas les sauvegardes ni les copies déjà
  faites, que l'ancienne clé ouvre encore. Changer de mot de passe ne change pas la DEK : un ancien `wrappedDek` copié
  reste ouvrable avec l'ancien mot de passe. Après une compromission grave, seule une recréation du compte suffit.
- **Sceau de `recoveryDek`** : posé à l'inscription, à chaque nouvelle clé de récupération, et repris d'un fichier lors
  d'une adoption : il détecte un remplacement ultérieur, pas une valeur déjà mauvaise à ce moment-là. Un sceau absent
  est signalé comme un remplacement, jamais reposé automatiquement (depuis le 2026-11-03), et les règles empêchent de le
  retirer.
- **Modèle d'import en clair** : « Partir de mes fiches » (import d'un tableau) met noms, pays, années, notes et tags
  de la collection en clair dans la zone de texte, puis dans le presse-papiers ou un tableur si on les y copie, où ils
  peuvent être synchronisés. Sortie en clair voulue et signalée sur la page ; rien n'est envoyé par l'app. L'autre
  sortie en clair est la page enregistrée par l'outil de lecture (ci-dessous).
- **Outil de lecture d'une sauvegarde** (2026-11-04, `src/tools/decrypt/`, `build/stash-dechiffrer.html`) : un fichier
  autonome qui ouvre une sauvegarde avec la clé de récupération, ou l'email et le mot de passe de l'époque, hors ligne
  et sans Firebase. Sa CSP (dans le fichier) : `default-src 'none'`, script et style par empreinte, images `blob:` et
  `data:`, `connect-src blob:` seulement (Chrome contrôle par `connect-src` une image `blob:` d'une page `file://`) :
  aucun réseau. Il est servi par Hosting, comme l'app : un fichier téléchargé une fois et gardé avec les sauvegardes ne
  dépend plus du serveur, un fichier retéléchargé lui fait confiance (première limite ci-dessus) ; un fichier gardé
  peut en revanche être remplacé par qui écrit dans son dossier (§ 4). Hosting le sert en téléchargement
  (`Content-Disposition: attachment`) : il ne s'exécute jamais sur l'origine de l'app, dont il partagerait IndexedDB
  et `localStorage` ; absent du build, il donne une 404 plutôt que l'app, et le déploiement s'arrête. Le build échoue
  si la CSP n'a pas été posée. Préchargement DNS coupé (`x-dns-prefetch-control`), dans l'outil et la page en clair :
  les domaines des liens ne sont résolus qu'au clic. Le mot de passe est pris tel quel, comme dans l'app. Date
  affichée : celle du manifeste, authentique ; illisible, celle du fichier, marquée « non vérifiée ». À l'inverse de la
  restauration, un fichier altéré est lu quand même, défauts signalés en tête : on récupère ce qui est lisible. La DEK
  y est non extractible. Ne marche pas sur iPhone (un `.html` local n'y exécute pas de script).
- **Page en clair** de l'outil : sur action volontaire, après un avertissement, la vue affichée est enregistrée en
  `.html` **sans aucun script** (CSP : son style par empreinte, images `data:`), miniatures ou images complètes au
  choix. Quiconque obtient ce fichier lit tout, sans secret : à garder en lieu sûr et à supprimer après usage.
- **Écrasement entre appareils** (corrigé le 2026-11-04, `stale.ts`) : une écriture part de la copie en mémoire. Elle
  est refusée si un autre appareil a écrit depuis le chargement : jeton `meta/version` comparé dans la transaction de
  chaque écriture de fiche (fiche, action groupée, import, Tagger), IV du catalogue comparé dans celle de chaque
  réécriture des tags ou des collections. Les données sont alors relues et l'utilisateur recommence. Restauration et
  suppression totale ne contrôlent pas : elles remplacent tout volontairement. Reste : le jeton est global, une écriture
  sur une autre fiche suffit à refuser (faux conflit, sans perte) ; et un client qui ne change pas le jeton (ancienne
  version de l'app, client modifié) n'est pas vu, comme pour le cache (§ 3).
- **Face ID** (2026-11-04) : le niveau de protection devient celui du verrouillage du téléphone, et la DEK devient
  extractible pour du code qui s'exécute sur l'origine avec un Face ID accepté (§ 4). Une adoption de clé remplace le
  trousseau, poivre compris : les copies d'avant ne s'ouvrent plus. Défense en plus : après Face ID, la DEK doit
  ouvrir le sceau `keyringCheck` ; sinon la copie est effacée et le mot de passe redemandé (un sceau retiré ou remplacé
  désactive donc aussi Face ID, sans danger). Un poivre remis en arrière avec un ancien sceau relève du « retour en
  arrière non détecté » ci-dessus. Changer de clé de récupération ne touche pas Face ID. Désactiver laisse la clé
  d'accès dans le trousseau, sans usage (à supprimer à la main) ; chaque activation en crée une nouvelle.
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
- [x] Dependabot : `.github/dependabot.yml`, mises à jour npm proposées chaque semaine.
- [x] [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) et
      [securityheaders.com](https://securityheaders.com) sur https://locket-403b5.web.app : voir le journal (§ 7).
- [x] OWASP ZAP, scan « baseline » (passif) du site en ligne : voir le journal (§ 7).
- [x] Tests des règles Firestore contre les émulateurs : autre compte et sans compte, lecture, liste, écriture et
      suppression sur chaque emplacement ; types, champs et emplacements refusés (`repository.emulator.test.ts`).
- [ ] `/security-review` ou l'agent `security-reviewer` (`.claude/agents/`) avant chaque changement de crypto ou d'auth.
      Utile, mais pas indépendant.

**Refaire les scans** (après un déploiement, sans compte, sans jamais saisir d'identifiants) :

1. [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) : saisir `locket-403b5.web.app`.
2. [securityheaders.com](https://securityheaders.com) : saisir `https://locket-403b5.web.app`, cocher « Hide results ».
3. OWASP ZAP, avec Docker Desktop lancé (10 à 15 minutes, plus le premier téléchargement de l'image) :

   ```sh
   docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://locket-403b5.web.app
   ```

   Lire le total final et les lignes `FAIL-NEW` et `WARN-NEW`. Ce scan est passif et ne dépasse pas la page de connexion.
   Ne pas utiliser le bouton « Automated Scan » de l'application ZAP : il peut lancer de vraies attaques.

Résultats attendus et avertissements déjà triés : voir le journal (§ 7). Y ajouter une ligne à chaque nouveau scan.

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
| 2026-10-30 | Agent `security-reviewer` (revue statique, non indépendante) | Aucun accès au contenu en clair trouvé. Corrigés : miniature abîmée qui rendait la fiche illisible, catalogue altéré bloquant liste et export, restauration et purge sans mot de passe, export incomplet présenté comme complet, empreinte sans longueurs, images orphelines, règles Firestore sans contrôle, absence de rotation et de sceau de `recoveryDek`. Restent ouverts : TLS du poste Windows et email de réinitialisation externe (`AUDIT.md`). |
| 2026-10-30 | OWASP ZAP baseline (passif, sans connexion) | 0 FAIL, 62 PASS, 6 WARN, aucun exploitable. « Dangerous JS Functions » : faux positif, vérifié dans le bundle, c'est une méthode nommée `eval` d'un moteur de regex embarqué ; aucun vrai `eval`, `new Function` ni `{@html}`, et la CSP interdit `unsafe-eval`. `innerHTML` n'apparaît que dans les gabarits statiques du runtime Svelte. Cache : voulu (`immutable` pour les fichiers versionnés). Timestamp, Modern Web Application : informatifs. COEP : écarté. |
| 2026-10-30 | Mozilla Observatory, securityheaders.com | **A+** aux deux : Observatory 125/100, 12 tests sur 12, CSP `<meta>` reconnue (`default-src 'self'`, pas de `unsafe`). `Cross-Origin-Opener-Policy: same-origin` ajouté ensuite. COEP et CORP écartés (non nécessaires, COEP pourrait gêner Firestore). SRI sans objet : tous les scripts viennent du site. |
| 2026-10-30 | Fichier de sauvegarde altéré à la main | Bug trouvé : seule la 1re fiche était vérifiée, le reste écrasait des fiches saines, et l'erreur vide de Web Crypto sous Chrome laissait le loader tourner. Corrigé : tout le fichier est déchiffré avant la première écriture, y compris pour l'adoption du trousseau. Le manifeste chiffré (format v3) couvre aussi les pièces retirées, les métadonnées et le trousseau, et le contrôle a lieu dès le choix du fichier. |
| 2026-11-03 | OWASP ZAP baseline (passif, sans connexion, après déploiement) | Identique au 2026-10-30 : 0 FAIL, 62 PASS, 6 WARN déjà triés, aucun exploitable. « Dangerous JS Functions » : revérifié dans le chunk en ligne, toujours la méthode `eval` du moteur de regex embarqué (aucun vrai `eval` ni `new Function`). Cache (`immutable` voulu), Timestamp, Modern Web Application : informatifs. COEP : écarté. |
| 2026-11-04 | Agent `security-reviewer` (revue statique, non indépendante) sur l'outil de lecture | Aucun accès au clair ni fuite de clé ; restauration toujours vérifiée en entier avant écriture, DEK non extractible dans l'outil, pas d'injection depuis une sauvegarde, page en clair sans script. Corrigés : mot de passe rogné par l'outil (un espace au bord l'empêchait d'ouvrir), CSP qui pouvait disparaître sans erreur de build, outil servi comme l'app s'il manquait ou exécutable sur l'origine de l'app, préchargement DNS des liens, date non authentifiée affichée, conseil de rangement (outil remplaçable dans un dossier synchronisé, § 4). |
| 2026-11-04 | Tests (outil de lecture) | Lecteur testé sur le témoin v4 (clé, mot de passe, mauvais secret, pièce altérée, fiche retirée) ; e2e de l'outil généré ouvert en `file://` : aucune erreur de CSP dans la console, page en clair sans `<script>` rouverte sans erreur ; bundle de l'outil sans Firebase. |
| 2026-11-04 | Agent `security-reviewer` (revue statique, non indépendante) sur Face ID | DEK non extractible au déverrouillage, sortie PRF ni gardée ni affichée, copie liée à l'uid et effacée à la déconnexion. Corrigés : copie ouvrable hors ligne sur un téléphone volé (poivre `faceIdPepper` dans le trousseau, retiré à chaque nouveau mot de passe), clé d'accès remplacée par l'activation d'un 2e appareil iCloud (identifiant d'utilisateur aléatoire), copie gardée après une adoption de clé, déverrouillage possible après une déconnexion pendant l'invite, docs qui sous-estimaient le XSS (DEK brute obtenue avec un Face ID accepté, § 4). Tests : e2e avec l'authentificateur virtuel PRF de Chrome (activation, réouverture, désactivation, nouveau mot de passe, déconnexion), règles du poivre sur émulateur. |
| 2026-11-03 | Mozilla Observatory, securityheaders.com (après déploiement) | **A+** aux deux : Observatory 135/100, 12 tests sur 12 (+10 depuis le 2026-10-30, grâce à `Cross-Origin-Opener-Policy: same-origin`). securityheaders : CSP d'en-tête (`frame-ancestors`, `object-src`, `base-uri`), Permissions-Policy, Referrer-Policy, HSTS preload, nosniff, COOP. Restent suggérés et écartés comme avant : SRI (scripts du même site), COEP et CORP. |
| 2026-11-03 | `npm audit`, bundle de prod, agent `security-reviewer` (revue statique, non indépendante) sur l'état de HEAD | `npm audit --omit=dev` : les 4 « high » gRPC déjà triées, rien de nouveau ; 29 autres dans les outils de dev seulement. Bundle : aucun code d'émulateur, CSP inchangée, pas de vrai `eval`. Revue : aucun accès au clair ni fuite de clé ; règles, cache IndexedDB, clés, sauvegarde, AAD/IV, nouveaux champs, import et CSP vérifiés. Corrigés : sceau de `recoveryDek` reposé quand il était absent (un accès en écriture pouvait faire sceller un `recoveryDek` remplacé ; désormais signalé, et les règles interdisent de le retirer), import interrompu qui recréait des doublons à la relance (liste relue, 2 000 lignes au plus), modèle d'import en clair non signalé (avertissement, § 5). Reste ouvert : écrasement entre appareils (§ 5, AUDIT.md). Scans en ligne à refaire après le prochain déploiement. |
| 2026-10-29 | Bundle de prod | Aucun code d'émulateur (`demo-locket`, `127.0.0.1`) ; CSP en `<meta>` avec le hash du script de démarrage vérifié. |
