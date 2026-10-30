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
- [ ] **TLS du poste Windows** (en attente, signalé en priorité par la revue du 2026-10-30) : retirer
      `NODE_TLS_REJECT_UNAUTHORIZED=0` et `strict-ssl=false`, passer par `NODE_OPTIONS=--use-system-ca` (voir
      `CLAUDE.local.md`). Si un déploiement est parti de ce poste : `npm audit signatures`, refaire `firebase login`,
      `npm ci`, redéployer. *Simple.*
- [ ] **Email de réinitialisation externe** (en attente) : tester si un tiers peut le déclencher, et si le modèle d'email
      de la console peut porter un avertissement (voir [SECURITY.md](SECURITY.md) § 5). *Simple.*

- [ ] **Audit de sécurité réel** : plan en 3 niveaux et journal dans [SECURITY.md](SECURITY.md) (2026-10-29).

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
- [ ] **Note (étoiles)** : 1 à 5 étoiles avec demi-étoiles (stockée de 1 à 10, plus précis sans changer l'affichage),
      dans le `data` chiffré ; saisie sur la fiche, affichage sur la carte, filtre « au moins N étoiles », tri par note.
      *Intermédiaire.*
- [ ] **Pays** : champ dédié, un seul par fiche (voir « À décider »). *Intermédiaire.*

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
- [ ] **Couleur d'accent en thème clair** : un « violet bleu » est vu, une teinte plus foncée est souhaitée. Vérifié le
      2026-10-30 : l'accent calculé est bien le rouge bordeaux, thème forcé ou non ; aucune classe secondary/accent/info.
      Attendre une capture pour savoir où (version en cache sur l'iPhone ? fond rosé des cartes sans image ?). *Simple.*
- [x] **Mode sombre** : cases à cocher plutôt en blanc. *Simple.*

### À décider
- [x] **Pays d'une fiche** : décidé le 2026-10-30, **un seul pays**, champ dédié (code ISO, drapeau emoji calculé, nom
      français par `Intl.DisplayNames`, pays favoris en tête), filtre par pays. « Anglais » = Royaume-Uni (`GB`), pas d'Angleterre/Écosse/Galles à part (2026-10-30).

## À décider ou plus tard

- [ ] **Déverrouillage par Face ID** (plus tard) : WebAuthn PRF, 3e copie de la DEK, repli sur le mot de passe, relecture
      crypto indispensable. *Avancé.*
- [ ] **Lecture hors ligne** avec le cache Firestore (chiffrés seulement) : à réévaluer, comportement iPhone à vérifier. *Intermédiaire.*
- [ ] **Date de dernière sauvegarde** synchronisée entre appareils, chiffrée. *Simple.*

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
