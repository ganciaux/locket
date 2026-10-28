/**
 * Module crypto zero-knowledge. Tout se passe dans le navigateur via Web Crypto.
 *
 *   mot de passe + email ──PBKDF2 600k──► maître (256 bits) ──HKDF──┬─► KEK (non extractible)
 *                                                                  └─► jeton de login Firebase
 *   DEK (AES-GCM 256, aléatoire) emballée 2 fois : par la KEK et par la clé de récupération.
 *
 * Aucune fonction de ce module ne journalise quoi que ce soit.
 */
import { type Bytes, fromBase32, fromUtf8, toBase32, toBase64, utf8 } from './encoding';

export const PBKDF2_ITERATIONS = 600_000;
const IV_LENGTH = 12;
const RECOVERY_KEY_LENGTH = 32;

const AES_GCM = { name: 'AES-GCM', length: 256 } as const;

export type Encrypted = { iv: Bytes; data: Bytes };

export const randomBytes = (length: number): Bytes => crypto.getRandomValues(new Uint8Array(length));

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Dérivation

/** HKDF à partir d'un secret brut : un « info » différent produit une clé indépendante. */
async function hkdfBase(secret: Bytes): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey', 'deriveBits']);
}

const hkdfParams = (info: string) => ({
	name: 'HKDF',
	hash: 'SHA-256',
	salt: new Uint8Array(0),
	info: utf8(info)
});

/** KEK : sert uniquement à emballer / déballer la DEK, jamais exportable. */
const deriveWrappingKey = (base: CryptoKey, info: string) =>
	crypto.subtle.deriveKey(hkdfParams(info), base, AES_GCM, false, ['wrapKey', 'unwrapKey']);

export type DerivedKeys = { kek: CryptoKey; authToken: string };

/**
 * Dérive la KEK et le jeton de login depuis le mot de passe.
 * Le jeton (base64) remplace le mot de passe auprès de Firebase Auth.
 */
export async function deriveKeys(password: string, email: string): Promise<DerivedKeys> {
	const passwordKey = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, [
		'deriveBits'
	]);
	const master = new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: utf8(normalizeEmail(email)), iterations: PBKDF2_ITERATIONS },
			passwordKey,
			256
		)
	);
	const base = await hkdfBase(master);
	master.fill(0);

	const kek = await deriveWrappingKey(base, 'locket/kek');
	const authBits = await crypto.subtle.deriveBits(hkdfParams('locket/auth'), base, 256);
	return { kek, authToken: toBase64(new Uint8Array(authBits)) };
}

// ---------------------------------------------------------------------------
// Clé de récupération

/** Génère une clé de récupération (256 bits), formatée en groupes de 4 caractères base32. */
export function generateRecoveryKey(): string {
	const groups = toBase32(randomBytes(RECOVERY_KEY_LENGTH)).match(/.{1,4}/g) ?? [];
	return groups.join('-');
}

/** 256 bits d'entropie : pas besoin de PBKDF2, HKDF suffit. */
export async function deriveRecoveryKek(recoveryKey: string): Promise<CryptoKey> {
	const raw = fromBase32(recoveryKey);
	if (raw.length !== RECOVERY_KEY_LENGTH) throw new Error('Clé de récupération invalide');
	return deriveWrappingKey(await hkdfBase(raw), 'locket/recovery');
}

// ---------------------------------------------------------------------------
// DEK : génération, emballage, déballage

/** Extractible uniquement le temps de l'emballer (wrapKey l'exige). */
export const generateDek = (): Promise<CryptoKey> =>
	crypto.subtle.generateKey(AES_GCM, true, ['encrypt', 'decrypt']);

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<Encrypted> {
	const iv = randomBytes(IV_LENGTH);
	const data = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv }));
	return { iv, data };
}

/**
 * Déballe la DEK. Par défaut non extractible (usage normal en session) ;
 * extractible seulement pour la réemballer (changement de mot de passe, récupération).
 */
export function unwrapDek(wrapped: Encrypted, kek: CryptoKey, extractable = false): Promise<CryptoKey> {
	return crypto.subtle.unwrapKey(
		'raw',
		wrapped.data,
		kek,
		{ name: 'AES-GCM', iv: wrapped.iv },
		AES_GCM,
		extractable,
		['encrypt', 'decrypt']
	);
}

/** Réemballe la DEK sous une nouvelle KEK, sans toucher aux données chiffrées. */
export async function rewrapDek(wrapped: Encrypted, oldKek: CryptoKey, newKek: CryptoKey): Promise<Encrypted> {
	return wrapDek(await unwrapDek(wrapped, oldKek, true), newKek);
}

// ---------------------------------------------------------------------------
// Chiffrement des données

/**
 * AES-GCM avec un IV aléatoire neuf à chaque appel.
 * `context` (AAD) lie le chiffré à son emplacement (ex. "entryId/thumb") :
 * un chiffré déplacé vers une autre fiche ou un autre champ échoue au déchiffrement.
 */
export async function encrypt(dek: CryptoKey, plaintext: Bytes, context: string): Promise<Encrypted> {
	const iv = randomBytes(IV_LENGTH);
	const data = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(context) }, dek, plaintext)
	);
	return { iv, data };
}

export async function decrypt(dek: CryptoKey, encrypted: Encrypted, context: string): Promise<Bytes> {
	return new Uint8Array(
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: encrypted.iv, additionalData: utf8(context) },
			dek,
			encrypted.data
		)
	);
}

export const encryptJson = (dek: CryptoKey, value: unknown, context: string) =>
	encrypt(dek, utf8(JSON.stringify(value)), context);

export async function decryptJson<T>(dek: CryptoKey, encrypted: Encrypted, context: string): Promise<T> {
	return JSON.parse(fromUtf8(await decrypt(dek, encrypted, context))) as T;
}
