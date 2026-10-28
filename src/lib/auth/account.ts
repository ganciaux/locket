/**
 * Parcours de compte zero-knowledge. Firebase Auth ne reçoit que le jeton dérivé du mot de passe ;
 * Firestore ne stocke que la DEK emballée deux fois, dans `users/{uid}` :
 *   wrappedDek  : par la KEK du mot de passe (usage courant)
 *   recoveryDek : par la clé de récupération (mot de passe oublié)
 */
import {
	EmailAuthProvider,
	confirmPasswordReset,
	createUserWithEmailAndPassword,
	deleteUser,
	reauthenticateWithCredential,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	updatePassword,
	verifyPasswordResetCode,
	type User
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import {
	type Encrypted,
	deriveKeys,
	deriveRecoveryKek,
	generateDek,
	generateRecoveryKey,
	normalizeEmail,
	rewrapDek,
	unwrapDek,
	wrapDek
} from '$lib/crypto/crypto';
import { auth, db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import { setUnlocked } from './session.svelte';

export const MIN_PASSWORD_LENGTH = 12;

const WRONG_PASSWORD = 'Mot de passe incorrect.';
const WRONG_RECOVERY_KEY = 'Clé de récupération incorrecte.';
const KEYRING_MISMATCH =
	'Impossible de déverrouiller vos fiches avec ce mot de passe. Utilisez « Mot de passe oublié » et votre clé de récupération.';

// ---------------------------------------------------------------------------
// Trousseau : users/{uid}

type StoredKeyring = { wrappedDek: StoredEncrypted; recoveryDek: StoredEncrypted };
type Keyring = { wrappedDek: Encrypted; recoveryDek: Encrypted };

const keyringRef = (uid: string) => doc(db, 'users', uid);

async function readKeyring(uid: string): Promise<Keyring> {
	const snapshot = await getDoc(keyringRef(uid));
	if (!snapshot.exists()) throw new Error('Compte incomplet : trousseau de clés introuvable.');
	const { wrappedDek, recoveryDek } = snapshot.data() as StoredKeyring;
	return { wrappedDek: fromStored(wrappedDek), recoveryDek: fromStored(recoveryDek) };
}

const saveWrappedDek = (uid: string, wrappedDek: Encrypted) =>
	updateDoc(keyringRef(uid), { wrappedDek: toStored(wrappedDek) });

/** AES-GCM échoue sans détail si la clé est mauvaise : on traduit en message utilisateur. */
async function orFail<T>(promise: Promise<T>, message: string): Promise<T> {
	try {
		return await promise;
	} catch {
		throw new Error(message);
	}
}

function currentUser(): User & { email: string } {
	const user = auth.currentUser;
	if (!user?.email) throw new Error('Session expirée. Reconnectez-vous.');
	return user as User & { email: string };
}

// ---------------------------------------------------------------------------
// Parcours

/** Lève une erreur affichable si le nouveau mot de passe est refusé. */
export function checkNewPassword(password: string, confirmation: string): void {
	if (password.length < MIN_PASSWORD_LENGTH)
		throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
	if (password !== confirmation) throw new Error('Les deux mots de passe ne correspondent pas.');
}

/** Crée le compte, déverrouille la session et renvoie la clé de récupération (à afficher une seule fois). */
export async function signUp(email: string, password: string): Promise<string> {
	email = normalizeEmail(email);
	const { kek, authToken } = await deriveKeys(password, email);
	const { user } = await createUserWithEmailAndPassword(auth, email, authToken);
	try {
		const recoveryKey = generateRecoveryKey();
		const dek = await generateDek();
		const wrappedDek = await wrapDek(dek, kek);
		const keyring: StoredKeyring = {
			wrappedDek: toStored(wrappedDek),
			recoveryDek: toStored(await wrapDek(dek, await deriveRecoveryKek(recoveryKey)))
		};
		await setDoc(keyringRef(user.uid), keyring);
		// La DEK générée est extractible (wrapKey l'exige) : la session garde une copie qui ne l'est pas.
		setUnlocked(user, await unwrapDek(wrappedDek, kek));
		return recoveryKey;
	} catch (error) {
		// Sans trousseau, le compte est inutilisable : on le supprime pour pouvoir recommencer.
		await deleteUser(user).catch(() => {});
		throw error;
	}
}

export async function signIn(email: string, password: string): Promise<void> {
	email = normalizeEmail(email);
	const { kek, authToken } = await deriveKeys(password, email);
	const { user } = await signInWithEmailAndPassword(auth, email, authToken);
	const { wrappedDek } = await readKeyring(user.uid);
	// Firebase a accepté le mot de passe mais pas la DEK : récupération interrompue, par exemple.
	setUnlocked(user, await orFail(unwrapDek(wrappedDek, kek), KEYRING_MISMATCH));
}

/** Session Firebase conservée mais DEK perdue : le mot de passe suffit, sans appel à Firebase Auth. */
export async function unlock(password: string): Promise<void> {
	const user = currentUser();
	const { kek } = await deriveKeys(password, user.email);
	const { wrappedDek } = await readKeyring(user.uid);
	setUnlocked(user, await orFail(unwrapDek(wrappedDek, kek), WRONG_PASSWORD));
}

/**
 * Réemballe la DEK sous la nouvelle KEK ; les fiches ne sont pas rechiffrées.
 * Firestore puis Firebase Auth : si le second échoue, on remet l'ancienne DEK emballée.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
	const user = currentUser();
	const [current, next] = await Promise.all([
		deriveKeys(currentPassword, user.email),
		deriveKeys(newPassword, user.email)
	]);
	const { wrappedDek } = await readKeyring(user.uid);
	const rewrapped = await orFail(rewrapDek(wrappedDek, current.kek, next.kek), WRONG_PASSWORD);

	// Firebase exige une connexion récente pour changer le mot de passe.
	await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current.authToken));
	await saveWrappedDek(user.uid, rewrapped);
	try {
		await updatePassword(user, next.authToken);
	} catch (error) {
		await saveWrappedDek(user.uid, wrappedDek).catch(() => {});
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Récupération : email Firebase → page d'action de l'app (/action), jamais la page hébergée par Firebase.

export async function requestPasswordReset(email: string): Promise<void> {
	try {
		await sendPasswordResetEmail(auth, normalizeEmail(email));
	} catch (error) {
		// Même réponse que le compte existe ou non (déjà le cas en production avec la protection anti-énumération).
		if (!(error instanceof FirebaseError && error.code === 'auth/user-not-found')) throw error;
	}
}

/** Vérifie le code du lien et renvoie l'email du compte concerné. */
export const checkResetCode = (oobCode: string): Promise<string> => verifyPasswordResetCode(auth, oobCode);

/** Contrôle de forme, avant de consommer le lien : n'assure pas que la clé est la bonne. */
export const isWellFormedRecoveryKey = (recoveryKey: string): Promise<boolean> =>
	deriveRecoveryKek(recoveryKey).then(
		() => true,
		() => false
	);

/**
 * Étape 1 : nouveau mot de passe côté Firebase (jeton dérivé), puis connexion.
 * Renvoie la nouvelle KEK ; la DEK reste emballée par l'ancienne tant que l'étape 2 n'a pas réussi.
 */
export async function resetPassword(oobCode: string, email: string, newPassword: string): Promise<CryptoKey> {
	email = normalizeEmail(email);
	const { kek, authToken } = await deriveKeys(newPassword, email);
	await confirmPasswordReset(auth, oobCode, authToken);
	await signInWithEmailAndPassword(auth, email, authToken);
	return kek;
}

/** Étape 2 : déballe la DEK avec la clé de récupération et la réemballe sous la nouvelle KEK. */
export async function restoreWithRecoveryKey(recoveryKey: string, newKek: CryptoKey): Promise<void> {
	const user = currentUser();
	const recoveryKek = await orFail(deriveRecoveryKek(recoveryKey), WRONG_RECOVERY_KEY);
	const { recoveryDek } = await readKeyring(user.uid);
	const wrappedDek = await orFail(rewrapDek(recoveryDek, recoveryKek, newKek), WRONG_RECOVERY_KEY);
	await saveWrappedDek(user.uid, wrappedDek);
	setUnlocked(user, await unwrapDek(wrappedDek, newKek));
}
