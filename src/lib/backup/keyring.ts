/**
 * Trousseau d'une sauvegarde, sans Firebase : partagé par la restauration (compte recréé) et l'outil de lecture.
 * La DEK s'ouvre avec la clé de récupération de l'époque, ou avec le mot de passe de l'époque et son email
 * (la KEK dérive des deux).
 */
import { type Encrypted, deriveKeys, deriveRecoveryKek, unwrapDek } from '$lib/crypto/crypto';

export type Keyring = { wrappedDek: Encrypted; recoveryDek: Encrypted };

/**
 * DEK d'une sauvegarde. `extractable` : seulement pour la réemballer (adoption par un compte recréé) ; la lire
 * n'en a pas besoin. Sans `email`, seule la clé de récupération est essayée.
 */
export async function unwrapBackupDek(
	keyring: Keyring,
	email: string | undefined,
	secret: string,
	extractable = false
): Promise<CryptoKey> {
	try {
		return await unwrapDek(keyring.recoveryDek, await deriveRecoveryKek(secret), extractable);
	} catch {
		// pas une clé de récupération valable pour cette sauvegarde : on essaie comme mot de passe
	}
	try {
		if (!email) throw new Error();
		const { kek } = await deriveKeys(secret, email);
		return await unwrapDek(keyring.wrappedDek, kek, extractable);
	} catch {
		throw new Error(
			email
				? 'Ni ce mot de passe ni cette clé de récupération n’ouvrent cette sauvegarde.'
				: 'Cette clé de récupération n’ouvre pas cette sauvegarde.'
		);
	}
}
