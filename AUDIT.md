# Audit et améliorations à faire

Revue du 2026-10-29, après la mise en ligne de la PWA. Cocher au fur et à mesure ; les décisions prises
vont dans [MEMORY.md](MEMORY.md).

## 1. Sécurité (avant un usage sérieux)

- [ ] **Fermer les inscriptions** si l'app est personnelle : n'importe qui peut créer un compte et consommer
      le quota Firestore Spark (1 Go), sans voir nos données. Simple : règles limitées à notre uid ;
      plus propre : désactiver la création de comptes dans la console. *Simple.* Question ouverte : app pour moi seul ?
- [ ] **CSP stricte** dans `firebase.json` (étape 7) : hashes des scripts inline (SvelteKit + thème de `app.html`),
      `img-src 'self' blob:`, domaines Firebase. Principale barrière restante contre un script qui lirait la DEK. *Intermédiaire.*
- [ ] **Retirer le code des émulateurs du build de prod** (`emulatorRecoveryLink`, `connect*Emulator`) :
      inactif mais présent dans le bundle. *Simple.*
- [ ] **Verrouillage automatique après inactivité** (ex. 5 min, réglable dans Paramètres) : la DEK reste en mémoire
      tant que l'onglet est ouvert. *Simple.*
- [ ] **Console Firebase** : protection contre l'énumération d'emails, liste des domaines autorisés. *Simple.*
- [ ] **TLS du poste Windows** : retirer `NODE_TLS_REJECT_UNAUTHORIZED=0` et `strict-ssl=false`,
      passer par `NODE_OPTIONS=--use-system-ca` (voir `CLAUDE.local.md`). *Simple.*

## 2. Confort

- [ ] **Rappel de sauvegarde** (« dernière sauvegarde il y a 30 jours ») : le plan Spark ne sauvegarde rien. *Simple.*
- [ ] **Tri de la liste** : nom, création, modification (`createdAt` / `updatedAt` déjà stockés). *Simple.*
- [ ] **Doublons à l'import** : signaler les noms déjà présents. *Simple.*

## 3. Performance et finitions

- [ ] **Alléger les icônes** : ~470 Ko par icône 512 px ; une passe de compression PNG les ramène vers 100 Ko
      (cache initial ~2,3 Mo → ~1,3 Mo). *Simple.*
- [ ] **README en français** (étape 9) : configuration Firebase, lancement local, déploiement, installation iPhone. *Simple.*
- [ ] **Tests de bout en bout** (Playwright) : inscription, déverrouillage, récupération. *Intermédiaire.*

## Écarté

- Cache hors ligne des fiches : chiffré sur l'appareil + synchronisation, beaucoup de complexité pour peu de gain.
- Changement d'email : l'email sert de sel à la dérivation, il faudrait refaire tout le trousseau.
- Partage depuis Safari vers l'app : iOS ne le permet pas aux PWA.
