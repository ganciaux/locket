/**
 * Lecture d'une sauvegarde, sans Firebase ni écriture : pour l'outil de déchiffrement autonome.
 * À l'inverse de la restauration, une pièce abîmée n'arrête rien : tout ce qui se déchiffre est rendu, et les défauts
 * d'intégrité sont listés pour être signalés.
 */
import { decrypt, decryptJson, type Encrypted } from '$lib/crypto/crypto';
import type { Bytes } from '$lib/crypto/encoding';
import { type Collection, type Entry, type EntryData, type Tag, withRecoveredCollections } from '$lib/entries/model';
import type { Backup } from './format';
import { COLLECTIONS_CONTEXT, TAGS_CONTEXT, inspectBackup, integrityProblems } from './verify';

/** Une fiche lue : ses données, et ses images si elles sont lisibles (l'image complète manque d'une sauvegarde légère). */
export type ReadEntry = Entry & { thumb?: Bytes; image?: Bytes };

export type BackupReading = {
	collections: Collection[];
	tags: Tag[];
	/** Toutes les fiches lisibles, corbeille comprise (`deletedAt`). */
	entries: ReadEntry[];
	/** Défauts d'intégrité lisibles (voir `integrityProblems`) ; [] : fichier intact. */
	problems: string[];
	/** Date scellée dans le manifeste, seule authentique ; null s'il est illisible (celle du fichier n'est pas vérifiée). */
	createdAt: string | null;
};

const orUndefined = <T>(promise: Promise<T>): Promise<T | undefined> => promise.catch(() => undefined);

const readBytes = (dek: CryptoKey, encrypted: Encrypted | undefined, context: string) =>
	encrypted ? orUndefined(decrypt(dek, encrypted, context)) : Promise.resolve(undefined);

export async function readBackup(backup: Backup, dek: CryptoKey): Promise<BackupReading> {
	const integrity = await inspectBackup(backup, dek);
	const problems = integrityProblems(integrity);
	const catalog = async <T>(encrypted: Encrypted | null, context: string): Promise<T[]> =>
		encrypted ? ((await orUndefined(decryptJson<T[]>(dek, encrypted, context))) ?? []) : [];

	const entries: ReadEntry[] = [];
	for (const stored of backup.entries) {
		const data = await orUndefined(decryptJson<EntryData>(dek, stored.data, `${stored.id}/data`));
		if (!data) continue;
		const [thumb, image] = await Promise.all([
			readBytes(dek, stored.thumb, `${stored.id}/thumb`),
			readBytes(dek, stored.image, `${stored.id}/image`)
		]);
		entries.push({ ...data, id: stored.id, ...(thumb && { thumb }), ...(image && { image }) });
	}
	return {
		// Une fiche dont le catalogue des collections est perdu reste visible, sous un nom provisoire.
		collections: withRecoveredCollections(await catalog<Collection>(backup.collections, COLLECTIONS_CONTEXT), entries),
		tags: await catalog<Tag>(backup.tags, TAGS_CONTEXT),
		entries,
		problems,
		createdAt: integrity.manifest?.createdAt ?? null
	};
}
