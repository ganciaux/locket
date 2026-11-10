/**
 * État de session, sur deux niveaux :
 *  - connecté : session Firebase, conservée par le SDK d'une ouverture à l'autre ;
 *  - déverrouillé : DEK en mémoire uniquement, perdue à la fermeture → écran « Déverrouiller ».
 */
import { untrack } from 'svelte';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { clearCache } from '$lib/entries/cache';
import { auth } from '$lib/firebase';
import { forgetFaceId } from './faceId';

// La DEK est rattachée à l'uid qui l'a déballée : un changement d'utilisateur la rend caduque
// sans dépendre de l'ordre d'arrivée des événements Firebase.
type Unlocked = { uid: string; dek: CryptoKey };

let user = $state.raw<User | null | undefined>(undefined); // undefined : pas encore connu
let unlocked = $state.raw<Unlocked | null>(null);
let recoveryDamaged = $state(false);

onAuthStateChanged(auth, (next) => {
	// Aussi quand la session se termine sans `signOut` : révoquée depuis un autre appareil, par exemple.
	if (!next || (user && user.uid !== next.uid)) {
		clearCache();
		forgetFaceId();
	}
	user = next;
	if (unlocked && unlocked.uid !== next?.uid) unlocked = null;
});

export const session = {
	get ready() {
		return user !== undefined;
	},
	get user() {
		return user ?? null;
	},
	get dek() {
		return unlocked && unlocked.uid === user?.uid ? unlocked.dek : null;
	},
	/** La copie de la DEK liée à la clé de récupération ne correspond plus à son sceau : voir `checkRecoveryKey`. */
	get recoveryDamaged() {
		return recoveryDamaged;
	}
};

export function setRecoveryDamaged(damaged: boolean): void {
	recoveryDamaged = damaged;
}

/** Appelé juste après une connexion : on n'attend pas `onAuthStateChanged` pour connaître l'utilisateur. */
export function setUnlocked(current: User, dek: CryptoKey): void {
	// Déconnecté pendant l'opération (invite Face ID, dérivation) : rien à déverrouiller.
	if (auth.currentUser?.uid !== current.uid) return;
	user = current;
	unlocked = { uid: current.uid, dek };
}

export function lock(): void {
	unlocked = null;
}

/**
 * Seul point de remise à zéro au verrouillage (verrou, déconnexion, changement d'utilisateur) : tout état qui garde
 * des données déchiffrées, ou des identifiants qui en découlent, s'y inscrit, plutôt que de surveiller `session.dek`.
 * Appelé aussi au démarrage, encore verrouillé.
 */
const lockHandlers: (() => void)[] = [];

export function onLock(reset: () => void): void {
	lockHandlers.push(reset);
	if (!session.dek) reset();
}

$effect.root(() => {
	$effect(() => {
		// Hors suivi : une remise à zéro qui lit son propre état ne relance pas l'effet.
		if (!session.dek) untrack(() => lockHandlers.forEach((reset) => reset()));
	});
});

export async function signOut(): Promise<void> {
	unlocked = null;
	forgetFaceId();
	await clearCache();
	await firebaseSignOut(auth);
}
