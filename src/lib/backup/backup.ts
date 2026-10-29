/**
 * Sauvegarde chiffrée et restauration.
 *  - Même DEK (cas courant) : les fiches du fichier remplacent ou complètent celles du compte, rien n'est supprimé.
 *  - DEK différente (compte recréé) : le compte, s'il est vide, adopte la DEK de la sauvegarde
 *    grâce à l'ancien mot de passe ou à l'ancienne clé de récupération.
 */
import { adoptBackupKeyring, readCurrentKeyring } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { type Encrypted, decryptJson } from '$lib/crypto/crypto';
import { hasEntries, readStoredEntries, writeStoredEntries } from '$lib/entries/repository';
import { resetEntries } from '$lib/entries/store.svelte';
import { collectionCatalog, tagCatalog } from '$lib/entries/catalog';
import { type Backup, serializeBackup } from './format';

function unlockedSession() {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('Session verrouillée.');
	return { uid: user.uid, dek };
}

export async function createBackup(includeImages: boolean): Promise<string> {
	const { uid } = unlockedSession();
	const [keyring, collections, tags, entries] = await Promise.all([
		readCurrentKeyring(),
		collectionCatalog.readStored(uid),
		tagCatalog.readStored(uid),
		readStoredEntries(uid, includeImages)
	]);
	return serializeBackup({
		createdAt: new Date().toISOString(),
		includesImages: includeImages,
		keyring,
		collections,
		tags,
		entries
	});
}

/** La sauvegarde se déchiffre-t-elle avec cette DEK ? On essaie sur une fiche, sinon sur un catalogue. */
async function opensWith(backup: Backup, dek: CryptoKey): Promise<boolean> {
	const [first] = backup.entries;
	try {
		if (first) await decryptJson(dek, first.data, `${first.id}/data`);
		else if (backup.collections) await collectionCatalog.decrypt(dek, backup.collections);
		else if (backup.tags) await tagCatalog.decrypt(dek, backup.tags);
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

type Catalog<T> = {
	decrypt(dek: CryptoKey, encrypted: Encrypted): Promise<T[]>;
	get(uid: string, dek: CryptoKey): Promise<T[]>;
	save(uid: string, dek: CryptoKey, items: T[]): Promise<void>;
};

async function mergeCatalog<T extends { id: string }>(
	catalog: Catalog<T>,
	uid: string,
	dek: CryptoKey,
	fromFile: Encrypted | null,
	replace: boolean
): Promise<void> {
	const fromBackup = fromFile ? await catalog.decrypt(dek, fromFile) : [];
	const current = replace ? [] : await catalog.get(uid, dek);
	const currentIds = new Set(current.map((item) => item.id));
	await catalog.save(uid, dek, [...current, ...fromBackup.filter((item) => !currentIds.has(item.id))]);
}

export async function restoreBackup(backup: Backup, oldKey?: OldKey): Promise<RestoreResult> {
	const { uid } = unlockedSession();
	let { dek } = unlockedSession();
	if (!backup.entries.length && !backup.collections && !backup.tags) throw new Error('Cette sauvegarde est vide.');

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

	// Catalogues fusionnés par id (ceux du compte d'abord, ordre conservé). Compte recréé : ses catalogues
	// éventuels (autre clé) seraient illisibles, ils sont toujours remplacés.
	if (backup.collections || adopted)
		await mergeCatalog(collectionCatalog, uid, dek, backup.collections, adopted);
	if (backup.tags || adopted) await mergeCatalog(tagCatalog, uid, dek, backup.tags, adopted);
	await writeStoredEntries(uid, backup.entries, backup.includesImages);
	resetEntries();
	return { restored: backup.entries.length, adopted };
}
