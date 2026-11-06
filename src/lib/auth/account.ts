/**
 * Parcours de compte zero-knowledge. Firebase Auth ne reçoit que le jeton dérivé du mot de passe ;
 * Firestore ne stocke que la DEK emballée deux fois, dans `users/{uid}` :
 *   wrappedDek  : par la KEK du mot de passe (usage courant)
 *   recoveryDek : par la clé de récupération (mot de passe oublié)
 *   keyringCheck : empreinte de recoveryDek, chiffrée par la DEK ; révèle un recoveryDek remplacé
 *   faceIdPepper : aléa sans lequel les copies Face ID des appareils (hors Firestore, voir faceId.ts) ne s'ouvrent pas
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
import { Bytes as FirestoreBytes, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import {
	type Encrypted,
	decryptJson,
	deriveKeys,
	derivePrfKek,
	deriveRecoveryKek,
	encryptJson,
	FACE_ID_PEPPER_LENGTH,
	generateDek,
	generateRecoveryKey,
	normalizeEmail,
	randomBytes,
	rewrapDek,
	sha256,
	unwrapDek,
	wrapDek
} from '$lib/crypto/crypto';
import { toBase64 } from '$lib/crypto/encoding';
import { auth, db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import { type Keyring, unwrapBackupDek } from '$lib/backup/keyring';
import {
	PASSWORD_EVERY_DAYS,
	createFaceIdCredential,
	evaluateFaceId,
	forgetFaceId,
	passwordDue,
	readFaceId,
	saveFaceId,
	touchFaceIdPassword
} from './faceId';
import { session, setRecoveryDamaged, setUnlocked } from './session.svelte';

export const MIN_PASSWORD_LENGTH = 12;

const WRONG_PASSWORD = 'Mot de passe incorrect.';
const WRONG_RECOVERY_KEY = 'Clé de récupération incorrecte.';
const KEYRING_MISMATCH =
	'Impossible de déverrouiller vos fiches avec ce mot de passe. Utilisez « Mot de passe oublié » et votre clé de récupération.';

// ---------------------------------------------------------------------------
// Trousseau : users/{uid}

type StoredKeyring = {
	wrappedDek: StoredEncrypted;
	recoveryDek: StoredEncrypted;
	keyringCheck?: StoredEncrypted;
	faceIdPepper?: FirestoreBytes;
};
export type { Keyring };

const KEYRING_CHECK_CONTEXT = 'keyring/check';

/** IV de taille fixe : l'empreinte de iv + data ne peut pas être conservée en déplaçant un octet de l'un à l'autre. */
const recoveryFingerprint = async ({ iv, data }: Encrypted) => toBase64(await sha256([iv, data]));

const sealRecoveryDek = async (dek: CryptoKey, recoveryDek: Encrypted) =>
	toStored(await encryptJson(dek, await recoveryFingerprint(recoveryDek), KEYRING_CHECK_CONTEXT));

const keyringRef = (uid: string) => doc(db, 'users', uid);

async function readKeyring(uid: string): Promise<Keyring> {
	const snapshot = await getDoc(keyringRef(uid));
	if (!snapshot.exists()) throw new Error('Compte incomplet : trousseau de clés introuvable.');
	const { wrappedDek, recoveryDek } = snapshot.data() as StoredKeyring;
	return { wrappedDek: fromStored(wrappedDek), recoveryDek: fromStored(recoveryDek) };
}

/**
 * Quelqu'un qui peut écrire dans Firestore pourrait remplacer `recoveryDek` sans bloquer le mot de passe : le filet de
 * secours serait perdu en silence. Sceau absent : anomalie aussi, jamais reposé ici (sinon retirer le sceau suffirait
 * à faire sceller un `recoveryDek` remplacé). Tous les comptes en ont un ; une nouvelle clé de récupération le repose.
 * Une panne réseau ne doit pas gêner le déverrouillage : le contrôle sera refait à la prochaine occasion.
 */
export async function checkRecoveryKey(): Promise<void> {
	const { user, dek } = session;
	if (!user || !dek) return;
	try {
		const snapshot = await getDoc(keyringRef(user.uid));
		if (!snapshot.exists()) return;
		const { recoveryDek, keyringCheck } = snapshot.data() as StoredKeyring;
		const fingerprint = await recoveryFingerprint(fromStored(recoveryDek));
		const sealed = keyringCheck
			? await decryptJson<string>(dek, fromStored(keyringCheck), KEYRING_CHECK_CONTEXT).catch(() => null)
			: null;
		setRecoveryDamaged(sealed !== fingerprint);
	} catch {
		// réseau indisponible
	}
}

const saveWrappedDek = (uid: string, wrappedDek: Encrypted) =>
	updateDoc(keyringRef(uid), { wrappedDek: toStored(wrappedDek) });

/**
 * Firestore puis Firebase Auth : si le second échoue, on remet l'ancienne DEK emballée
 * pour garder les deux cohérents. Nouveau mot de passe = Face ID désactivé sur tous les appareils (poivre retiré) :
 * c'est le geste attendu après un appareil perdu ou une fuite.
 */
async function replacePassword(user: User, previous: Encrypted, next: Encrypted, authToken: string) {
	await updateDoc(keyringRef(user.uid), { wrappedDek: toStored(next), faceIdPepper: deleteField() });
	forgetFaceId();
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
		const recoveryDek = await wrapDek(dek, await deriveRecoveryKek(recoveryKey));
		const keyring: StoredKeyring = {
			wrappedDek: toStored(wrappedDek),
			recoveryDek: toStored(recoveryDek),
			keyringCheck: await sealRecoveryDek(dek, recoveryDek)
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
	await checkRecoveryKey();
}

/** Session Firebase conservée mais DEK perdue : le mot de passe suffit, sans appel à Firebase Auth. */
export async function unlock(password: string): Promise<void> {
	const user = currentUser();
	const { kek } = await deriveKeys(password, user.email);
	const { wrappedDek } = await readKeyring(user.uid);
	setUnlocked(user, await orFail(unwrapDek(wrappedDek, kek), WRONG_PASSWORD));
	touchFaceIdPassword(user.uid);
	await checkRecoveryKey();
}

export const PASSWORD_DUE =
	`Par sécurité, le mot de passe est demandé tous les ${PASSWORD_EVERY_DAYS} jours. Déverrouillez avec lui : ` +
	'Face ID reprendra ensuite.';

const FACE_ID_STALE =
	"Face ID n'ouvre plus ce compte (mot de passe changé, ou clé remplacée par une restauration) : il a été désactivé " +
	'sur cet appareil. Déverrouillez avec le mot de passe, puis réactivez-le dans les paramètres.';

/** Trousseau brut : la vérification de Face ID a besoin du poivre et du sceau, lus en une fois. */
async function readStoredKeyring(uid: string): Promise<Partial<StoredKeyring>> {
	return ((await getDoc(keyringRef(uid))).data() ?? {}) as Partial<StoredKeyring>;
}

/** KEK de Face ID à partir de la sortie PRF, effacée aussitôt. */
async function faceIdKek(prf: Uint8Array<ArrayBuffer>, pepper: FirestoreBytes): Promise<CryptoKey> {
	try {
		return await derivePrfKek(prf, pepper.toUint8Array() as Uint8Array<ArrayBuffer>);
	} finally {
		prf.fill(0);
	}
}

/**
 * Active Face ID sur cet appareil. Le mot de passe est vérifié avant toute clé d'accès, puis déballe la DEK le temps
 * de l'emballer sous la clé de Face ID (`rewrapDek`). Le poivre du compte est créé au premier appareil.
 */
export async function enableFaceId(password: string): Promise<void> {
	const user = currentUser();
	const { kek } = await deriveKeys(password, user.email);
	const { wrappedDek } = await readKeyring(user.uid);
	await orFail(unwrapDek(wrappedDek, kek), WRONG_PASSWORD);
	let { faceIdPepper } = await readStoredKeyring(user.uid);
	if (!faceIdPepper) {
		faceIdPepper = FirestoreBytes.fromUint8Array(randomBytes(FACE_ID_PEPPER_LENGTH));
		await updateDoc(keyringRef(user.uid), { faceIdPepper });
	}
	const { credentialId, prf } = await createFaceIdCredential(user.email);
	const faceKek = await faceIdKek(prf, faceIdPepper);
	saveFaceId({ uid: user.uid, credentialId, wrappedDek: await rewrapDek(wrappedDek, kek, faceKek), passwordAt: Date.now() });
}

/**
 * Session Firebase conservée mais DEK perdue : Face ID remplace le mot de passe. Le trousseau est lu d'abord : sans
 * réseau, pas d'invite. Poivre retiré (nouveau mot de passe) : copie effacée. La copie peut aussi dater d'avant une
 * adoption de clé (restauration d'une sauvegarde d'un ancien compte) : elle se déballerait encore, mais en l'ancienne
 * DEK. Le sceau du trousseau, chiffré par la DEK actuelle, le révèle ; la copie est alors effacée.
 */
export async function unlockWithFaceId(): Promise<void> {
	const user = currentUser();
	const record = readFaceId(user.uid);
	if (!record) throw new Error("Face ID n'est pas activé sur cet appareil.");
	if (passwordDue(record)) throw new Error(PASSWORD_DUE);
	const { faceIdPepper, keyringCheck } = await readStoredKeyring(user.uid);
	if (!faceIdPepper || !keyringCheck) return staleFaceId();
	const faceKek = await faceIdKek(await evaluateFaceId(record.credentialId), faceIdPepper);
	const dek = await unwrapDek(record.wrappedDek, faceKek).catch(() => null);
	const sealed = dek && (await decryptJson(dek, fromStored(keyringCheck), KEYRING_CHECK_CONTEXT).then(() => true, () => false));
	if (!dek || !sealed) return staleFaceId();
	setUnlocked(user, dek);
	await checkRecoveryKey();
}

function staleFaceId(): never {
	forgetFaceId();
	throw new Error(FACE_ID_STALE);
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

/**
 * Remplace la clé de récupération et renvoie la nouvelle (à afficher une seule fois). La DEK ne change pas :
 * l'ancienne clé n'ouvre plus le compte, mais ouvre toujours les sauvegardes et copies faites avant.
 */
export async function rotateRecoveryKey(password: string): Promise<string> {
	const user = currentUser();
	const { dek } = session;
	if (!dek) throw new Error('Session verrouillée.');
	const { kek } = await deriveKeys(password, user.email);
	const { wrappedDek } = await readKeyring(user.uid);
	const recoveryKey = generateRecoveryKey();
	const recoveryDek = await orFail(rewrapDek(wrappedDek, kek, await deriveRecoveryKek(recoveryKey)), WRONG_PASSWORD);
	await updateDoc(keyringRef(user.uid), {
		recoveryDek: toStored(recoveryDek),
		keyringCheck: await sealRecoveryDek(dek, recoveryDek)
	});
	setRecoveryDamaged(false);
	return recoveryKey;
}

/** Vérifie une clé notée par l'utilisateur, sans rien modifier : elle est le seul secours si le mot de passe est perdu. */
export async function testRecoveryKey(recoveryKey: string): Promise<boolean> {
	const { recoveryDek } = await readKeyring(currentUser().uid);
	try {
		await unwrapDek(recoveryDek, await deriveRecoveryKek(recoveryKey));
		return true;
	} catch {
		return false;
	}
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
	await checkRecoveryKey();
}

// ---------------------------------------------------------------------------
// Sauvegarde

/** Trousseau du compte connecté, tel que stocké (chiffré) : il accompagne les fiches dans une sauvegarde. */
export const readCurrentKeyring = (): Promise<Keyring> => readKeyring(currentUser().uid);

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

	// Extractible : elle est réemballée par la KEK du compte juste après.
	const oldDek = await unwrapBackupDek(backup, user.email, oldSecret, true);
	await verify(oldDek);
	const rewrapped = await wrapDek(oldDek, current.kek);
	const keyring: StoredKeyring = {
		wrappedDek: toStored(rewrapped),
		recoveryDek: toStored(backup.recoveryDek),
		keyringCheck: await sealRecoveryDek(oldDek, backup.recoveryDek)
	};
	// Le trousseau est remplacé en entier, poivre compris : les copies Face ID de l'ancienne DEK ne s'ouvrent plus.
	await setDoc(keyringRef(user.uid), keyring);
	forgetFaceId();

	const dek = await unwrapDek(rewrapped, current.kek);
	setUnlocked(user, dek);
	return dek;
}
