# Audit et améliorations à faire

Revue du 2026-10-29, après la mise en ligne de la PWA. Cocher au fur et à mesure ; les décisions prises
vont dans [MEMORY.md](MEMORY.md).

## 1. Sécurité (avant un usage sérieux)

- [x] **Fermer les inscriptions** (fait le 2026-10-29, vérifié : `ADMIN_ONLY_OPERATION`) : app personnelle (décidé le 2026-10-29). Sinon n'importe qui peut créer un compte
      et consommer le quota Firestore Spark (1 Go), sans voir nos données. Action console, voir plus bas. *Simple.*
- [x] **CSP stricte** (étape 7) : `kit.csp` en `<meta>` (hash du script de démarrage recalculé à chaque build),
      thème dans `static/theme.js`, `initializeAuth` sans module popup/redirection (pas d'iframe ni de script Google) ;
      `frame-ancestors`, `nosniff`, `no-referrer`, HSTS en en-têtes `firebase.json`.
- [x] **Code des émulateurs retiré du build de prod** (`import.meta.env.DEV`).
- [x] **Verrouillage automatique après inactivité** : réglable dans Paramètres, 5 min par défaut.
- [x] **Console Firebase** (fait le 2026-10-29 ; énumération vérifiée : `INVALID_LOGIN_CREDENTIALS`) : protection contre l'énumération d'emails, domaines autorisés (voir plus bas). *Simple.*
- [x] **TLS du poste Windows** — fait le 2026-11-04 : vérification réactivée, sans `--use-system-ca` (le proxy
      n'intercepte pas) ; npm mis à jour (11.21.1), `npm audit signatures` : 1 062 signatures de registre et
      195 attestations vérifiées ; `firebase login` refait, `npm ci`, redéployé. Signalé en priorité par la revue du
      2026-10-30 : retirer
      `NODE_TLS_REJECT_UNAUTHORIZED=0` et `strict-ssl=false`, passer par `NODE_OPTIONS=--use-system-ca` (voir
      `CLAUDE.local.md`). Si un déploiement est parti de ce poste : `npm audit signatures`, refaire `firebase login`,
      `npm ci`, redéployer. *Simple.*
- [x] **Email de réinitialisation externe** — testé le 2026-11-05 : un tiers peut le déclencher, et le plan Spark ne
      permet de changer ni le message ni l'URL d'action. Risque connu et accepté (voir [SECURITY.md](SECURITY.md) § 5). *Simple.*

- [x] **Écrasement entre appareils** — fait le 2026-11-04 (`stale.ts`, catalogues compris) (revue du 2026-11-03, basse) : retenir le jeton `meta/version` lu au chargement et
      refuser une réécriture de `data` (fiche, action groupée, import) s'il a changé, puis relire la liste et demander de
      recommencer. Voir [SECURITY.md](SECURITY.md) § 5. *Intermédiaire.*
- [ ] **Audit de sécurité réel** : plan en 3 niveaux et journal dans [SECURITY.md](SECURITY.md) (2026-10-29).
- [ ] **Scans en ligne à refaire** (OWASP ZAP baseline, Mozilla Observatory, securityheaders.com) après le déploiement
      de l'outil de lecture et de Face ID (2026-11-04), résultat à noter dans le journal de [SECURITY.md](SECURITY.md). *Simple.*

## 2. Confort

- [x] **Rappel de sauvegarde** — fait (bandeau sur la liste, « Plus tard » = 7 jours, par appareil) (« dernière sauvegarde il y a 30 jours ») : le plan Spark ne sauvegarde rien. *Simple.*
- [x] **Tri de la liste** — fait (mémorisé par appareil) : nom, création, modification (`createdAt` / `updatedAt` déjà stockés). *Simple.*
- [ ] ~~**Doublons à l'import**~~ : non retenu (2026-10-29).

## 3. Performance et finitions

- [x] **Alléger les icônes** — fait (palette 256 couleurs : cache initial 2,3 Mo → 1,2 Mo) : ~470 Ko par icône 512 px ; une passe de compression PNG les ramène vers 100 Ko
      (cache initial ~2,3 Mo → ~1,3 Mo). *Simple.*
- [x] **README en français** (étape 9) : configuration Firebase, lancement local, déploiement, installation iPhone. *Simple.*
- [x] **Tests de bout en bout** (Playwright, `npm run test:e2e`) : inscription, déverrouillage, récupération, sites,
      masquages, fiches cachées, sauvegarde, suppression totale, restauration. *Intermédiaire.*

- [x] **Ordre des sites d'une collection** : boutons monter/descendre. *Simple.*
- [x] **Fiches illisibles** : la liste affiche les autres, signale le nombre et propose de restaurer ou de supprimer ;
      l'export écarte ce qui est illisible. *Simple.*
- [x] **Fiches cachées** : drapeau sur la fiche, bouton « Cachées » sur la liste (mémorisé par appareil). *Simple.*

- [x] **Tester la clé de récupération** dans Paramètres, sans rien modifier. *Simple.*
- [x] **Liens sur les cartes** : option d'affichage (repliés ou en pastilles), par appareil. *Simple.*
- [x] **Coller une image** dans le formulaire ; le glisser-déposer passe par le champ fichier. *Simple.*
- [x] **CI GitHub** : types, tests unitaires et build à chaque push et sur les propositions de Dependabot. *Simple.*

- [x] **Corbeille** : suppression réversible, purge après 30 jours à l'ouverture de l'app. *Intermédiaire.*
- [x] **Sélection multiple** : cacher, afficher, ajouter ou retirer des tags, mettre à la corbeille. *Intermédiaire.*

## 4. Retours d'usage (2026-10-30)

Liste reçue le 2026-10-30, fusionnée avec les points notés la veille dans MEMORY.md. Par thème, du plus simple au plus long.

### Liste et filtres
- [x] **Liens des cartes : déplier / replier tout** depuis la liste, en bascule ; le réglage de Paramètres reste la valeur
      par défaut. *Simple.*
- [x] **Filtre « avec liens / sans liens »**, à côté de « Sans tag ». *Simple.*
- [x] **Tri aléatoire** (« Tri : aléatoire ») : ordre mélangé une fois par ouverture de la liste, stable pendant qu'on
      filtre, avec un bouton pour remélanger. *Simple.*
- [x] **Compteur « n fiches sur m »** mal placé à gauche sur mobile (barre d'affichage à revoir avec le bouton
      « Cachées »). *Simple.*
- [x] **Note (étoiles)** : 1 à 5 étoiles avec demi-étoiles (stockée de 1 à 10, plus précis sans changer l'affichage),
      dans le `data` chiffré ; saisie sur la fiche, affichage sur la carte, filtre « au moins N étoiles », tri par note.
      *Intermédiaire.*
- [x] **Pays** : champ dédié, un seul par fiche (voir « À décider »). *Intermédiaire.*
- [x] **Revenir en haut** (2026-11-06) : bouton rond en bas à gauche (le « + » est à droite), sur toute page dès un
      demi-écran de défilement (liste, index, classement…), au-dessus d'un bandeau fixé (sélection, actions de la
      fiche : hauteur dans `dock.svelte.ts`). Anneau de progression dans la page. Remontée animée (`scrollTop.ts`) :
      accélère puis se pose, de 350 à 900 ms selon la distance, interrompue par un geste ; instantanée si le système
      réduit les animations. *Simple.*
- [x] **Index : la miniature ouvre la fiche**, comme le nom (2026-11-06 ; hors tabulation, le nom suffit au clavier). *Simple.*

### Fiches
- [x] **Copier le nom** de la fiche dans le presse-papiers (bouton sur la fiche). *Simple.*
- [x] **Supprimer : corbeille ou définitif**, au choix, sur la fiche et dans la sélection multiple (aujourd'hui toujours
      la corbeille ; le définitif n'existe que dans la page Corbeille). *Simple.*
- [x] **Import : lister les doublons ignorés** (leurs noms), pas seulement leur nombre. *Simple.*

### Sélection multiple
- [x] **« Tout » en bascule** : tout sélectionner, puis tout désélectionner ; état visible quand tout est sélectionné. *Simple.*
- [x] **Cartes sélectionnées** : bordure plus fine, ou espace entre les cartes pour qu'elles ne se collent pas. *Simple.*
      Le 2026-11-06, plus de cadre (confondu avec les bordures de catégorie) : la carte s'incline vers le lecteur,
      soulevée, avec un reflet irisé (`card-picked`, app.css ; pas d'inclinaison si le système réduit les animations).
- [x] **Liens des fiches sélectionnées** : précisé le 2026-10-30, c'est le filtre « avec / sans liens » et la bascule
      déplier / replier ci-dessus.

### Apparence
- [x] **Couleur d'accent en thème clair** : indigo quand « Clair » (ou « Sombre ») est forcé dans Paramètres. Cause
      (2026-10-30) : daisyUI déclare ses thèmes intégrés avec un sélecteur plus spécifique que nos thèmes du même nom ;
      corrigé par des règles hors `@layer` dans `app.css`, vérifié sur le build de production. *Simple.*
- [x] **Zone d'annonce SvelteKit** (trouvée en passant) : son attribut `style` était bloqué par la CSP, le titre de page
      pouvait s'afficher sous l'app ; style repris dans `app.css`. *Simple.*
- [x] **Mode sombre** : cases à cocher plutôt en blanc. *Simple.*

### À décider
- [x] **Pays d'une fiche** : décidé le 2026-10-30, **un seul pays**, champ dédié (code ISO, drapeau emoji calculé, nom
      français par `Intl.DisplayNames`, pays favoris en tête), filtre par pays. « Anglais » = Royaume-Uni (`GB`), pas d'Angleterre/Écosse/Galles à part (2026-10-30).

## 5. Nouvelles fonctionnalités (retenues le 2026-11-05)

Dans l'ordre de réalisation prévu.

- [x] **Remarques libres** sur une fiche — fait le 2026-11-05 : champ `remarks` dans `data` chiffré (2 000 caractères,
      lignes vides en trop retirées), sur la fiche et dans l'outil de lecture, trouvé par la recherche de « Mes fiches »
      (pas par l'index, qui cherche un nom). Règles et format de sauvegarde inchangés. *Simple.*
- [x] **Une fiche au hasard** — fait le 2026-11-05 : bouton dé dans la barre de « Mes fiches » (dès 2 résultats), tire
      parmi la liste filtrée, jamais deux fois la même de suite, ouvre comme un clic sur une carte (agrandie ou fiche). *Simple.*
      Révélation de la carte tirée (`reveal.ts`), trois modes au choix dans Paramètres › Affichage (2026-11-06) :
      Paquet (floue, elle tremble puis éclate), Retournement (de dos, elle se retourne), Éclat (elle surgit d'une lumière
      blanche), puis le 2026-11-06 Grattage (voile gris métallisé effacé d'un geste continu), Polaroïd (blanche, sépia, puis
      en couleurs), Chute (tombe cachée, rebondit), Tourbillon (tourne en grandissant), Rideau (velours rouge qui
      s'ouvre) ; ou au hasard (icône Remélanger à côté du titre, grise éteinte, rouge allumée : l'une des huit, jamais
      deux fois la même de suite), durée de 0,5 à 3 s, aperçu sur une carte d'exemple (bordure au choix) ; simple fondu
      si le système réduit les animations. Selon la rareté de la bordure : bronze +5 % de durée et 5 paillettes, argent
      +15 % et 9, or +30 % et 16 ; les autres couleurs restent sobres. Flou et assombrissement communs à toutes
      (flou 22 px, presque gris, assombri, qui se dissipe progressivement jusqu'à 90 % de l'animation, le nom suit la
      même courbe), séparés du mouvement propre à chaque mode ; sauf Éclat et Polaroïd, qui ont leur propre lumière.
- [x] **Fiche « Validée »** — fait le 2026-11-05 : `validatedAt` dans `data` chiffré, coche pâle juste avant le bouton copier
      (carte, zoom, fiche : même place partout, légère puisque presque toutes le seront), rosette « Validée le … » sur la
      fiche seulement, bouton Valider / Retirer la validation sur la fiche et dans la sélection. Protégée :
      confirmation avant le formulaire (qui garde la validation), note figée, actions groupées (tags, liens, cacher,
      supprimer) qui la laissent de côté en le signalant, Tagger qui la saute, import qui met sa ligne en erreur ;
      suppression depuis la fiche toujours possible, avec rappel. Filtre « Statut : À valider / Validées » sur « Mes fiches » et sur l'index (chacun le sien). Index : coche en bout de ligne, option d'affichage « Validées » (préférence, active par défaut). Garde-fou de
      l'app, pas une protection (les règles Firestore n'en savent rien). *Simple à intermédiaire.*
- [x] **Annuler la dernière action groupée** — fait le 2026-11-05 (`undo.ts` pur, `recordBulk` / `undoBulk` dans le
      store) : bandeau « Annuler » 10 secondes dans la barre de sélection (tags, liens, cacher, valider, corbeille ; pas
      la suppression définitive), retiré en quittant la sélection. Fiches d'avant et d'après en mémoire seulement,
      effacées au verrouillage (`clear`, inscrit à `onLock`) ; l'annulation réécrit l'état d'avant par `patchEntries`
      (un autre appareil qui a écrit : refus, comme `stale.ts`) et est refusée si une fiche a changé depuis dans l'app
      (objet différent : autre écriture, relecture). *Intermédiaire.*
- [x] **Recadrer et pivoter l'image** — fait le 2026-11-05 (`ImageEditor.svelte`, calcul pur dans `crop.ts`) : bouton
      « Recadrer ou pivoter » sous l'aperçu, sur une image choisie ou sur l'image enregistrée (déchiffrée), cadre SVG
      (attributs, pas de style en ligne : CSP) déplaçable et redimensionnable par ses coins, quart de tour à gauche ou à
      droite ; « Appliquer » remplace l'image (complète et miniature) à l'enregistrement de la fiche.
      Images « coupées » sur les cartes (2026-11-05) : la miniature garde ses proportions (640 px de grand côté), c'est
      la carte carrée (`object-cover`, centré) qui rogne à l'affichage. **Cadrage de la carte fait le 2026-11-05**
      (`framing.ts`, curseur Haut/Bas ou Gauche/Droite sous l'aperçu, carte, index, classement, similaires, outil de lecture) : une
      position de 0 à 100 sur l'axe qui dépasse, dans `data`, rendue par des classes fixes (CSP : pas de style en
      ligne) ; image et miniature intactes, le zoom montre toujours l'image entière. *Intermédiaire.*
- [x] **Bordure des cartes par une catégorie de tags** — fait le 2026-11-05 (`borders.ts`) : interrupteur « Bordure des
      cartes » sur une catégorie (une seule par collection), couleur par tag dans la liste des tags (or, argent, bronze,
      bleu, rouge, vert, noir ; le noir suit la couleur du texte pour rester visible en thème sombre). Redessinée le
      2026-11-05 en cadre de carte de collection (`[data-border]` dans app.css : dégradé à reflet pour les métaux, émail
      pour les couleurs, halo de la teinte), intérieur à l'élément (la grille ne bouge pas), sur la carte, le zoom, la
      fiche, le Tagger, les miniatures de l'index, du classement et des similaires, et les duels. Un seul tag de la catégorie par fiche : formulaire, Tagger et sélection (« Ajouter »
      remplace l'ancien), import (ligne en erreur) ; une fiche qui en porte deux prend le premier de la catégorie.
      Filtre, stats sans rien de plus. *Intermédiaire.*
      Constaté en test : deux choix de couleur à moins d'une seconde d'intervalle, la seconde écriture du catalogue est
      refusée (protection contre l'écrasement) ; erreur affichée, rien de perdu en dehors de ce choix. Idem pour les
      autres réglages des tags, à traiter si ça gêne à l'usage (file d'écritures du catalogue).
- [x] **Album** de la collection — fait le 2026-11-06 : page `/album` (menu de la collection, sous l'index). Toutes les
      fiches face cachée (cachées comprises, corbeille exclue), classées par rang puis par nom ; dos identique pour toutes
      (logo, sans bordure de rareté), au choix dans Paramètres › Affichage : Bordeaux nuit (défaut), Papier ivoire, Ardoise
      et or (`albumBack`, par appareil). Seule action : le dé (bouton flottant), qui tire une carte encore
      cachée ; elle se révèle dans la fiche agrandie (animation du tirage), qui en se refermant rejoint son emplacement, où
      la carte se retourne. Fiche agrandie en lecture seule (ni Ouvrir, ni Modifier, ni Similaires, note figée), « Tirer une
      autre carte » après un tirage. Progression « n / m », « Album complet », « Recommencer l'album » (confirmation).
      Découvertes dans le catalogue chiffré des collections (`Collection.discovered`, `album.ts`) : synchronisées, une
      écriture par tirage ; une fiche supprimée ou déplacée n'est plus comptée. *Intermédiaire.*

## À décider ou plus tard

- [x] **Déverrouillage par Face ID** — fait le 2026-11-04 : WebAuthn PRF, 3e copie de la DEK sur l'appareil, poivre dans
      le trousseau, repli sur le mot de passe, relu par le security-reviewer (voir [SECURITY.md](SECURITY.md)). *Avancé.*
- [x] **Plusieurs images par fiche** — fait le 2026-11-06 : 6 au plus (couverture + 5), les autres visibles sur la fiche
      et dans la fiche agrandie (carrousel dans l'image depuis le 2026-11-10 : glisser sur l'image change d'image, ailleurs de fiche ; points pour
      naviguer ; vignettes en attente, image complète chargée à l'approche). Formulaire : un seul champ « Images » depuis le 2026-11-10
      (la première est la couverture ; fichiers, glisser-déposer, bouton « Coller », Ctrl+V n'importe où ou zone de
      collage pour l'iPhone, toujours à la suite), ordre (‹ ›, avancer l'image 2 en fait la couverture, l'ancienne
      prend sa place ; cadrage remis au centre), retrait ; couverture retirée = la suivante la remplace. Changer de
      couverture : ajouter puis avancer, ou retirer l'ancienne. Recadrage et cadrage pour la couverture seulement. Stockage : `images/{id}_{n}`
      (n de 1 à 5, sans trou), mêmes règles Firestore que la couverture ; types dans `data.gallery` ; une image déplacée
      est rechiffrée (AAD liée à l'emplacement). Suppression (corbeille, définitive, totale, illisibles) : les six
      emplacements effacés sans rien déchiffrer, pas d'orphelines. Sauvegarde **format v5** (`gallery` par fiche, absente
      d'une sauvegarde légère), témoin `witness-v5.json`, outil de lecture (vignettes, export en clair avec les images
      complètes). Vignettes (~200 px, 5 à 10 Ko) toutes dans un document `images/{id}_t` (une lecture à l'ouverture du zoom ou de la fiche),
      refaites à chaque enregistrement de la galerie. Pas dans le cache local. Quota Spark : 1 Go stocké, soit ~550 fiches
      à 6 images de ~300 Ko ; à surveiller (console › Firestore › Utilisation), images à 1200 px si besoin (−40 %). *Avancé.*
- [ ] **Lecture hors ligne** avec le cache (chiffrés seulement) : seulement si un vrai besoin apparaît (métro, avion).
      À trancher avant : purge iOS du stockage, cache effacé à la déconnexion, Face ID qui lit le trousseau en ligne
      (il faudrait un déverrouillage hors ligne par mot de passe). *Intermédiaire.*
- [x] **Date de dernière sauvegarde** synchronisée entre appareils, chiffrée — fait (`lastBackup.ts`). *Simple.*

## Écarté

- Recherche dans toutes les collections : non retenue (2026-10-30).
- Lecture des anciens formats de sauvegarde : non retenue, une nouvelle sauvegarde est refaite à chaque changement de
  format (2026-10-30). Un fichier d'ancien format reste donc inutilisable après une mise à jour.
- Déplacer plusieurs fiches d'un coup : non retenu (2026-10-30).
- Changement d'email : l'email sert de sel à la dérivation, il faudrait refaire tout le trousseau.
- Partage depuis Safari vers l'app : iOS ne le permet pas aux PWA (non retenu le 2026-10-29).
- Prettier : le style est déjà homogène, un reformatage complet brouillerait `git blame` ; ESLint seul (2026-11-06).
  À revoir si le style dérive ou si d'autres personnes contribuent.

## Actions console Firebase (à faire à la main)

- [x] Authentication > Paramètres > Actions des utilisateurs : décocher « Activer la création (inscription) ».
      Pour restaurer une sauvegarde dans un compte recréé, la réactiver le temps de l'inscription.
- [x] Authentication > Paramètres > Protection contre l'énumération des adresses e-mail : activer.
- [x] Authentication > Paramètres > Domaines autorisés : garder `locket-403b5.web.app` et `locket-403b5.firebaseapp.com`,
      retirer `localhost` (le dev passe par les émulateurs).
