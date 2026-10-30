/**
 * État de session, sur deux niveaux :
 *  - connecté : session Firebase, conservée par le SDK d'une ouverture à l'autre ;
 *  - déverrouillé : DEK en mémoire uniquement, perdue à la fermeture → écran « Déverrouiller ».
 */
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth } from '$lib/firebase';

// La DEK est rattachée à l'uid qui l'a déballée : un changement d'utilisateur la rend caduque
// sans dépendre de l'ordre d'arrivée des événements Firebase.
type Unlocked = { uid: string; dek: CryptoKey };

let user = $state.raw<User | null | undefined>(undefined); // undefined : pas encore connu
let unlocked = $state.raw<Unlocked | null>(null);
let recoveryDamaged = $state(false);

onAuthStateChanged(auth, (next) => {
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
	user = current;
	unlocked = { uid: current.uid, dek };
}

export function lock(): void {
	unlocked = null;
}

export async function signOut(): Promise<void> {
	unlocked = null;
	await firebaseSignOut(auth);
}
