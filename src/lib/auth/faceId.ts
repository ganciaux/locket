/**
 * Face ID / Touch ID, propre à un appareil : une clé d'accès « Stash » rend, après Face ID, 32 octets stables
 * (extension WebAuthn `prf`). La KEK qui en dérive (`derivePrfKek`) emballe une copie de la DEK, gardée ici dans le
 * localStorage, jamais dans Firebase, avec pour sel un poivre du trousseau Firestore (sans lui, la copie ne s'ouvre
 * pas : un appareil volé gardé hors ligne n'en tire rien). La sortie PRF n'est ni gardée ni affichée.
 * Ce module ne parle qu'au navigateur ; l'emballage et le déballage sont dans account.ts.
 */
import { type Encrypted, randomBytes } from '$lib/crypto/crypto';
import { type Bytes, fromBase64, toBase64, utf8 } from '$lib/crypto/encoding';

const STORE = 'locket.faceId';
const PRF_SALT = utf8('locket/face-id/v1');
const prfInput = { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs;

/** Copie de la DEK emballée par la clé de Face ID, rattachée au compte qui l'a créée. */
export type FaceIdRecord = { uid: string; credentialId: Bytes; wrappedDek: Encrypted };

type StoredRecord = { uid: string; credentialId: string; iv: string; data: string };

/** Contenu du stockage pour ce compte, ou null : absent, abîmé ou d'un autre compte. */
export function parseFaceIdRecord(text: string | null, uid: string): FaceIdRecord | null {
	if (!text) return null;
	try {
		const stored = JSON.parse(text) as Partial<StoredRecord>;
		if (stored.uid !== uid || typeof stored.credentialId !== 'string') return null;
		if (typeof stored.iv !== 'string' || typeof stored.data !== 'string') return null;
		return {
			uid,
			credentialId: fromBase64(stored.credentialId),
			wrappedDek: { iv: fromBase64(stored.iv), data: fromBase64(stored.data) }
		};
	} catch {
		return null;
	}
}

export const serializeFaceIdRecord = ({ uid, credentialId, wrappedDek }: FaceIdRecord): string =>
	JSON.stringify({
		uid,
		credentialId: toBase64(credentialId),
		iv: toBase64(wrappedDek.iv),
		data: toBase64(wrappedDek.data)
	} satisfies StoredRecord);

export function readFaceId(uid: string): FaceIdRecord | null {
	try {
		return parseFaceIdRecord(localStorage.getItem(STORE), uid);
	} catch {
		return null;
	}
}

export function saveFaceId(record: FaceIdRecord): void {
	try {
		localStorage.setItem(STORE, serializeFaceIdRecord(record));
	} catch {
		throw new Error("Stockage indisponible sur cet appareil : Face ID n'a pas pu être activé.");
	}
}

/** À la déconnexion, au changement de compte, ou quand la copie n'ouvre plus le compte. */
export function forgetFaceId(): void {
	try {
		localStorage.removeItem(STORE);
	} catch {
		// rien à effacer
	}
}

/** Face ID, Touch ID ou équivalent présent ; `prf` est vérifiée à l'activation si le navigateur ne l'annonce pas. */
export async function faceIdSupported(): Promise<boolean> {
	if (typeof PublicKeyCredential === 'undefined') return false;
	try {
		const withCapabilities = PublicKeyCredential as unknown as {
			getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>;
		};
		const capabilities = await withCapabilities.getClientCapabilities?.();
		if (capabilities?.['extension:prf'] === false) return false;
		return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch {
		return false;
	}
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: BufferSource } } };

function prfOutput(credential: PublicKeyCredential): Bytes | null {
	const first = (credential.getClientExtensionResults() as PrfResults).prf?.results?.first;
	if (!first) return null;
	const view = ArrayBuffer.isView(first) ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength) : new Uint8Array(first);
	return new Uint8Array(view) as Bytes;
}

/** Annulation, délai dépassé ou clé d'accès supprimée : le navigateur ne dit pas lequel. */
function webAuthnError(error: unknown): Error {
	if (error instanceof DOMException && error.name === 'NotAllowedError')
		return new Error("Face ID n'a pas abouti. Réessayez, ou utilisez le mot de passe.");
	return error instanceof Error ? error : new Error(String(error));
}

const NO_PRF = "Cet appareil ne fournit pas la clé nécessaire : Face ID ne peut pas déverrouiller Stash ici.";

/**
 * Sortie PRF de la clé d'accès, après Face ID. `userVerification: 'required'` : sans Face ID (ou le code de
 * l'appareil, que le système propose en secours), pas de sortie.
 */
export async function evaluateFaceId(credentialId: Bytes): Promise<Bytes> {
	let assertion: PublicKeyCredential | null;
	try {
		assertion = (await navigator.credentials.get({
			publicKey: {
				challenge: randomBytes(32),
				rpId: location.hostname,
				allowCredentials: [{ type: 'public-key', id: credentialId }],
				userVerification: 'required',
				extensions: prfInput
			}
		})) as PublicKeyCredential | null;
	} catch (error) {
		throw webAuthnError(error);
	}
	const output = assertion && prfOutput(assertion);
	if (!output) throw new Error(NO_PRF);
	return output;
}

/**
 * Crée la clé d'accès de cet appareil et renvoie son identifiant avec sa sortie PRF. Identifiant d'utilisateur
 * aléatoire : une clé d'accès par activation. Avec l'uid, activer un autre appareil du même trousseau iCloud
 * remplacerait la clé d'accès synchronisée, et casserait Face ID sur le premier.
 * Certains systèmes (iOS) ne donnent la sortie qu'à l'usage : un second Face ID la demande alors.
 */
export async function createFaceIdCredential(email: string): Promise<{ credentialId: Bytes; prf: Bytes }> {
	let credential: PublicKeyCredential | null;
	try {
		credential = (await navigator.credentials.create({
			publicKey: {
				rp: { name: 'Stash', id: location.hostname },
				user: { id: randomBytes(16), name: email, displayName: email },
				challenge: randomBytes(32),
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 }
				],
				authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
				extensions: prfInput
			}
		})) as PublicKeyCredential | null;
	} catch (error) {
		throw webAuthnError(error);
	}
	if (!credential) throw webAuthnError(new DOMException('', 'NotAllowedError'));
	const extension = (credential.getClientExtensionResults() as PrfResults).prf;
	if (extension?.enabled === false) throw new Error(NO_PRF);
	const credentialId = new Uint8Array(credential.rawId) as Bytes;
	return { credentialId, prf: prfOutput(credential) ?? (await evaluateFaceId(credentialId)) };
}
