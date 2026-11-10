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
| Sauvegarde | Fichier JSON `stash-sauvegarde-AAAA-MM-JJ.json` : documents tels quels (chiffrés, base64), trousseau (2 copies emballées de la DEK), catalogues de collections et de tags ; images facultatives. **Format v5** (2026-11-06) : autres images des fiches (`gallery`). **Format v4** : ajoute un manifeste chiffré (compteurs, date, pièces illisibles écartées à l'export, empreinte de tout le contenu avec longueurs, trousseau compris), contrôlé dès le choix du fichier et avant toute écriture (2026-10-30). Compteurs dans le manifeste et non dans un en-tête en clair : falsifiable, et il révélerait le nombre de collections et de tags. Les versions précédentes sont refusées : l'app n'est pas encore en usage réel, aucun fichier n'est à conserver (2026-10-30). **Restauration = remplacement complet** : le fichier est la source de vérité, ce qui en est absent est supprimé, après une case de confirmation et le mot de passe ; une fusion ferait revenir des tags retirés et garderait des fiches supprimées (2026-10-30). Sauvegarde sans images : les images des fiches conservées restent en place. Pas d'export en clair (refusé le 2026-10-29) | Le plan Spark n'a pas de sauvegarde Firestore ; le fichier est illisible sans mot de passe ou clé de récupération |
| Restauration | Même DEK : remplacement complet (voir Sauvegarde). DEK différente (compte recréé, décidé le 2026-10-29) : compte **vide** obligatoire, mot de passe actuel vérifié avant toute écriture, ancienne DEK déballée par l'ancien mot de passe (même email) ou l'ancienne clé de récupération, puis adoptée ; **l'ancienne clé de récupération redevient la bonne** (choix utilisateur). Ids validés (`[A-Za-z0-9_-]{1,64}`) | Seul filet de sécurité en cas de perte du compte. Compte vide : ses fiches (autre DEK) deviendraient illisibles |
| Image | Facultative ; WebP avec repli JPEG | Safari iOS n'encode pas toujours le WebP via canvas |
| Hors ligne | Pas de lecture hors ligne : le jeton `meta/version` est toujours lu sur Firestore ; seule l'app est mise en cache | Simplicité |
| Cache des fiches (2026-11-02) | Copie IndexedDB des chiffrés (`cache.ts`, sans image complète), gardée au verrouillage, effacée à la déconnexion. `commitEntries` change l'aléa `meta/version` dans la transaction de chaque écriture de fiche ; jeton identique au déverrouillage = pas de téléchargement, sinon rechargement complet ; relecture imposée après 7 jours. Le jeton lu au chargement sert aussi à refuser une écriture si un autre appareil a écrit depuis (2026-11-04, `stale.ts`). Catalogues hors cache (petits, relus à chaque fois) | Évite de retélécharger toutes les miniatures. Aléa plutôt que date : pas d'horloge à croire. Transaction : le jeton lu prouve qu'aucun autre appareil n'a écrit, sinon la copie ne suit pas. Copie indéchiffrable = relecture Firestore, jamais « fiche illisible » (sa suppression agirait sur le serveur). Mise à jour fiche par fiche écartée : il faudrait une date en clair et des marques de suppression |
| SvelteKit | Version 2 | `@vite-pwa/sveltekit` 1.1 ne supporte pas Kit 3 |
| Node | ≥ 24.12 | Exigé par `firebase` 13 |
| Projet Firebase | `locket-403b5` ; émulateurs sous `demo-locket` | En local, aucun appel au vrai projet |
| Trousseau | Un document `users/{uid}` = `{ wrappedDek, recoveryDek }`, chacun `{ iv, data }` en `Bytes` | Une seule lecture pour se connecter, déverrouiller ou récupérer |
| Mot de passe | 12 caractères minimum | Seul rempart contre une attaque hors ligne sur `wrappedDek` |
| Session (code) | DEK rattachée à l'uid (`session.svelte.ts`) | Pas de course avec `onAuthStateChanged` lors d'un changement d'utilisateur |
| Changement de mot de passe | Réauthentification → Firestore → `updatePassword` ; si ce dernier échoue, l'ancienne `wrappedDek` est remise | Garder Auth et trousseau cohérents ; la clé de récupération reste le filet de sécurité |
| Récupération (code) | 2 étapes sur `/action` : connexion par le lien **toujours**, même si une session existe déjà (`updatePassword` exige une connexion récente, quelques minutes ; bug constaté en ligne le 2026-10-29), email redemandé s'il est ouvert dans un autre navigateur ; puis clé + nouveau mot de passe. Clé fausse → rien n'est modifié, on réessaie sans nouveau lien. Lien pour un email sans compte → le compte créé par Firebase est supprimé | Le lien est à usage unique ; sur iPhone il s'ouvre dans Safari, pas dans la PWA |
| Inscription ratée | Si l'écriture du trousseau échoue, le compte Auth est supprimé | Un compte sans trousseau est inutilisable |
| Fiches | `users/{uid}/entries/{id}` = `{ data, thumb? }`, `users/{uid}/images/{id}` = `{ image }` (couverture), `images/{id}_{n}` (autres images, n de 1 à 5, 2026-11-06 : voir `gallery.ts`), `images/{id}_t` (leurs vignettes en un bloc, pour le zoom et la bande de la fiche), chaque champ `{ iv, data }` en `Bytes` ; écrits/supprimés dans un même lot | Le SDK web lit les documents en entier : avec l'image dans la fiche, la liste téléchargerait toutes les images. Écart assumé au modèle du cahier des charges. Autres images à id dérivé plutôt qu'aléatoire : supprimer une fiche efface ses emplacements sans rien déchiffrer (pas d'orphelines), règles inchangées ; Firebase voit le nombre d'images par fiche |
| Contenu chiffré `data` | `{ name, links: [{ url, label? }], createdAt, updatedAt, imageType? }` | `imageType` sert à afficher image et miniature (WebP ou JPEG) |
| Liens | `http(s)` uniquement, `https://` ajouté si absent ; revalidés à l'affichage | Un lien `javascript:` exécuterait du code avec la DEK en mémoire |
| Images | Canvas : 1600 px / miniature 640 px qualité 0,75 ; qualité puis taille de l'image réduites par paliers jusqu'à < 900 Ko | Limite Firestore de 1 Mio par document ; 300 px était flou en cartes M et L sur téléphone. Paramètres > Régénérer les miniatures refait depuis l'image stockée celles sous 640 px (une lecture et une écriture par fiche), par lots de 25 ; WebP non refait sur Safari |
| Liste | Déchiffrée une fois par déverrouillage, mémoire vidée au verrouillage ; tri par nom ; recherche sans casse ni accents | Pas de rechargement de toutes les miniatures à chaque navigation |
| Préférences | Thème (auto/clair/sombre), ouverture des liens (nouvel onglet par défaut) taille des cartes S/M/L (M par défaut) et collection affichée (son id ; inconnue → la première) en `localStorage`, par appareil | Le bon réglage diffère entre PC et iPhone (PWA) ; rien de sensible |
| Interface | Tailwind CSS 4 + daisyUI 5 (thèmes `light`/`dark`, accent rouge bordeaux repris du logo), icônes SVG inline (`Icon.svelte`), composants `Field` et `ErrorAlert` | Rendu soigné sans JS tiers ni CDN : pur CSS généré au build, compatible CSP stricte. Pico jugé trop générique, Material trop lourd et peu adapté à iOS |
| Sites d'une collection | Dans `Collection.sites` (catalogue chiffré) : libellé, modèle d'URL avec `{{name}}` ou `{{nospace}}` (nom sans espaces, 2026-11-01), mode : *Toutes les fiches* / *Sur demande* (`optIn`) / *Inutilisé* (`enabled`). Géré dans `/sites` (« Liens », collection active avec sélecteur, comme `/tags`) depuis le 2026-11-03, plus dans `/collections`. La fiche ne stocke que ses exceptions, termes propres (`siteTerms`), sites masqués (`hiddenSites`, pour « toutes ») et sites activés (`shownSites`, pour « sur demande », 2026-10-31 : sites dont le lien n'est pas le nom) ; les deux listes sont gardées si le mode change ; **le lien est calculé à l'affichage**. Nom encodé en entier en `%20`/`%2F` (`+` n'est valable qu'en querystring) ; un terme propre peut être un chemin (« / » gardés, « . »/« .. » retirés) ou l'adresse d'une page du même domaine (2026-10-31). Les liens saisis restent pour les cas particuliers et se masquent aussi (`Link.hidden`) sans être perdus (2026-10-30) | Évite de retaper des liens de même forme ; un site qui change d'adresse se corrige en un seul endroit |
| Fiches cachées et illisibles | `EntryData.hidden` : absente de la liste sauf bouton « Cachées » (`prefs.showHidden`, par appareil), opacité réduite ; simple filtre. Fiche illisible (`data`) : signalée sur la liste, restaurer ou supprimer avec le mot de passe ; miniature abîmée : fiche affichée sans. Catalogue illisible : signalé, les fiches restent ; une collection inconnue est recréée en mémoire avec un nom provisoire (`withRecoveredCollections`), écrite à la prochaine modification. L'export écarte les pièces illisibles et l'inscrit au manifeste (2026-10-30) | Une donnée altérée ne bloque plus l'app ni l'export, et un fichier contenant une pièce illisible serait refusé en entier à la restauration |
| Corbeille et sélection multiple | `EntryData.deletedAt` : fiche absente de la liste et des compteurs, consultable dans `/trash`, supprimée pour de bon après 30 jours à l'ouverture de l'app. Sélection multiple sur la liste : cacher, tags, corbeille, sur les fiches affichées. Les deux passent par `patchStoredEntries`, qui ne réécrit que `data` (IV neuf) (2026-10-30). Une collection supprimée alors que sa corbeille n'est pas vide : les fiches restaurées arrivent dans une « Collection récupérée » | Une suppression n'est plus définitive ; pas de mot de passe pour cette raison |
| Clé de récupération | Remplaçable dans Paramètres avec le mot de passe (`rotateRecoveryKey`) ; la DEK ne change pas. `keyringCheck` (empreinte de `recoveryDek` chiffrée par la DEK) est contrôlé au déverrouillage et à l'export ; écart = alerte, une nouvelle clé répare (2026-10-30) | Une clé exposée n'était pas remplaçable, et un `recoveryDek` remplacé dans Firestore passait inaperçu jusqu'au jour où il servait |
| Règles Firestore | Propriétaire seulement, emplacements et champs fixes, chiffrés `Bytes` avec IV de 12 octets, `users/{uid}` non supprimable (2026-10-30) | Limite les dégâts d'une session compromise. À déployer : `firebase deploy --only firestore:rules` |
| Suppression totale | Paramètres > « Supprimer toutes les données » : fiches, images, collections, tags ; le compte et le trousseau restent. Confirmée par le mot de passe et le mot `SUPPRIMER` (2026-10-30) | Repartir de zéro ou restaurer sans recréer le compte. Le mot à taper évite qu'un mot de passe prérempli suffise |
| Import d'un tableau (2026-11-03) | `/entry/import` (`importTable.ts`, pur) : en-têtes obligatoires, seul « Nom » requis ; colonnes Pays (code ou nom français), Naissance, Note (0,5 à 5), une par catégorie de tags (+ « Autres tags »), valeurs par **libellé** (uniques dans la collection), plusieurs tags séparés par « , » ; séparateur « ; » (tabulation acceptée). Nom connu (sans casse ni accents) = mise à jour des cases remplies, inconnu = création ; case vide = gardée, `-` = effacée ; une colonne de catégorie ne touche que ses tags. Étape « Vérifier » : ajouts, modifications (avant → après), inchangées, erreurs par ligne ; **toute erreur bloque l'import**. « Partir de mes fiches » : modèle avec les fiches et leurs valeurs (aller-retour tableur). Lots de 400 écritures **Lignes en erreur laissées de côté (2026-11-03)** : jamais dans le plan (`failed`), « Importer sans les erreurs (n) » écrit les autres, puis la page liste les erreurs et « Corriger les lignes ignorées » remet l'en-tête et ces seules lignes (`rowsText`) ; dès l'aperçu, « Ne garder que les lignes en erreur » fait de même (utile quand tout le reste est inchangé) ; une erreur d'en-tête ou un tableau trop long bloque toujours tout (aucune ligne retenue). | Remplace l'import de noms (une liste avec la seule colonne Nom reste valable). Libellés plutôt qu'ids : lisibles, déjà uniques. Pas de création automatique de tags (une faute de frappe créerait un tag), ni liens / termes de site en V1. Un « ; » ou une « , » dans une valeur n'est pas échappable |
| Collections (2026-10-29) | Catalogue chiffré `users/{uid}/meta/collections` = `{ data }` (JSON `[{ id, name }]`, AAD `meta/collections`), **l'ordre du tableau est l'ordre d'affichage** (↑ ↓ dans `/collections`). Chaque fiche a **exactement une** collection (`collectionId` dans son `data` chiffré) ; on est **toujours** dans une collection (pas de vue « Toutes ») ; bascule par le menu du titre de la liste, qui donne aussi les pages de la collection active (2026-11-03) : Chercher des fiches, Index, Gérer les liens, Gérer les tags, Gérer le classement ; « Gérer les collections » seulement dans Paramètres. Liens, Tags et Classement : sélecteur de collection et retour « Paramètres » seulement avec `?from=settings`, sinon même en-tête que l'index (`CollectionHeader` : menu de la collection à gauche, « Mes fiches » à droite). « Importer » est dans l'en-tête de l'index, plus sur la recherche. Collection cachée (`hidden`, 2026-11-03) : absente du menu et des sélecteurs sauf `prefs.showHidden` (même préférence que les fiches, bouton « Afficher les cachées » dans le menu) ; au moins une reste visible. Suppression **seulement si vide** (la dernière comprise : retour à l'écran « Créez votre première collection »), ses tags avec elle. Changer une fiche de collection retire ses tags. Base vidée en prod pour l'occasion : pas de migration | Regroupement exclusif + changement de contexte (liste, recherche, tags, import), ce que les tags ne font pas. Mot « Thème » écarté : déjà pris par clair/sombre. Glisser-déposer écarté : capricieux sur iPhone |
| Tags | Catalogue chiffré `users/{uid}/meta/tags` = `{ data }` (JSON `[{ id, name, collectionId, groupId?, filter? }]`, AAD `meta/tags`) : **propres à chaque collection** (un même nom peut exister dans deux collections) ; **nom unique par catégorie** (2026-11-03 : « Action » dans Genre et dans Thème ; catégorie effective = la sienne si elle existe encore, `effectiveGroupId` ; changer de catégorie vers une catégorie qui a déjà ce nom est refusé) ; les fiches ne portent que `tagIds` (UUID) dans leur `data` chiffré. Admin `/tags` pour la collection active (sélecteur en haut) : ajout, renommage, catégorie, suppression. **Catégories (2026-11-03)** : `tagGroups?: [{ id, name }]` dans la collection (ordre choisi, ↑ ↓), `groupId?` facultatif sur le tag, sans exclusivité (0 ou n tags d'une catégorie par fiche) ; tags affichés et proposés par catégorie, les sans-catégorie (ou d'une catégorie supprimée, dont les tags restent) en dernier. Catalogues tags et collections : même code (`catalog.ts`). Filtre : **OU dans une catégorie, ET entre catégories** (les sans-catégorie en forment une ; remplace l'ancienne bascule OU / ET) ; avec des catégories, **facettes** (`TagFacets` : une pastille par catégorie, liste à cocher, résumé « Genre : Combat +1 ») et option **« Non renseigné »** par catégorie (aucun tag de la catégorie, en OU avec ses tags) ; création « Genre = Action, Drame », **une catégorie par ligne** (2026-11-03, `planTagGroups`, zone de texte, Ctrl/⌘ + Entrée) : catégories et tags d'un coup ; une catégorie existante suivie de tags est complétée (recoller une liste mise à jour), sans tags elle est refusée ; un tag **sans catégorie** du même nom y est rangé (ceux d'autres catégories restent) ; tout validé avant d'écrire, erreur avec le numéro de ligne ; « Supprimer toutes les catégories » (tags gardés, sans catégorie) et « Supprimer tous les tags » de la collection (catégories gardées), avec confirmation ; **recherche simple / avancée (2026-11-03)** : `TagGroup.filter` (absent = simple, `advanced`, `off` = hors filtre), réglé dans `/tags` ; bouton « Recherche avancée » de la liste (`listView.extended`, simple à chaque déverrouillage) pour proposer aussi les catégories avancées ; « Autres » toujours en simple ; **même niveau par tag (2026-11-04)** : `Tag.filter`, réglé dans `/tags`, appliqué à l'intérieur de sa catégorie (`filterableTags`) ; une catégorie dont aucun tag n'est proposé disparaît du filtre ; le bouton « Recherche avancée » apparaît dès qu'une catégorie ou un tag est avancé (`hasAdvancedFilter`) ; le choix des tags d'une fiche propose toujours tout ; une catégorie où quelque chose est coché reste visible (`facetShown`), pour ne jamais cacher un filtre actif ; « Tous » écarté (rien de plus que cocher les 3 à 5 tags, sens flou à l'ajout d'un tag). Pastille « Sans tag » exclusive ; aucun tag sélectionné = pas de filtre ; la recherche texte porte aussi sur les noms de tags | Rien en clair, aucune sémantique côté app. Renommer ou supprimer un tag ne réécrit pas les fiches (elles ne portent que l'id) : un id orphelin est ignoré à l'affichage et retiré à la prochaine modification |
| Liste (2026-10-30) | Filtres sous la recherche : pastille « Avec liens » (bascule), menus Note et Pays, puis tags. **Valeurs par défaut à chaque déverrouillage** : avec liens, toutes les notes, tous les pays, aucun tag, **tri aléatoire** ; gardées pendant la session (`listView.svelte.ts`), le tri n'est plus mémorisé par appareil. « Avec liens » ignoré si aucune fiche de la collection n'a de lien. « Effacer » = tout afficher. Tri aléatoire : rang FNV-1a de « graine:id », graine par session (« Remélanger »). Cartes compactes par défaut (de haut en bas : drapeau + nom + bouton « copier le nom » toujours visible en S, M et L, image avec badges translucides en bas : note « ★ 4,5 » à gauche, rang à droite) ; un clic agrandit la carte au-dessus de la liste (`EntryZoom`, `<dialog>` animé par Web Animations à cause de la CSP) : nom, drapeau, copie, miniature, étoiles modifiables, rang, tags, liens, accès à la fiche, voisines par flèches, clavier ou glissement, fermeture par clic hors des boutons, Échap ou fond ; miniature seule, pour ne pas lire une image à chaque carte parcourue. Bascules « Tags » et « Liens » de la liste (2026-11-05, remplacent « Détails » et « Cartes détaillées ») : chacune à part, sur toutes les cartes, préférence retenue (`cardTags`, `cardLinks`) ; l'ancien `detailedCards` est repris en les deux. Paramètres : « Clic sur une carte » = Agrandir (défaut) ou Ouvrir la fiche (barre « Détails » pour agrandir, seulement s'il reste des tags ou des liens non affichés). Préférences : lecture pure dans `prefsStorage.ts`, clés inconnues retirées au chargement. Sélection : reste ouverte après chaque action (croix pour sortir) ; actions Cacher, Tags (ajouter, retirer, « Définir » = exactement ces tags), Liens (afficher, masquer, « Définir » = seulement ces sites), Supprimer (corbeille ou définitif) ; « Définir » sans rien coché devient « Retirer tous » / « Masquer tous » | Choix de l'utilisateur. Conséquence assumée : une fiche sans lien n'apparaît pas tant que « Avec liens » est actif |
| Nom unique (2026-10-30) | Pas deux fiches du même nom dans une collection (sans casse ni accents, `findSameName`), corbeille non comptée. Vérifié pendant la saisie (coche verte « Disponible » ou lien vers la fiche existante) et à l'enregistrement, côté client seulement : Firestore ne voit pas les noms | Une fiche restaurée dont le nom est repris reçoit la date et l'heure de restauration (« École (2026-10-30 21:45:12) », `restoredName`), signalé dans la corbeille ; les doublons existants restent modifiables tant que leur nom ne change pas |
| Note (2026-10-30) | `rating` de 1 à 10 dans le `data` chiffré = 5 étoiles par demi-étoile ; notée depuis la fiche (enregistrée aussitôt) ou le formulaire, retoucher la note l'efface ; filtres ★ 3+ / 4+ / 5 / « Sans note » (2026-11-04 : pastille à **choix unique** comme les autres filtres, `FacetDropdown single`, rien de choisi = toutes ; pas de choix multiple, les seuils « et plus » s'incluent), tri « note » (non notées à la fin) | Plus précis que 5 crans, même affichage. Composant daisyUI `rating` (masques SVG `data:`, déjà autorisés par la CSP) |
| Classement (2026-11-01) | Par collection, par duels d'images (`/ranking`) : la fiche à classer affronte le milieu de la plage encore possible (dichotomie, ~log2(n) duels), côté tiré au hasard, « Annuler le dernier choix », « Passer ». Stocké en **une liste d'ids** `Collection.ranking` (catalogue chiffré, une écriture par fiche classée) plutôt qu'un rang par fiche : le rang est calculé à l'affichage en ignorant corbeille, fiches déplacées et sans image, donc le décalage à la suppression ne réécrit rien et une fiche restaurée retrouve sa place ; les ids supprimés pour de bon sont oubliés à la prochaine écriture. Fiche sans image = non classée. Gestion dans `/ranking` (lien des Paramètres) : fiches dans l'ordre, lancement en chaîne, Reclasser, Retirer ; duels dans `/ranking/duel`, avec l'image complète (`FullImage`), une lecture Firestore par nouvelle image. Rang « #n » sur la carte, tri « classement », Reclasser et Retirer aussi sur la fiche. Les étoiles restent manuelles ; les dériver du rang est envisagé. **Relancer** (2026-11-02) : second tableau `Collection.rankingDraft` qui reçoit tous les duels ; le classement actuel reste affiché, le nouveau le remplace quand toutes les fiches y sont passées ou sur « Terminer maintenant » (les absentes redeviennent non classées) ; « Abandonner » le jette. « Supprimer le classement » vide les deux | Un rang par fiche obligerait à rechiffrer toutes les suivantes à chaque suppression ; l'Elo demande 10 à 20 duels par fiche |
| Fiches ressemblantes (2026-11-02) | Bouton « Similaires » du zoom : rangée de 10 vignettes au plus avec leur score, détail par critère pour la vignette affichée. Une vignette ouvre un **aperçu** (2026-11-03) : bandeau « ← fiche de départ », flèches limitées aux ressemblantes, fermer (croix, Échap, fond) ramène à la fiche de départ ; « Aller à cette fiche » quitte l'aperçu et les flèches reviennent aux résultats. Sur la fiche de départ, les flèches suivent toujours les résultats (avant : départ et ressemblantes mêlés, fermer laissait sur la ressemblante). Score local (`similar.ts`), sur la collection : image 35 % (moitié histogramme de couleurs, moitié composition, version 16 × 16 de la miniature), tags 35 %, mots du nom 15 %, pays 15 %, seuil 30 %. **Normalisation dynamique** (2026-11-02) : seuls comptent les critères renseignés des deux côtés, rapportés à leur poids ; il en faut au moins 50 % (image ou tags), sinon le nom et le pays seuls rapprocheraient toutes les fiches d'un pays | Rien ne sort du navigateur ; pas de reconnaissance de sujet ou de visage, il faudrait un modèle embarqué. Première version (8 × 8 pixel à pixel, nom toujours compté, tags comptés si un seul côté en avait) : aucun résultat sur 160 fiches. Empreintes en `WeakMap` sur les objets de la liste, perdues avec elle au verrouillage |
| Rôle des pages (2026-11-04) | « Mes fiches » (`/`, cartes, recherche, filtres) = **mode front**, pour consulter : pas d'action d'édition ajoutée sur les cartes (pas de crayon). L'**Index** (`/list`) = **mode backoffice**, pour compléter et corriger : crayon par ligne, « Il manque », import, comparaison, mode Tagger | Garder la grille légère ; les outils de saisie vont dans l'index |
| Index (2026-11-03) | Page `/list`, depuis le menu de la collection : toutes les fiches de la collection active en texte, par nom, groupées par initiale sans accent (« # » si le nom ne commence pas par une lettre, `groupByInitial`). Recherche sur le nom seul, remise à zéro à chaque visite ; pastille « A…Z » (lettres de séparation, cochée par défaut, `indexInitials`, 2026-11-03 : décochée = liste continue par nom) puis pastilles Pays / Tags / Liens mémorisées par appareil (`indexCountry`, `indexTags`, `indexLinks`, pays seul par défaut). Cachées selon `showHidden`. La fiche ouverte navigue dans l'index affiché Menu **« Il manque »** (2026-11-04, `missingFields`) : toutes / il manque une info / sans pays / sans naissance / sans image / sans tag d'une catégorie (catégories ayant des tags) ; la note ne compte pas (choix de l'utilisateur) ; ce qui manque est écrit sous chaque nom ; gardé pendant la session (`listView.indexMissing`) pour compléter les fiches une à une ; bascules **Miniature** et **Classement** (2026-11-04, `prefs.indexThumb` / `indexRank`, désactivées par défaut : miniature 40 px ou initiale, badge `#n` en largeur fixe pour aligner les noms) ; « Il manque » en **pastille à choix unique** (2026-11-04, « Il manque : Pays ») ; **crayon à côté du nom (2026-11-04)** : modification directe (`/entry/<id>/edit?from=list`, Annuler et Enregistrer ramènent à l'index), visible au survol sur ordinateur (`pointer-fine:opacity-0`), toujours au toucher ; la page de modification reprend le retour de la liste d'origine (`entryNav`), plus « Mes fiches » en dur. | Une page plutôt qu'un mode de la liste : la liste filtre par défaut (« Avec liens »), un index doit tout montrer |
| Mode Tagger (2026-11-04) | Bouton « Tagger » de l'index : file **figée au départ** (`tagging.svelte.ts`, ids seulement, en mémoire, vidée au verrouillage) = fiches affichées (recherche et « Il manque » compris) sans aucun tag, ou toutes avec « Sans <catégorie> » (il leur manque déjà un tag), ou toutes si aucune n'en manque (`tagQueue`). Page `/tagging` : fiche comme `/entry/[id]` (image, pays, âge) avec le choix des tags sur place ; « n / m », « x faites · y restantes », badge « Faite » ; Enregistrer, « Enregistrer et suivante » (prochaine non faite, après la fiche puis les sautées plus haut ; sans changement : marquée faite sans écriture ; la dernière : « Enregistrer et terminer », retour à l'index), précédente / suivante (boutons, ← →, glissement), Quitter ; changer de fiche ou quitter avec des tags non enregistrés ouvre une **modale** daisyUI (en bas sur téléphone) : Continuer la saisie / Abandonner / Enregistrer, puis l'action reprend ; pas de `confirm()` natif, qui dénote. Écriture par `changeEntriesTags(…, 'set')` (retire aussi les ids orphelins) | Supprime les 5 étapes ouvrir / modifier / enregistrer / retour / rechercher par fiche ; la file figée évite qu'une fiche taggée disparaisse de la navigation |
| Comparer une liste (2026-11-03) | `/list/compare`, bouton « Comparer » de l'index : noms collés un par ligne, comparés à la collection active (`compareNames`, clé `searchKey` : sans casse ni accents ; cachées comprises, corbeille exclue) ; absents gardés (doublons retirés, copiables d'un bouton), présents signalés avec un lien vers la fiche ; tri alphabétique par défaut, désactivable. Rien d'enregistré ni d'envoyé. En-tête des pages de collection : libellés des boutons masqués sous `sm`, pour garder le nom de la collection lisible à 320 px | Préparer un import ou vérifier une liste trouvée ailleurs sans créer de doublons |
| Saisie à la suite (2026-11-02) | Nouvelle fiche : bouton icône « Et une autre » (texte sur PC), formulaire remis à neuf dans la même collection | Icônes disquette pour ne pas charger la barre sur mobile |
| Navigation entre fiches (2026-11-02) | Contexte `entryNav.svelte.ts` en mémoire, vidé au verrouillage : la page d'origine enregistre ses ids (résultats filtrés et triés, ou classement), son adresse et sa position de défilement dans `beforeNavigate`. La fiche s'en sert pour le retour et pour précédente / suivante (boutons, flèches du clavier), sans boucle. Fiche hors de la liste (nouvelle fiche, lien direct, après verrouillage) : sa collection, par nom. Les flèches remplacent l'entrée d'historique | Une URL `?from=` aurait dû porter toute la liste de résultats ; le retour du navigateur ramène à la page d'origine, pas à chaque fiche parcourue |
| Pays (2026-10-30) | `country` = code ISO 3166-1 alpha-2, **un seul par fiche**, dans le `data` chiffré ; drapeau emoji calculé, nom français par `Intl.DisplayNames` ; saisie libre (code ou nom, sans accents) avec suggestions : pays déjà utilisés, puis favoris (FR ES DE IT GB UA RU PL BR CO AU), puis les autres ; « anglais » = Royaume-Uni (`GB`) ; reconnus aussi (2026-11-03, `resolveCountry`) : nom anglais (`Intl.DisplayNames` en), noms usuels absents d'Intl (`COUNTRY_ALIASES` : République tchèque, Angleterre, USA, Hollande, Birmanie, RDC…), sans casse, accents ni ponctuation ; filtre par pays **à choix multiple** (2026-11-04 : pastille à cocher comme les catégories de tags, `FacetDropdown`, pays en OU, « Sans pays » en option ; remis à zéro au changement de collection, comme les tags) | Tags propres à chaque collection : un pays en tag serait à recréer partout, sans drapeau. Windows affiche les drapeaux en lettres (FR) : une police de drapeaux (~80 Ko) reste possible |
| Année de naissance (2026-11-03) | `birthYear` (entier, 1000 à l'année en cours) dans le `data` chiffré, facultatif ; âge affiché = année en cours − année (âge atteint dans l'année), sur le zoom et la fiche, et dans l'index avec l'option « Âge » (`prefs.indexAge`) ; pas sur la carte, trop étroite | Date précise trop pénible à renseigner ; l'âge peut donc dépasser d'un an avant l'anniversaire. Pas de filtre ni de tri par âge pour l'instant |

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

## À faire plus tard

Retours d'usage regroupés dans [AUDIT.md](AUDIT.md), section 4 (2026-10-30).

## Council du 2026-11-04 : que faire ensuite ?

Cinq avis indépendants (contradicteur, premiers principes, expansionniste, regard extérieur, exécutant), relecture
croisée anonyme, synthèse. Verdict : **la fiabilité d'abord**, pas de gel total (le projet sert aussi à apprendre).
Ce qui écrit dans Firestore attend la protection contre l'écrasement ; ce qui ne fait que lire peut avancer.
Faits vérifiés : récupération et changement de mot de passe testés en e2e, images déjà réencodées sous 900 Ko,
restauration testée seulement dans le même compte.

- **Fiabilité** (retenue par l'utilisateur) :
  - [x] e2e de restauration dans un **compte neuf** (en test : inscriptions fermées en prod) : fait, autre email +
    ancienne clé de récupération, fiche, tag et image complète relus après verrouillage, ancienne clé redevenue la bonne
    (le cas « même email, ancien mot de passe » était déjà couvert par `backup.emulator.test.ts`) ;
  - [x] protection contre l'écrasement entre appareils, étendue aux tags, aux collections et aux actions groupées
    (fait : `stale.ts` ; fiches par le jeton `meta/version` lu au chargement, catalogues par leur IV ; refus, relecture
    sans vider l'affichage, message « Recommencez » ; jeton global, donc faux conflits possibles, sans perte) ;
  - [x] fichier de sauvegarde témoin dans les tests (régression du format) : `backup/fixtures/witness-v5.json` (v4 jusqu'au 2026-11-06), vraie
    sauvegarde exportée contre les émulateurs (compte jetable), relue par `witness.test.ts` (test unitaire, donc en CI) :
    mot de passe et clé de récupération, manifeste, catalogues, fiche, miniature, image, AAD. Changer le format = nouveau témoin ;
  - [x] taille des catalogues mesurée à 2 000 fiches (`catalogSize.test.ts`) : collections ~96 Ko avec 2 000 fiches
    classées deux fois (classement + relance), soit ~46 octets par fiche, plafond vers 19 000 fiches ; tags ~99 Ko pour
    500 tags, ~200 octets par tag, plafond vers 4 500. Pas de risque à l'échelle visée.
- **Quick wins** (lecture seule, retenus) :
  - [x] filtre actif résumé en clair (`describeFilter`) : ligne sous les filtres de « Mes fiches », un morceau par
    critère relié par « et », valeurs en « ou » (« Pays : Brésil ou Sans pays et Genre : Action ou Non renseigné ») ;
  - [x] suggestions de tags dans le Tagger, depuis les fiches ressemblantes (`suggestTags`) : jusqu'à 6 pastilles
    « + tag » au-dessus du choix, chaque tag pondéré par la somme des scores des fiches qui le portent ; calcul local
    (`findSimilar`, image, nom, pays), rien sans image ni tag de part et d'autre ;
  - [x] page Statistiques (`/stats`, menu de la collection, `stats.ts` pur et testé) : chiffres clés (fiches dont
    cachées, avec image, notées, classées, à compléter → index filtré « Il manque : Une info »), répartitions par
    étoiles, pays (12 premiers), décennie de naissance, couverture de chaque catégorie avec ses 5 tags les plus portés ;
    barres en `<progress>` (pas de style en ligne sous la CSP) ;
  - [x] date de dernière sauvegarde synchronisée (`lastBackup.ts`) : `meta/backup` = `{ data }`, `{ lastAt }` chiffré
    (AAD `meta/backup`), écrite après chaque export complet ; le rappel et la page Sauvegarde prennent la plus récente des
    dates (appareil, partagée) ; « Plus tard » reste par appareil ; absente, illisible ou refusée = date de l'appareil.
    **Règles à déployer** (`firebase deploy --only firestore:rules`) : sinon l'écriture est refusée, sans bloquer l'export.
- **Chantiers** (plus tard) : audit section par section,
  lecture hors ligne (purge iOS d'IndexedDB
  et effacement du cache à la déconnexion à trancher avant).
- **Écarté ou gelé** : nouveaux filtres et tris, classement par tag, améliorations des « similaires », ébauches
  créées depuis la comparaison ; niveaux de filtre par tag à réévaluer à l'usage.
- **À surveiller** : chaîne d'approvisionnement npm (un paquet compromis lit le clair), verrou SvelteKit 2 imposé par
  `@vite-pwa`, purge du stockage des PWA sur iOS, performances à quelques milliers de fiches.

## Rétrospective du 2026-11-04 : si c'était à refaire

À garder : crypto (PBKDF2 → HKDF, DEK emballée deux fois, AAD par emplacement), récupération par lien + clé, cache de
chiffrés, sauvegarde avec manifeste, CSP stricte et `cspGuard`, SPA + daisyUI ; sel = email et images dans Firestore
restent les seules options compatibles avec « gratuit et Firebase ne voit rien ».
À faire autrement :
- **Méthode** : petits commits au fil de l'eau ; CI avec émulateurs et e2e dès le départ ; format de données versionné
  et fichier témoin dès la première sauvegarde ; rôle des pages (front / backoffice) décidé tôt.
- **Architecture** : modules par domaine plutôt qu'un `model.ts` fourre-tout ; un seul point de remise à zéro au
  verrouillage ; une porte d'écriture unique avec détection de conflit pensée dès le début (version par document plutôt
  qu'un jeton global) ; classement dans son propre document plutôt que dans le catalogue des collections ; store
  séparant lecture et écriture.
- **Interface** : briques communes dès la 2e occurrence (confirmations, chargement de page, pastilles de filtre).
- **Tests** : logique en fonctions pures, e2e réservés aux parcours, découpés par page, avec des sélecteurs sans ambiguïté.
- **Produit** : commencer simple et attendre le besoin (les niveaux de filtre par catégorie et par tag en sont l'exemple).
Chantiers retenus (2026-11-04), un commit chacun, en factorisant ce qui sert plusieurs fois sans aller à l'extrême :
- [x] `onLock` central (`session.svelte.ts`) : store, filtres, navigation et Tagger s'y inscrivent ;
- [x] briques UI communes : `ConfirmInline` (alerte + action + Annuler, attente et erreur sur place ; collections,
  tags, catégories, classement, retrait du classement, corbeille) et `PageSpinner` (13 pages). Laissés à part : la
  suppression d'une fiche (deux choix) et la suppression totale (mot de passe), et les petits boutons des lignes
  (corbeille, sites) ; `loadEntries().catch(…)` non factorisé : une ligne, et `error` sert aussi aux actions de la page ;
- [x] `model.ts` découpé par domaine (788 → 165 lignes) : `types`, `text`, `sites`, `tags`, `countries`, `duels`,
  `docSize`, feuilles sans cycle, réexportées par `model.ts` (aucun import existant modifié) ;
- [x] e2e découpés par page (`e2e/*.spec.ts`), aides communes dans `e2e/helpers.ts` ;
- [x] CI avec émulateurs et e2e (job `e2e` de `ci.yml`, vert au premier run).
Restent notés, non lancés : porte d'écriture avec version par document, classement dans son propre document, store
séparant lecture et écriture.

## Outil de déchiffrement d'une sauvegarde : cadré et fait le 2026-11-04

But : une sauvegarde reste lisible sans Stash ni Firebase (sortie hors Firebase, chantier du council).
Plan validé. **Étape 1 faite** : noyau pur `backup/keyring.ts`, `backup/verify.ts` (`inspectBackup` → `integrityProblems` pour l'outil, `verifyBackup` pour la restauration), `backup/reader.ts`, testés sur le témoin. **Étape 2 faite** : outil dans `src/tools/decrypt/` (plutôt que `tools/`, pour la vérification des types et les tests), vue pure `backup/readerView.ts`, build `vite.decrypt.config.ts` (plugin `singleFile`, CSP par empreintes, `connect-src blob:` car Chrome contrôle une image blob: d'une page `file://` par connect-src), ~125 Ko ; `npm run build` le produit, le service worker l'exclut de sa navigation ; e2e `decrypt-tool.spec.ts` en `file://`. **Revue `security-reviewer` (2026-11-04)** : corrigés mot de passe rogné, CSP vérifiée au build et en e2e (requête bloquée), Hosting (404 si absent, `attachment`, `predeploy`), DNS prefetch coupé, date du manifeste, conseil de rangement ; non fait : afficher l'empreinte SHA-256 de l'outil pour la vérifier (à faire si l'outil circule). **Étape 4 faite** : SECURITY.md (§ 1, § 4, § 5 « Outil de lecture » et « Page en clair », journal), invariant de CLAUDE.md précisé, README. **Étape 3 faite** : section « Lire sans Stash » de la page Sauvegarde, lien `download` + `rel="external"` vers `/stash-dechiffrer.html`.

- **Choix de l'utilisateur** :
  - livraison : un **fichier `.html` autonome** (JS et CSS intégrés), qui marche hors ligne sur ordinateur
    (Chrome, Edge, Firefox) ; pas sur iPhone (un `.html` local n'y exécute pas de script), accepté ;
  - **export en clair** sur action volontaire : bouton « Enregistrer la page en clair » avec avertissement ;
  - contenu : fiches actives, **fiches cachées** et **collections cachées** (signalées), **corbeille** (section à
    part en fin de collection), **rang au classement** ;
  - intégrité en défaut : **avertir et afficher ce qui est lisible** (bandeau : fichier modifié, n pièces
    illisibles), à l'inverse de la restauration qui refuse.
- **Secret** : clé de récupération seule, ou email + mot de passe de l'époque (la KEK dérive des deux), comme
  `unwrapBackupDek`.
- **Architecture retenue** :
  1. Noyau pur partagé avec l'app, sans Firebase :
     - `backup/keyring.ts` (`unwrapBackupDek` sorti de `account.ts`) ;
     - `backup/verify.ts` (`encryptedParts`, `contentHash`, contrôle du manifeste, sortis de `backup.ts`) : la
       restauration et l'outil vérifient de la même façon ;
     - `backup/reader.ts` : `readBackup(backup, dek)` déchiffre tout ce qui est lisible, rend collections, tags,
       fiches (images) et la liste des problèmes d'intégrité au lieu de lever une erreur.
  2. Outil `tools/decrypt/` : petite app Svelte, Tailwind + daisyUI comme l'app, en français. Fichier, secret, puis
     vue par collection : image, liens (manuels et sites calculés par `entryLinks`), tags par catégorie, pays, âge,
     note, rang. CSP en `<meta>` **sans réseau** (`connect-src 'none'`, `img-src blob: data:`).
     Export en clair = copie de la vue affichée en `.html` statique **sans script**, images en `data:`, CSP sans script.
  3. Build : config Vite séparée, `npm run build` produit aussi `build/stash-dechiffrer.html` (servi par Hosting) ;
     intégration JS/CSS par un **petit plugin maison** (pas `vite-plugin-singlefile` : une dépendance de build de
     moins, voir « À surveiller »). Lien « Télécharger l'outil de lecture » sur la page Sauvegarde.
  4. Tests : unitaires du lecteur sur le témoin (`witness-v5.json`) (clé, mot de passe, fichier altéré) ; e2e Playwright qui ouvre
     le fichier généré en `file://`, charge le témoin, saisit la clé, vérifie « Fiche témoin » et l'export en clair.
  5. Docs : SECURITY.md (export en clair possible, seulement dans l'outil, sur action volontaire), invariant
     « jamais d'export en clair » de CLAUDE.md précisé, MEMORY.md.
- **Écarté** : JS pur sans Svelte (rendu à réécrire, style perdu) ; crypto dupliquée dans l'outil (deux définitions
  du format) ; page `/decrypt` dans l'app (dépend de Stash en ligne).
- **Découpage prévu** (un commit chacun) : extraction du noyau ; outil + build ; lien depuis la page Sauvegarde ;
  docs. Taille visée : 100 à 200 Ko.

## Ordre des prochains chantiers (proposé le 2026-11-04)

1. ~~Outil de déchiffrement d'une sauvegarde~~ : fait le 2026-11-04 (ci-dessus).
2. Page de test PRF jetable sur iPhone (WebAuthn, extension `prf`, dans la PWA installée) : une heure pour savoir si
   Face ID peut déverrouiller (clé dérivée par PRF qui emballe la DEK, comme la clé de récupération).
   **En place le 2026-11-04, à déployer et faire sur l'iPhone** : route `/prf-test`, lien « Test Face ID (temporaire) »
   dans Paramètres, identifiant de la clé de test dans `localStorage` (`locket.prfTest`, pas un secret). Rapport à
   copier depuis la page. Validée dans Chrome avec un authentificateur virtuel PRF (32 octets, stables).
   **Concluant sur iPhone le 2026-11-04** (iOS 18.7, PWA installée) : `prf` annoncée, sortie de 32 octets identique
   d'un essai à l'autre. Retirée avec le chantier Face ID.
3. ~~Face ID~~ : fait le 2026-11-04. Une clé d'accès et une copie par appareil : activation dans Paramètres (mot de
   passe), copie de la DEK emballée par la clé PRF dans `localStorage` (`locket.faceId`), jamais dans Firestore ; bouton
   sur l'écran Déverrouiller. Après revue : poivre `faceIdPepper` (32 octets, trousseau Firestore, sel HKDF) pour qu'un
   téléphone volé hors ligne n'en tire rien, retiré à chaque nouveau mot de passe (Face ID désactivé partout) ;
   identifiant d'utilisateur aléatoire (avec l'uid, un 2e appareil iCloud remplaçait la clé d'accès du 1er) ; sceau
   `keyringCheck` contrôlé en plus. Limite acceptée : une XSS ou un voleur qui exécute du JS avec un Face ID accepté
   obtient la DEK brute (SECURITY.md § 4). **Règles Firestore à déployer** (`faceIdPepper`), sinon l'activation est
   refusée. Écartée : copie dans Firestore. Mot de passe redemandé tous les 30 jours : écarté puis
   fait le 2026-11-06 (`passwordAt` dans la copie de l'appareil, remis à jour à chaque déverrouillage par mot de
   passe ; copie d'avant sans date = mot de passe demandé une fois).
   Page de test `/prf-test` retirée.
   Clé d'accès « Stash (test Face ID) » supprimée le 2026-11-05 (app Mots de passe sous iOS 18).
4. Lecture hors ligne : seulement sur besoin réel (proposé le 2026-11-04, en attente de la réponse de l'utilisateur).
   À trancher avant : purge iOS d'IndexedDB, effacement du cache à la déconnexion, Face ID qui lit le trousseau en
   ligne (déverrouillage hors ligne par mot de passe à prévoir).

**Reste à faire au 2026-11-04** (ordre proposé) : déployer les règles Firestore (`faceIdPepper`, sinon « Accès
refusé » à l'activation de Face ID) puis tester Face ID sur l'iPhone ; supprimer la clé d'accès « Stash (test Face
ID) » (fait le 2026-11-05) ; ~~test de l'email de réinitialisation externe~~ (fait le 2026-11-05 : faille confirmée,
acceptée, voir SECURITY.md § 5) ; scans en ligne à refaire après déploiement ;
plus tard : audit indépendant, empreinte SHA-256 de l'outil s'il circule ; ~~mot de passe tous les 30 jours avec
Face ID~~ (fait le 2026-11-06).

## Nouvelles fonctionnalités (retenues le 2026-11-05)

Détail dans [AUDIT.md](AUDIT.md) § 5. Ordre : remarques libres → fiche au hasard (icône dé) → fiche vérifiée →
annuler la dernière action groupée → recadrer et pivoter l'image (avec le cadrage de la carte) → bordure des cartes
par une catégorie de tags. **Toutes faites le 2026-11-05** (bordure redessinée en cadre à reflet et halo, appliquée
partout où la fiche a une image). Plusieurs images par fiche : faite le 2026-11-06 (ci-dessous).
Laissés de côté pour le moment (2026-11-05) : scans en ligne, lecture hors ligne, audit indépendant.

## Fait le 2026-11-06

- Révélations : même dévoilement flou/sombre pour tous les modes (sauf Éclat et Polaroïd), grattage fluide, rideau qui
  dévoile la carte ; sélection multiple = carte inclinée à reflet irisé (plus de cadre rouge).
- Bouton « remonter en haut » sur toutes les pages (après une demi-hauteur d'écran) ; clic sur la miniature de l'index.
- Plusieurs images par fiche : couverture + 5, vignettes en un bloc (`_t`) pour la fiche et le zoom,
  coller (bouton ou Ctrl+V), sauvegarde **format v5**. Revue `security-reviewer` faite, corrections appliquées.
  Le 2026-11-10 : un seul champ « Images » dans le formulaire (la première = couverture, ajout toujours à la suite).
  Le 2026-11-10 aussi : carrousel dans l'image (fiche et zoom) à la place de la bande de vignettes ; glisser sur
  l'image change d'image, ailleurs de fiche (`data-no-swipe` ne bloque plus que l'horizontal). Similaires : plus tard.
  Collage sur iPhone (2026-11-10) : le bouton « Coller » (`clipboard.read`) marche pour une capture d'écran, mais
  pour une image copiée depuis une page web Safari ne lui donne que son lien (`text/uri-list`) ; le collage natif
  (appui long, « Coller ») reçoit le fichier : d'où la zone en pointillés, vers laquelle le bouton renvoie. Bouton
  gardé (ordinateur, Android, captures). Télécharger le lien écarté (CSP ouverte à tout site, CORS, site tiers contacté).
  Ordre des images au glisser-déposer (2026-11-10, `sortable.ts`, sans bibliothèque) : souris dès 5 px, doigt après
  un appui immobile de 300 ms (sinon la page défile) ; déposée sur la couverture, une image la remplace (`makeCover`
  puis `moveTo`). Les flèches ← → restent pour le clavier. Carrousel : flèches rondes grises translucides sur l'image
  (`.carousel-arrow`) ; dans la fiche agrandie, les flèches de fiche descendent alors dans les coins du bas.
- Retour vers l'index ou le classement après un verrouillage (2026-11-10) : `onLock` efface les ids de `entryNav` mais
  garde le retour (page, libellé) pour la fiche ouverte et ses voisines ; flèches par nom jusqu'au retour à la liste.
  Les remises à zéro de `onLock` tournent hors suivi (`untrack`) : lire son propre état n'y boucle plus.
- Album de la collection (`/album`) : fiches face cachée par classement, découvertes au dé sans remise, ids découverts
  dans le catalogue chiffré des collections (`Collection.discovered`), fiche agrandie en lecture seule, remise à zéro.
  Dos des cartes au choix dans Paramètres (bordeaux nuit par défaut, papier ivoire, ardoise et or ; rouge vif rejeté).
- Face ID : mot de passe redemandé tous les 30 jours.
- ESLint (`npm run lint`, en CI) avec les invariants de sécurité en règles. Prettier écarté pour l'instant (AUDIT.md).
- Dependabot : seules les versions mineures et correctives de dev sont regroupées, chaque majeure a sa PR.
- **Vitrine et back-office séparés** : la recherche (« Mes fiches ») ne fait que montrer (cartes, filtres, carte
  agrandie avec Similaires et le dé, note) : plus de « + », de sélection, ni d'Ouvrir / Modifier dans le zoom ; un clic
  agrandit toujours (réglage « Clic sur une carte » retiré). L'index (`/list`) est le back-office : « + », sélection
  multiple et actions groupées, filtres de tags (à part de ceux de la recherche, `listView.indexTags`), présentation
  Liste (cases à cocher en sélection) ou Cartes (préférence `indexCards` ; un clic ouvre la fiche). Carte
  sélectionnée : liseré bordeaux de 3 px en plus de l'inclinaison.
  Index complété : filtres Note et Pays (à part, `indexRating` / `indexCountries`, choix partagés `RATING_CHOICES` et
  `countryChoices`) ; miniature à trois états (`indexThumb` : aucune / petite / grande à la taille d'une carte S, l'ancien
  booléen est repris) ; en sélection, les tags et sites défilent dans le bandeau (sinon le haut sortait de l'écran).

**Décisions et reports** :
- Autres images gardées à leur taille actuelle ; un script les réduira (1200 px) quand le quota Spark (1 Go)
  approchera la saturation (~550 fiches à 6 images).
- Durée des e2e en local (17 à 24 min, contre ~4,5 min en CI) : mise de côté. Exclusion Defender du dossier faite
  (−17 %) ; 3 workers sans gain (machine limitée par le CPU : PBKDF2, serveur Vite).
- Versions majeures en attente : SvelteKit 3 + adapter-static 4 + `@vite-pwa/sveltekit` 2 (qui lèverait peut-être le
  blocage noté dans CLAUDE.md) à essayer sur une branche ; TypeScript 7 bloqué tant que `svelte-check` ne le prend pas.
- Après le push : déployer le hosting, refaire une sauvegarde complète (v5).
