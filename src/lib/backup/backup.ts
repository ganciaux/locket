/**
 * Sauvegarde chiffrée et restauration.
 * Le fichier est la source de vérité : après restauration, le compte contient ce qu'il contient, ni plus ni moins.
 *  - Même DEK (cas courant) : fiches et catalogues sont remplacés, les fiches absentes du fichier supprimées.
 *  - DEK différente (compte recréé) : le compte, s'il est vide, adopte la DEK de la sauvegarde
 *    grâce à l'ancien mot de passe ou à l'ancienne clé de récupération.
 */
import { adoptBackupKeyring, checkRecoveryKey, readCurrentKeyring, verifyPassword } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { type Encrypted, decrypt, decryptJson, encryptJson, sha256 } from '$lib/crypto/crypto';
import { type Bytes, toBase64, utf8 } from '$lib/crypto/encoding';
import { deleteStoredEntriesExcept, hasEntries, readStoredEntries, writeStoredEntries } from '$lib/entries/repository';
import { resetEntries } from '$lib/entries/store.svelte';
import { collectionCatalog, tagCatalog } from '$lib/entries/catalog';
import { type Backup, type BackupCounts, type BackupEntry, type BackupManifest, serializeBackup } from './format';

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
		entries.push({ id: entry.id, data, ...(thumb && { thumb }), ...(image && { image }) });
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

type BackupContent = Omit<Backup, 'manifest'>;
type EncryptedPart = { encrypted: Encrypted; context: string };

const MANIFEST_CONTEXT = 'backup/manifest';

/** Tous les chiffrés sous la DEK, chacun avec son AAD (hors manifeste). */
function encryptedParts(backup: BackupContent): EncryptedPart[] {
	const parts: EncryptedPart[] = [];
	const add = (encrypted: Encrypted | null | undefined, context: string) => {
		if (encrypted) parts.push({ encrypted, context });
	};
	for (const entry of backup.entries) {
		add(entry.data, `${entry.id}/data`);
		add(entry.thumb, `${entry.id}/thumb`);
		add(entry.image, `${entry.id}/image`);
	}
	add(backup.collections, 'meta/collections');
	add(backup.tags, 'meta/tags');
	return parts;
}

async function isReadable({ encrypted, context }: EncryptedPart, dek: CryptoKey): Promise<boolean> {
	try {
		await decrypt(dek, encrypted, context);
		return true;
	} catch {
		return false;
	}
}

/** Empreinte du contenu, trousseau compris. Chaque pièce est hachée à part : le fichier peut peser des centaines de Mo. */
async function contentHash(backup: BackupContent): Promise<string> {
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

async function countContent(backup: BackupContent, dek: CryptoKey): Promise<BackupCounts> {
	const count = async <T>(catalog: { decrypt(dek: CryptoKey, e: Encrypted): Promise<T[]> }, stored: Encrypted | null) =>
		stored ? (await catalog.decrypt(dek, stored)).length : 0;
	return {
		entries: backup.entries.length,
		collections: await count(collectionCatalog, backup.collections),
		tags: await count(tagCatalog, backup.tags)
	};
}

const DAMAGED = 'Sauvegarde endommagée : une partie est illisible. Rien n’a été restauré.';

export const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Contenu réel du fichier ; `skipped` : pièces déjà illisibles à l'export, donc absentes. */
export type BackupCheck = BackupCounts & { skipped: number };

/** Contrôle tout le fichier, sans rien écrire. Retourne son contenu réel ; lève une erreur s'il est altéré. */
async function verifyBackup(backup: Backup, dek: CryptoKey): Promise<BackupCheck> {
	for (const part of encryptedParts(backup)) if (!(await isReadable(part, dek))) throw new Error(DAMAGED);
	const counts = await countContent(backup, dek);

	let manifest: BackupManifest;
	try {
		manifest = await decryptJson<BackupManifest>(dek, backup.manifest, MANIFEST_CONTEXT);
	} catch {
		throw new Error(DAMAGED);
	}
	const expected = manifest.counts;
	if (counts.entries !== expected.entries || counts.collections !== expected.collections || counts.tags !== expected.tags)
		throw new Error(
			`Sauvegarde incomplète : ${plural(counts.entries, 'fiche')}, ${plural(counts.collections, 'collection')} et ` +
				`${plural(counts.tags, 'tag')} au lieu de ${plural(expected.entries, 'fiche')}, ` +
				`${plural(expected.collections, 'collection')} et ${plural(expected.tags, 'tag')}. Rien n’a été restauré.`
		);
	if (
		manifest.createdAt !== backup.createdAt ||
		manifest.includesImages !== backup.includesImages ||
		manifest.contentHash !== (await contentHash(backup))
	)
		throw new Error('Sauvegarde modifiée depuis son export. Rien n’a été restauré.');
	return { ...counts, skipped: manifest.skipped };
}

/** Contrôle à la sélection du fichier. null : autre clé, le contrôle n'est possible qu'à la restauration. */
export async function checkBackup(backup: Backup): Promise<BackupCheck | null> {
	const { dek } = unlockedSession();
	return (await opensWith(backup, dek)) ? verifyBackup(backup, dek) : null;
}

async function opensWith(backup: Backup, dek: CryptoKey): Promise<boolean> {
	const manifest = { encrypted: backup.manifest, context: MANIFEST_CONTEXT };
	for (const part of [...encryptedParts(backup), manifest]) if (await isReadable(part, dek)) return true;
	return false;
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
	save(uid: string, dek: CryptoKey, items: T[]): Promise<void>;
};

async function replaceCatalog<T>(catalog: Catalog<T>, uid: string, dek: CryptoKey, fromFile: Encrypted | null): Promise<void> {
	await catalog.save(uid, dek, fromFile ? await catalog.decrypt(dek, fromFile) : []);
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
