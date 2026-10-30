/**
 * Parcours de compte zero-knowledge. Firebase Auth ne reçoit que le jeton dérivé du mot de passe ;
 * Firestore ne stocke que la DEK emballée deux fois, dans `users/{uid}` :
 *   wrappedDek  : par la KEK du mot de passe (usage courant)
 *   recoveryDek : par la clé de récupération (mot de passe oublié)
 */
import {
	EmailAuthProvider,
	createUserWithEmailAndPassword,
	deleteUser,
	getAdditionalUserInfo,
	isSignInWithEmailLink,
	reauthenticateWithCredential,
	sendSignInLinkToEmail,
	signInWithEmailAndPassword,
	signInWithEmailLink,
	updatePassword,
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
export type Keyring = { wrappedDek: Encrypted; recoveryDek: Encrypted };

const keyringRef = (uid: string) => doc(db, 'users', uid);

async function readKeyring(uid: string): Promise<Keyring> {
	const snapshot = await getDoc(keyringRef(uid));
	if (!snapshot.exists()) throw new Error('Compte incomplet : trousseau de clés introuvable.');
	const { wrappedDek, recoveryDek } = snapshot.data() as StoredKeyring;
	return { wrappedDek: fromStored(wrappedDek), recoveryDek: fromStored(recoveryDek) };
}

const saveWrappedDek = (uid: string, wrappedDek: Encrypted) =>
	updateDoc(keyringRef(uid), { wrappedDek: toStored(wrappedDek) });

/**
 * Firestore puis Firebase Auth : si le second échoue, on remet l'ancienne DEK emballée
 * pour garder les deux cohérents.
 */
async function replacePassword(user: User, previous: Encrypted, next: Encrypted, authToken: string) {
	await saveWrappedDek(user.uid, next);
	try {
		await updatePassword(user, authToken);
	} catch (error) {
		await saveWrappedDek(user.uid, previous).catch(() => {});
		throw error;
	}
}

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

/** Confirme une action irréversible : lève une erreur si ce n'est pas le mot de passe du compte. */
export async function verifyPassword(password: string): Promise<void> {
	const user = currentUser();
	const { kek } = await deriveKeys(password, user.email);
	const { wrappedDek } = await readKeyring(user.uid);
	await orFail(unwrapDek(wrappedDek, kek), WRONG_PASSWORD);
}

/** Réemballe la DEK sous la nouvelle KEK ; les fiches ne sont pas rechiffrées. */
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
	await replacePassword(user, wrappedDek, rewrapped, next.authToken);
}

// ---------------------------------------------------------------------------
// Récupération : connexion par lien envoyé par email, puis clé de récupération.
// Jamais `sendPasswordResetEmail` : sa page hébergée par Firebase recevrait le vrai mot de passe.

const RECOVERY_EMAIL_KEY = 'locket.recoveryEmail';

/** Envoie un lien de connexion qui ramène sur /action. L'email est mémorisé pour ne pas le redemander. */
export async function requestRecoveryLink(email: string): Promise<void> {
	email = normalizeEmail(email);
	try {
		await sendSignInLinkToEmail(auth, email, { url: `${location.origin}/action`, handleCodeInApp: true });
	} catch (error) {
		// Inscriptions fermées : Firebase refuse les adresses sans compte. Même réponse que si le compte existait,
		// sinon la page révélerait quelles adresses ont un compte.
		if (!(error instanceof FirebaseError && error.code === 'auth/admin-restricted-operation')) throw error;
		return;
	}
	try {
		localStorage.setItem(RECOVERY_EMAIL_KEY, email);
	} catch {
		// Stockage indisponible : l'email sera redemandé à l'ouverture du lien.
	}
}

export const isRecoveryLink = (url: string): boolean => isSignInWithEmailLink(auth, url);

/** Vide si le lien est ouvert dans un autre navigateur (ex. Safari plutôt que la PWA sur iPhone). */
export function rememberedRecoveryEmail(): string {
	try {
		return localStorage.getItem(RECOVERY_EMAIL_KEY) ?? '';
	} catch {
		return '';
	}
}

/** Étape 1 : connexion par le lien, à usage unique. */
export async function signInWithRecoveryLink(email: string, url: string): Promise<void> {
	const credential = await signInWithEmailLink(auth, normalizeEmail(email), url);
	try {
		localStorage.removeItem(RECOVERY_EMAIL_KEY);
	} catch {
		// rien à nettoyer
	}
	// Un lien de connexion crée le compte s'il n'existe pas : on annule.
	if (getAdditionalUserInfo(credential)?.isNewUser) {
		await deleteUser(credential.user).catch(() => {});
		throw new Error('Aucun compte n’existe pour cet email.');
	}
}

/**
 * Étape 2 : déballe la DEK avec la clé de récupération, la réemballe sous la KEK du nouveau mot de passe,
 * puis remplace le mot de passe Firebase. Clé fausse → rien n'est modifié, on peut réessayer.
 */
export async function recoverWithKey(recoveryKey: string, newPassword: string): Promise<void> {
	const user = currentUser();
	const recoveryKek = await orFail(deriveRecoveryKek(recoveryKey), WRONG_RECOVERY_KEY);
	const next = await deriveKeys(newPassword, user.email);
	const { wrappedDek, recoveryDek } = await readKeyring(user.uid);
	const rewrapped = await orFail(rewrapDek(recoveryDek, recoveryKek, next.kek), WRONG_RECOVERY_KEY);
	try {
		await replacePassword(user, wrappedDek, rewrapped, next.authToken);
	} catch (error) {
		// La connexion par le lien n'est « récente » que quelques minutes.
		if (error instanceof FirebaseError && error.code === 'auth/requires-recent-login')
			throw new Error('Le lien a expiré. Demandez-en un nouveau depuis « Mot de passe oublié ».');
		throw error;
	}
	setUnlocked(user, await unwrapDek(rewrapped, next.kek));
}

// ---------------------------------------------------------------------------
// Sauvegarde

/** Trousseau du compte connecté, tel que stocké (chiffré) : il accompagne les fiches dans une sauvegarde. */
export const readCurrentKeyring = (): Promise<Keyring> => readKeyring(currentUser().uid);

/** Ancienne DEK d'une sauvegarde, extractible pour être réemballée. */
async function unwrapBackupDek(backup: Keyring, email: string, secret: string): Promise<CryptoKey> {
	try {
		return await unwrapDek(backup.recoveryDek, await deriveRecoveryKek(secret), true);
	} catch {
		// pas une clé de récupération valable pour cette sauvegarde : on essaie comme mot de passe
	}
	try {
		const { kek } = await deriveKeys(secret, email);
		return await unwrapDek(backup.wrappedDek, kek, true);
	} catch {
		throw new Error('Ni ce mot de passe ni cette clé de récupération n’ouvrent cette sauvegarde.');
	}
}

/**
 * Restauration dans un compte recréé : le compte adopte la DEK de la sauvegarde.
 * `oldSecret` : mot de passe de l'époque (même email) ou clé de récupération de l'ancien compte.
 * La copie « clé de récupération » de la sauvegarde est reprise telle quelle : l'ancienne clé redevient la bonne.
 * Le compte doit être vide (vérifié par l'appelant) : ses fiches éventuelles deviendraient illisibles.
 * `verify` contrôle le fichier avec l'ancienne DEK avant que le trousseau du compte soit remplacé.
 */
export async function adoptBackupKeyring(
	backup: Keyring,
	currentPassword: string,
	oldSecret: string,
	verify: (oldDek: CryptoKey) => Promise<void>
): Promise<CryptoKey> {
	const user = currentUser();
	const current = await deriveKeys(currentPassword, user.email);
	// Vérifié avant toute écriture : un mot de passe mal tapé verrouillerait le compte.
	const { wrappedDek } = await readKeyring(user.uid);
	await orFail(unwrapDek(wrappedDek, current.kek), WRONG_PASSWORD);

	const oldDek = await unwrapBackupDek(backup, user.email, oldSecret);
	await verify(oldDek);
	const rewrapped = await wrapDek(oldDek, current.kek);
	const keyring: StoredKeyring = { wrappedDek: toStored(rewrapped), recoveryDek: toStored(backup.recoveryDek) };
	await setDoc(keyringRef(user.uid), keyring);

	const dek = await unwrapDek(rewrapped, current.kek);
	setUnlocked(user, dek);
	return dek;
}
