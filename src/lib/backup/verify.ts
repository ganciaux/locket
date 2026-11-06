/**
 * Contrôle d'intégrité d'une sauvegarde, sans Firebase : la restauration et l'outil de lecture vérifient de la même
 * façon. Le manifeste (chiffré par la DEK) couvre ce que l'AES-GCM de chaque pièce ne voit pas : une pièce retirée ou
 * remplacée, les métadonnées et le trousseau.
 */
import { type Encrypted, decrypt, decryptJson, sha256 } from '$lib/crypto/crypto';
import { type Bytes, toBase64, utf8 } from '$lib/crypto/encoding';
import { galleryImageId, galleryThumbsId } from '$lib/entries/gallery';
import type { Backup, BackupCounts, BackupManifest } from './format';

export type BackupContent = Omit<Backup, 'manifest'>;
export type EncryptedPart = { encrypted: Encrypted; context: string };

export const MANIFEST_CONTEXT = 'backup/manifest';
export const COLLECTIONS_CONTEXT = 'meta/collections';
export const TAGS_CONTEXT = 'meta/tags';

export const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Tous les chiffrés sous la DEK, chacun avec son AAD (hors manifeste). */
export function encryptedParts(backup: BackupContent): EncryptedPart[] {
	const parts: EncryptedPart[] = [];
	const add = (encrypted: Encrypted | null | undefined, context: string) => {
		if (encrypted) parts.push({ encrypted, context });
	};
	for (const entry of backup.entries) {
		add(entry.data, `${entry.id}/data`);
		add(entry.thumb, `${entry.id}/thumb`);
		add(entry.image, `${entry.id}/image`);
		entry.gallery?.forEach((extra, i) => add(extra, `${galleryImageId(entry.id, i + 1)}/image`));
		add(entry.galleryThumbs, `${galleryThumbsId(entry.id)}/image`);
	}
	add(backup.collections, COLLECTIONS_CONTEXT);
	add(backup.tags, TAGS_CONTEXT);
	return parts;
}

export async function isReadable({ encrypted, context }: EncryptedPart, dek: CryptoKey): Promise<boolean> {
	try {
		await decrypt(dek, encrypted, context);
		return true;
	} catch {
		return false;
	}
}

/** Empreinte du contenu, trousseau compris. Chaque pièce est hachée à part : le fichier peut peser des centaines de Mo. */
export async function contentHash(backup: BackupContent): Promise<string> {
	const parts = [
		...encryptedParts(backup),
		{ encrypted: backup.keyring.wrappedDek, context: 'keyring/wrappedDek' },
		{ encrypted: backup.keyring.recoveryDek, context: 'keyring/recoveryDek' }
	];
	const hashes: Bytes[] = [];
	for (const { encrypted, context } of parts) {
		// Longueurs comprises : sans elles, un octet déplacé de `data` vers `iv` ne changerait pas l'empreinte.
		const { iv, data } = encrypted;
		const lengths = new Uint8Array(new Uint32Array([context.length, iv.length, data.length]).buffer);
		hashes.push(await sha256([lengths, utf8(context), iv, data]));
	}
	return toBase64(await sha256(hashes));
}

/** Nombre de fiches, de collections et de tags ; un catalogue illisible compte pour 0. */
export async function countContent(backup: BackupContent, dek: CryptoKey): Promise<BackupCounts> {
	const count = async (stored: Encrypted | null, context: string) =>
		stored ? ((await decryptJson<unknown[]>(dek, stored, context).catch(() => [])) as unknown[]).length : 0;
	return {
		entries: backup.entries.length,
		collections: await count(backup.collections, COLLECTIONS_CONTEXT),
		tags: await count(backup.tags, TAGS_CONTEXT)
	};
}

/** Ce que le contrôle a trouvé : rien de levé, à l'appelant de refuser (restauration) ou d'avertir (lecture). */
export type Integrity = {
	/** Pièces qui ne se déchiffrent pas à leur emplacement. */
	unreadable: number;
	counts: BackupCounts;
	/** null : manifeste illisible, rien ne prouve que le fichier est complet. */
	manifest: BackupManifest | null;
	/** Métadonnées ou empreinte différentes de celles scellées à l'export. */
	modified: boolean;
};

export async function inspectBackup(backup: Backup, dek: CryptoKey): Promise<Integrity> {
	let unreadable = 0;
	for (const part of encryptedParts(backup)) if (!(await isReadable(part, dek))) unreadable++;
	const counts = await countContent(backup, dek);
	const manifest = await decryptJson<BackupManifest>(dek, backup.manifest, MANIFEST_CONTEXT).catch(() => null);
	const modified =
		!!manifest &&
		(manifest.createdAt !== backup.createdAt ||
			manifest.includesImages !== backup.includesImages ||
			manifest.contentHash !== (await contentHash(backup)));
	return { unreadable, counts, manifest, modified };
}

const sameCounts = (a: BackupCounts, b: BackupCounts) =>
	a.entries === b.entries && a.collections === b.collections && a.tags === b.tags;

const describeCounts = (counts: BackupCounts) =>
	`${plural(counts.entries, 'fiche')}, ${plural(counts.collections, 'collection')} et ${plural(counts.tags, 'tag')}`;

/** Problèmes lisibles, dans l'ordre de gravité ; [] : fichier intact. */
export function integrityProblems({ unreadable, counts, manifest, modified }: Integrity): string[] {
	const problems: string[] = [];
	if (unreadable) problems.push(`${plural(unreadable, 'pièce')} illisible${unreadable > 1 ? 's' : ''} : fichier abîmé ou modifié.`);
	if (!manifest) {
		problems.push('Manifeste illisible : impossible de vérifier que le fichier est complet.');
		return problems;
	}
	if (!sameCounts(counts, manifest.counts))
		problems.push(`Contenu incomplet : ${describeCounts(counts)} au lieu de ${describeCounts(manifest.counts)}.`);
	if (modified) problems.push('Fichier modifié depuis son export.');
	if (manifest.skipped)
		problems.push(`${plural(manifest.skipped, 'pièce')} déjà illisible${manifest.skipped > 1 ? 's' : ''} à l'export, absente${manifest.skipped > 1 ? 's' : ''} du fichier.`);
	return problems;
}

const DAMAGED = 'Sauvegarde endommagée : une partie est illisible. Rien n’a été restauré.';

/** Contenu réel du fichier ; `skipped` : pièces déjà illisibles à l'export, donc absentes. */
export type BackupCheck = BackupCounts & { skipped: number };

/** Contrôle avant restauration : lève une erreur au moindre défaut. Retourne le contenu réel. */
export async function verifyBackup(backup: Backup, dek: CryptoKey): Promise<BackupCheck> {
	const { unreadable, counts, manifest, modified } = await inspectBackup(backup, dek);
	if (unreadable || !manifest) throw new Error(DAMAGED);
	if (!sameCounts(counts, manifest.counts))
		throw new Error(
			`Sauvegarde incomplète : ${describeCounts(counts)} au lieu de ${describeCounts(manifest.counts)}. Rien n’a été restauré.`
		);
	if (modified) throw new Error('Sauvegarde modifiée depuis son export. Rien n’a été restauré.');
	return { ...counts, skipped: manifest.skipped };
}

/** Au moins une pièce s'ouvre avec cette DEK : sinon la sauvegarde vient d'une autre clé. */
export async function opensWith(backup: Backup, dek: CryptoKey): Promise<boolean> {
	const manifest = { encrypted: backup.manifest, context: MANIFEST_CONTEXT };
	for (const part of [...encryptedParts(backup), manifest]) if (await isReadable(part, dek)) return true;
	return false;
}
