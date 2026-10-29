# Audit et améliorations à faire

Revue du 2026-10-29, après la mise en ligne de la PWA. Cocher au fur et à mesure ; les décisions prises
vont dans [MEMORY.md](MEMORY.md).

## 1. Sécurité (avant un usage sérieux)

- [ ] **Fermer les inscriptions** : app personnelle (décidé le 2026-10-29). Sinon n'importe qui peut créer un compte
      et consommer le quota Firestore Spark (1 Go), sans voir nos données. Action console, voir plus bas. *Simple.*
- [x] **CSP stricte** (étape 7) : `kit.csp` en `<meta>` (hash du script de démarrage recalculé à chaque build),
      thème dans `static/theme.js`, `initializeAuth` sans module popup/redirection (pas d'iframe ni de script Google) ;
      `frame-ancestors`, `nosniff`, `no-referrer`, HSTS en en-têtes `firebase.json`.
- [x] **Code des émulateurs retiré du build de prod** (`import.meta.env.DEV`).
- [x] **Verrouillage automatique après inactivité** : réglable dans Paramètres, 5 min par défaut.
- [ ] **Console Firebase** : protection contre l'énumération d'emails, domaines autorisés (voir plus bas). *Simple.*
- [ ] **TLS du poste Windows** (reporté) : retirer `NODE_TLS_REJECT_UNAUTHORIZED=0` et `strict-ssl=false`,
      passer par `NODE_OPTIONS=--use-system-ca` (voir `CLAUDE.local.md`). *Simple.*

## 2. Confort

- [x] **Rappel de sauvegarde** — fait (bandeau sur la liste, « Plus tard » = 7 jours, par appareil) (« dernière sauvegarde il y a 30 jours ») : le plan Spark ne sauvegarde rien. *Simple.*
- [x] **Tri de la liste** — fait (mémorisé par appareil) : nom, création, modification (`createdAt` / `updatedAt` déjà stockés). *Simple.*
- [ ] ~~**Doublons à l'import**~~ : non retenu (2026-10-29).

## 3. Performance et finitions

- [x] **Alléger les icônes** — fait (palette 256 couleurs : cache initial 2,3 Mo → 1,2 Mo) : ~470 Ko par icône 512 px ; une passe de compression PNG les ramène vers 100 Ko
      (cache initial ~2,3 Mo → ~1,3 Mo). *Simple.*
- [x] **README en français** (étape 9) : configuration Firebase, lancement local, déploiement, installation iPhone. *Simple.*
- [ ] **Tests de bout en bout** (plus tard) (Playwright) : inscription, déverrouillage, récupération. *Intermédiaire.*

## Écarté

- Cache hors ligne des fiches : chiffré sur l'appareil + synchronisation, beaucoup de complexité pour peu de gain.
- Changement d'email : l'email sert de sel à la dérivation, il faudrait refaire tout le trousseau.
- Partage depuis Safari vers l'app : iOS ne le permet pas aux PWA (non retenu le 2026-10-29).

## Actions console Firebase (à faire à la main)

- [ ] Authentication > Paramètres > Actions des utilisateurs : décocher « Activer la création (inscription) ».
      Pour restaurer une sauvegarde dans un compte recréé, la réactiver le temps de l'inscription.
- [ ] Authentication > Paramètres > Protection contre l'énumération des adresses e-mail : activer.
- [ ] Authentication > Paramètres > Domaines autorisés : garder `locket-403b5.web.app` et `locket-403b5.firebaseapp.com`,
      retirer `localhost` (le dev passe par les émulateurs).
