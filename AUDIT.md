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

### Fiches
- [x] **Copier le nom** de la fiche dans le presse-papiers (bouton sur la fiche). *Simple.*
- [x] **Supprimer : corbeille ou définitif**, au choix, sur la fiche et dans la sélection multiple (aujourd'hui toujours
      la corbeille ; le définitif n'existe que dans la page Corbeille). *Simple.*
- [x] **Import : lister les doublons ignorés** (leurs noms), pas seulement leur nombre. *Simple.*

### Sélection multiple
- [x] **« Tout » en bascule** : tout sélectionner, puis tout désélectionner ; état visible quand tout est sélectionné. *Simple.*
- [x] **Cartes sélectionnées** : bordure plus fine, ou espace entre les cartes pour qu'elles ne se collent pas. *Simple.*
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

- [ ] **Remarques libres** sur une fiche (« vu en 2024, tome 12 manquant… ») : texte dans `data` chiffré, rien à changer
      dans les règles ni le format de sauvegarde ; recherche de la liste dans ce texte en option. *Simple.*
- [ ] **Une fiche au hasard** : bouton avec une icône de dé, ouvre une fiche tirée parmi la liste filtrée. *Simple.*
- [ ] **Fiche vérifiée** : statut posé quand une fiche est finie, pour ne plus y revenir et la protéger des modifications.
      Un seul statut proposé (vérifiée = protégée) plutôt que « vérifiée » et « verrouillée » séparés, à confirmer.
      Modifier une fiche vérifiée demande une confirmation ; les actions groupées la laissent de côté ou préviennent ;
      repère sur la carte et filtre « à vérifier / vérifiées ». Garde-fou contre l'erreur, pas une protection de
      sécurité (comme « Cachée »). *Simple à intermédiaire.*
- [ ] **Annuler la dernière action groupée** (tags, corbeille, collection…) : bandeau « Annuler » une dizaine de
      secondes, état précédent des fiches touchées en mémoire, effacé au verrouillage (`onLock`), réécrit par
      `commitEntries` (conflit d'un autre appareil : refus et message, comme `stale.ts`). Après « Fiche vérifiée », pour
      couvrir son comportement dans les actions groupées. *Intermédiaire.*
- [ ] **Recadrer et pivoter l'image** avant l'enregistrement : cadre à déplacer (tactile), rotation par quart de tour,
      sur le canvas déjà utilisé pour le redimensionnement, sans bibliothèque. Choix du cadrage de la miniature à
      étudier en même temps (images « coupées » sur les cartes). *Intermédiaire.*

## À décider ou plus tard

- [x] **Déverrouillage par Face ID** — fait le 2026-11-04 : WebAuthn PRF, 3e copie de la DEK sur l'appareil, poivre dans
      le trousseau, repli sur le mot de passe, relu par le security-reviewer (voir [SECURITY.md](SECURITY.md)). *Avancé.*
- [ ] **Plusieurs images par fiche** (idée du 2026-11-05, gardée pour plus tard) : un document Firestore par image,
      règles, sauvegarde (format v5 et nouveau témoin), corbeille et cache à reprendre. *Avancé.*
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

## Actions console Firebase (à faire à la main)

- [x] Authentication > Paramètres > Actions des utilisateurs : décocher « Activer la création (inscription) ».
      Pour restaurer une sauvegarde dans un compte recréé, la réactiver le temps de l'inscription.
- [x] Authentication > Paramètres > Protection contre l'énumération des adresses e-mail : activer.
- [x] Authentication > Paramètres > Domaines autorisés : garder `locket-403b5.web.app` et `locket-403b5.firebaseapp.com`,
      retirer `localhost` (le dev passe par les émulateurs).
