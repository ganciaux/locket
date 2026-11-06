/**
 * Sauvegarde chiffrée et restauration.
 * Le fichier est la source de vérité : après restauration, le compte contient ce qu'il contient, ni plus ni moins.
 *  - Même DEK (cas courant) : fiches et catalogues sont remplacés, les fiches absentes du fichier supprimées.
 *  - DEK différente (compte recréé) : le compte, s'il est vide, adopte la DEK de la sauvegarde
 *    grâce à l'ancien mot de passe ou à l'ancienne clé de récupération.
 */
import { adoptBackupKeyring, checkRecoveryKey, readCurrentKeyring, verifyPassword } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { type Encrypted, encryptJson } from '$lib/crypto/crypto';
import { deleteStoredEntriesExcept, hasEntries, readStoredEntries, writeStoredEntries } from '$lib/entries/repository';
import { resetEntries } from '$lib/entries/store.svelte';
import { collectionCatalog, tagCatalog } from '$lib/entries/catalog';
import { galleryImageId, galleryThumbsId } from '$lib/entries/gallery';
import { type Backup, type BackupEntry, type BackupManifest, serializeBackup } from './format';
import {
	type BackupCheck,
	type BackupContent,
	MANIFEST_CONTEXT,
	contentHash,
	countContent,
	encryptedParts,
	isReadable,
	opensWith,
	verifyBackup
} from './verify';

export { type BackupCheck, plural } from './verify';

function unlockedSession() {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('Session verrouillée.');
	return { uid: user.uid, dek };
}

/**
 * `skipped` : pièces illisibles laissées hors du fichier, sinon il serait refusé en entier à la restauration.
 * Une image ou une miniature abîmée ne coûte pas la fiche. Le nombre est scellé dans le manifeste : un fichier
 * incomplet ne pourra pas se présenter comme complet.
 */
export async function createBackup(includeImages: boolean): Promise<{ text: string; skipped: number }> {
	const { uid, dek } = unlockedSession();
	const [keyring, storedCollections, storedTags, stored] = await Promise.all([
		readCurrentKeyring(),
		collectionCatalog.readStored(uid),
		tagCatalog.readStored(uid),
		readStoredEntries(uid, includeImages)
	]);
	await checkRecoveryKey();

	let skipped = 0;
	const keep = async (encrypted: Encrypted | null | undefined, context: string) => {
		if (!encrypted) return undefined;
		if (await isReadable({ encrypted, context }, dek)) return encrypted;
		skipped++;
		return undefined;
	};
	const entries: BackupEntry[] = [];
	for (const entry of stored) {
		const data = await keep(entry.data, `${entry.id}/data`);
		if (!data) continue;
		const thumb = await keep(entry.thumb, `${entry.id}/thumb`);
		const image = await keep(entry.image, `${entry.id}/image`);
		// Autres images : l'AAD dépend de l'emplacement, les suivantes ne peuvent pas avancer d'un rang. Une illisible
		// écarte donc aussi celles d'après (comptées), pour ne pas laisser de trou.
		const gallery: Encrypted[] = [];
		const extras = entry.gallery ?? [];
		for (const [i, extra] of extras.entries()) {
			const kept = await keep(extra, `${galleryImageId(entry.id, i + 1)}/image`);
			if (!kept) {
				skipped += extras.length - i - 1;
				break;
			}
			gallery.push(kept);
		}
		const galleryThumbs = gallery.length ? await keep(entry.galleryThumbs, `${galleryThumbsId(entry.id)}/image`) : undefined;
		entries.push({
			id: entry.id,
			data,
			...(thumb && { thumb }),
			...(image && { image }),
			...(gallery.length && { gallery }),
			...(galleryThumbs && { galleryThumbs })
		});
	}
	const content: BackupContent = {
		createdAt: new Date().toISOString(),
		includesImages: includeImages,
		keyring,
		collections: (await keep(storedCollections, 'meta/collections')) ?? null,
		tags: (await keep(storedTags, 'meta/tags')) ?? null,
		entries
	};
	const manifest: BackupManifest = {
		createdAt: content.createdAt,
		includesImages: content.includesImages,
		counts: await countContent(content, dek),
		skipped,
		contentHash: await contentHash(content)
	};
	const manifestCipher = await encryptJson(dek, manifest, MANIFEST_CONTEXT);
	return { text: serializeBackup({ ...content, manifest: manifestCipher }), skipped };
}

/** Contrôle à la sélection du fichier. null : autre clé, le contrôle n'est possible qu'à la restauration. */
export async function checkBackup(backup: Backup): Promise<BackupCheck | null> {
	const { dek } = unlockedSession();
	return (await opensWith(backup, dek)) ? verifyBackup(backup, dek) : null;
}

/** La sauvegarde vient d'un autre compte (ou d'un compte recréé) : il faut l'ancien mot de passe ou l'ancienne clé. */
export class OldKeyRequired extends Error {
	constructor() {
		super('Cette sauvegarde a été chiffrée avec une autre clé.');
	}
}

export type RestoreResult = { restored: number; removed: number; adopted: boolean };

type Catalog<T> = {
	decrypt(dek: CryptoKey, encrypted: Encrypted): Promise<T[]>;
	save(uid: string, dek: CryptoKey, items: T[], checked?: boolean): Promise<void>;
};

/** Sans contrôle de version : la restauration remplace tout volontairement. */
async function replaceCatalog<T>(catalog: Catalog<T>, uid: string, dek: CryptoKey, fromFile: Encrypted | null): Promise<void> {
	await catalog.save(uid, dek, fromFile ? await catalog.decrypt(dek, fromFile) : [], false);
}

/**
 * `password` : mot de passe actuel, comme pour la suppression totale, car restaurer efface ce qui est plus récent.
 * `oldSecret` : ancien mot de passe ou ancienne clé de récupération, si le fichier vient d'une autre clé.
 */
export async function restoreBackup(backup: Backup, password: string, oldSecret?: string): Promise<RestoreResult> {
	const { uid } = unlockedSession();
	let { dek } = unlockedSession();
	if (!encryptedParts(backup).length) throw new Error('Cette sauvegarde est vide.');
	await verifyPassword(password);

	// Tout est vérifié avant la première écriture : un fichier altéré remplacerait des fiches saines.
	let adopted = false;
	if (await opensWith(backup, dek)) {
		await verifyBackup(backup, dek);
	} else {
		if (!oldSecret) throw new OldKeyRequired();
		if (await hasEntries(uid))
			throw new Error(
				'Ce compte contient déjà des fiches chiffrées avec une autre clé : restaurez cette sauvegarde dans un compte vide.'
			);
		dek = await adoptBackupKeyring(backup.keyring, password, oldSecret, async (oldDek) => {
			await verifyBackup(backup, oldDek);
		});
		adopted = true;
	}

	await replaceCatalog(collectionCatalog, uid, dek, backup.collections);
	await replaceCatalog(tagCatalog, uid, dek, backup.tags);
	await writeStoredEntries(uid, backup.entries, backup.includesImages);
	// En dernier : si une écriture échoue, rien n'a été supprimé et la restauration peut être relancée.
	const removed = await deleteStoredEntriesExcept(uid, new Set(backup.entries.map((entry) => entry.id)));
	resetEntries();
	return { restored: backup.entries.length, removed, adopted };
}
