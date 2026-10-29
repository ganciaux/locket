/**
 * Sauvegarde chiffrée et restauration.
 *  - Même DEK (cas courant) : les fiches du fichier remplacent ou complètent celles du compte, rien n'est supprimé.
 *  - DEK différente (compte recréé) : le compte, s'il est vide, adopte la DEK de la sauvegarde
 *    grâce à l'ancien mot de passe ou à l'ancienne clé de récupération.
 */
import { adoptBackupKeyring, readCurrentKeyring } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { decryptJson } from '$lib/crypto/crypto';
import { hasEntries, readStoredEntries, writeStoredEntries } from '$lib/entries/repository';
import { resetEntries } from '$lib/entries/store.svelte';
import { decryptTags, getTags, readStoredTags, saveTags } from '$lib/entries/tags';
import { type Backup, serializeBackup } from './format';

function unlockedSession() {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('Session verrouillée.');
	return { uid: user.uid, dek };
}

export async function createBackup(includeImages: boolean): Promise<string> {
	const { uid } = unlockedSession();
	const [keyring, tags, entries] = await Promise.all([
		readCurrentKeyring(),
		readStoredTags(uid),
		readStoredEntries(uid, includeImages)
	]);
	return serializeBackup({ createdAt: new Date().toISOString(), includesImages: includeImages, keyring, tags, entries });
}

/** La sauvegarde se déchiffre-t-elle avec cette DEK ? On essaie sur une fiche (ou le catalogue de tags). */
async function opensWith(backup: Backup, dek: CryptoKey): Promise<boolean> {
	const [first] = backup.entries;
	try {
		if (first) await decryptJson(dek, first.data, `${first.id}/data`);
		else if (backup.tags) await decryptTags(dek, backup.tags);
		return true;
	} catch {
		return false;
	}
}

/** La sauvegarde vient d'un autre compte (ou d'un compte recréé) : il faut l'ancien mot de passe ou l'ancienne clé. */
export class OldKeyRequired extends Error {
	constructor() {
		super('Cette sauvegarde a été chiffrée avec une autre clé.');
	}
}

export type OldKey = { currentPassword: string; oldSecret: string };
export type RestoreResult = { restored: number; adopted: boolean };

export async function restoreBackup(backup: Backup, oldKey?: OldKey): Promise<RestoreResult> {
	const { uid } = unlockedSession();
	let { dek } = unlockedSession();
	if (!backup.entries.length && !backup.tags) throw new Error('Cette sauvegarde est vide.');

	let adopted = false;
	if (!(await opensWith(backup, dek))) {
		if (!oldKey) throw new OldKeyRequired();
		if (await hasEntries(uid))
			throw new Error(
				'Ce compte contient déjà des fiches chiffrées avec une autre clé : restaurez cette sauvegarde dans un compte vide.'
			);
		dek = await adoptBackupKeyring(backup.keyring, oldKey.currentPassword, oldKey.oldSecret);
		if (!(await opensWith(backup, dek))) throw new Error('Sauvegarde endommagée : ses fiches sont illisibles.');
		adopted = true;
	}

	// Compte recréé : son catalogue éventuel (autre clé) serait illisible, il est toujours remplacé.
	if (backup.tags || adopted) {
		const fromBackup = backup.tags ? await decryptTags(dek, backup.tags) : [];
		const current = adopted ? [] : await getTags(uid, dek);
		const currentIds = new Set(current.map((tag) => tag.id));
		await saveTags(uid, dek, [...current, ...fromBackup.filter((tag) => !currentIds.has(tag.id))]);
	}
	await writeStoredEntries(uid, backup.entries, backup.includesImages);
	resetEntries();
	return { restored: backup.entries.length, adopted };
}
