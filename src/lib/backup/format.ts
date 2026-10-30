/**
 * Format du fichier de sauvegarde : les documents Firestore tels quels (chiffrés), en base64.
 * Illisible sans le mot de passe ou la clé de récupération de l'époque. Fonctions pures, testées.
 */
import type { Encrypted } from '$lib/crypto/crypto';
import { fromBase64, toBase64 } from '$lib/crypto/encoding';

export const BACKUP_FORMAT = 'locket-backup';
/** 4 : manifeste chiffré, empreinte avec longueurs. Les versions précédentes ne sont pas lues : aucune n'est à conserver. */
export const BACKUP_VERSION = 4;

type EncryptedText = { iv: string; data: string };

export type BackupEntry = { id: string; data: Encrypted; thumb?: Encrypted; image?: Encrypted };

export type BackupCounts = { entries: number; collections: number; tags: number };

/**
 * Déchiffré avec la DEK (AAD `backup/manifest`). Sans elle, impossible de le recalculer après avoir modifié le fichier.
 * Il couvre ce que l'AES-GCM de chaque champ ne voit pas : une pièce retirée ou remplacée, les métadonnées et le trousseau.
 */
export type BackupManifest = {
	createdAt: string;
	includesImages: boolean;
	counts: BackupCounts;
	/** Pièces illisibles écartées à l'export : le fichier est alors incomplet dès l'origine. */
	skipped: number;
	/** Voir `contentHash` dans backup.ts. */
	contentHash: string;
};

export type Backup = {
	createdAt: string;
	/** false : sauvegarde « légère », les images complètes n'y sont pas. */
	includesImages: boolean;
	/** Les deux copies emballées de la DEK : permettent la restauration dans un compte recréé. */
	keyring: { wrappedDek: Encrypted; recoveryDek: Encrypted };
	/** Catalogues chiffrés (`meta/collections`, `meta/tags`) ; null s'ils n'existent pas encore. */
	collections: Encrypted | null;
	tags: Encrypted | null;
	entries: BackupEntry[];
	manifest: Encrypted;
};

const encode = (e: Encrypted): EncryptedText => ({ iv: toBase64(e.iv), data: toBase64(e.data) });

export function serializeBackup(backup: Backup): string {
	return JSON.stringify({
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		createdAt: backup.createdAt,
		includesImages: backup.includesImages,
		keyring: { wrappedDek: encode(backup.keyring.wrappedDek), recoveryDek: encode(backup.keyring.recoveryDek) },
		collections: backup.collections && encode(backup.collections),
		tags: backup.tags && encode(backup.tags),
		manifest: encode(backup.manifest),
		entries: backup.entries.map((e) => ({
			id: e.id,
			data: encode(e.data),
			...(e.thumb && { thumb: encode(e.thumb) }),
			...(e.image && { image: encode(e.image) })
		}))
	});
}

// ---------------------------------------------------------------------------
// Lecture : le fichier vient de l'extérieur, on vérifie tout.

const INVALID = 'Fichier de sauvegarde invalide ou endommagé.';
const IV_LENGTH = 12;

/** Identifiants Firestore générés par l'app : un chemin (« / ») permettrait d'écrire ailleurs. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function decode(value: unknown): Encrypted {
	if (!isObject(value) || typeof value.iv !== 'string' || typeof value.data !== 'string') throw new Error(INVALID);
	let encrypted: Encrypted;
	try {
		encrypted = { iv: fromBase64(value.iv), data: fromBase64(value.data) };
	} catch {
		throw new Error(INVALID);
	}
	if (encrypted.iv.length !== IV_LENGTH) throw new Error(INVALID);
	return encrypted;
}

const decodeOptional = (value: unknown): Encrypted | undefined => (value === undefined ? undefined : decode(value));
const decodeNullable = (value: unknown): Encrypted | null => (value === null || value === undefined ? null : decode(value));

export function parseBackup(text: string): Backup {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('Ce fichier n’est pas une sauvegarde Stash.');
	}
	if (!isObject(raw) || raw.format !== BACKUP_FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde Stash.');
	if (raw.version !== BACKUP_VERSION) throw new Error('Version de sauvegarde non prise en charge.');
	if (typeof raw.createdAt !== 'string' || typeof raw.includesImages !== 'boolean') throw new Error(INVALID);
	if (!isObject(raw.keyring) || !Array.isArray(raw.entries)) throw new Error(INVALID);

	const ids = new Set<string>();
	const entries = raw.entries.map((entry): BackupEntry => {
		if (!isObject(entry) || typeof entry.id !== 'string' || !SAFE_ID.test(entry.id) || ids.has(entry.id))
			throw new Error(INVALID);
		ids.add(entry.id);
		const image = decodeOptional(entry.image);
		const thumb = decodeOptional(entry.thumb);
		return { id: entry.id, data: decode(entry.data), ...(thumb && { thumb }), ...(image && { image }) };
	});

	return {
		createdAt: raw.createdAt,
		includesImages: raw.includesImages,
		keyring: { wrappedDek: decode(raw.keyring.wrappedDek), recoveryDek: decode(raw.keyring.recoveryDek) },
		collections: decodeNullable(raw.collections),
		tags: decodeNullable(raw.tags),
		entries,
		manifest: decode(raw.manifest)
	};
}

/** Nom du fichier proposé au téléchargement : stash-sauvegarde-AAAA-MM-JJ.json */
export const backupFileName = (date: Date): string =>
	`stash-sauvegarde-${date.toISOString().slice(0, 10)}.json`;
