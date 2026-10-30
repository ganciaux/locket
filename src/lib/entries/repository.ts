/**
 * Fiches dans Firestore, toujours chiffrées par la DEK :
 *   users/{uid}/entries/{id} : { data, thumb? }  (lu pour la liste)
 *   users/{uid}/images/{id}  : { image }         (lu seulement à l'ouverture d'une fiche)
 * Le SDK web lit les documents en entier : l'image à part évite de la télécharger pour afficher la liste.
 * AAD = "<id>/<champ>" : un chiffré déplacé vers une autre fiche ou un autre champ ne se déchiffre plus.
 */
import { type DocumentReference, collection, doc, getDoc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { type Encrypted, decrypt, decryptJson, encrypt, encryptJson } from '$lib/crypto/crypto';
import type { Bytes } from '$lib/crypto/encoding';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import { type Entry, type EntryData, type Link, fitsInDoc, parseRating } from './model';

type StoredEntry = { data: StoredEncrypted; thumb?: StoredEncrypted };
type StoredImage = { image: StoredEncrypted };

/** Image prête à chiffrer (voir images.ts). */
export type PreparedImage = { type: string; image: Bytes; thumb: Bytes };

/** Fiche de la liste : métadonnées + miniature déchiffrée. */
export type EntrySummary = Entry & { thumb?: Bytes };

const entriesRef = (uid: string) => collection(db, 'users', uid, 'entries');
const entryRef = (uid: string, id: string) => doc(db, 'users', uid, 'entries', id);
const imageRef = (uid: string, id: string) => doc(db, 'users', uid, 'images', id);

async function decryptSummary(dek: CryptoKey, id: string, stored: StoredEntry): Promise<EntrySummary> {
	const data = await decryptJson<EntryData>(dek, fromStored(stored.data), `${id}/data`);
	// Une miniature abîmée ne doit pas rendre illisible une fiche saine : elle s'affiche sans.
	const thumb = stored.thumb ? await decrypt(dek, fromStored(stored.thumb), `${id}/thumb`).catch(() => undefined) : undefined;
	return { ...data, id, thumb };
}

/**
 * Une fiche illisible (altérée) n'empêche pas de lire les autres : `onUnreadable` reçoit son id.
 * Sans `onUnreadable`, l'erreur est levée.
 */
export async function listEntries(
	uid: string,
	dek: CryptoKey,
	onUnreadable?: (id: string) => void
): Promise<EntrySummary[]> {
	const snapshot = await getDocs(entriesRef(uid));
	const results = await Promise.all(
		snapshot.docs.map(async (d) => {
			try {
				return await decryptSummary(dek, d.id, d.data() as StoredEntry);
			} catch (e) {
				if (!onUnreadable) throw e;
				onUnreadable(d.id);
				return null;
			}
		})
	);
	return results.filter((entry) => entry !== null);
}

export async function getEntry(uid: string, dek: CryptoKey, id: string): Promise<EntrySummary | null> {
	const snapshot = await getDoc(entryRef(uid, id));
	return snapshot.exists() ? decryptSummary(dek, id, snapshot.data() as StoredEntry) : null;
}

export async function getImage(uid: string, dek: CryptoKey, id: string): Promise<Bytes | null> {
	const snapshot = await getDoc(imageRef(uid, id));
	if (!snapshot.exists()) return null;
	return decrypt(dek, fromStored((snapshot.data() as StoredImage).image), `${id}/image`);
}

export type EntryInput = {
	collectionId: string;
	name: string;
	links: Link[];
	tagIds: string[];
	siteTerms?: Record<string, string>;
	hiddenSites?: string[];
	hidden?: boolean;
	rating?: number;
	/** undefined : image inchangée ; null : supprimée ; sinon : remplacée. */
	image?: PreparedImage | null;
};

/**
 * Crée (`existing` absent) ou met à jour une fiche. Chaque champ réécrit est rechiffré avec un IV neuf ;
 * fiche et image sont écrites dans le même lot (tout ou rien).
 */
export async function saveEntry(
	uid: string,
	dek: CryptoKey,
	input: EntryInput,
	existing?: EntrySummary
): Promise<EntrySummary> {
	const id = existing?.id ?? doc(entriesRef(uid)).id;
	const now = Date.now();
	const keepImage = input.image === undefined;
	const imageType = keepImage ? existing?.imageType : input.image?.type;
	const data: EntryData = {
		collectionId: input.collectionId,
		name: input.name.trim(),
		links: input.links,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		...(imageType && { imageType }),
		...(input.tagIds.length && { tagIds: input.tagIds }),
		...(input.siteTerms && Object.keys(input.siteTerms).length && { siteTerms: input.siteTerms }),
		...(input.hiddenSites?.length && { hiddenSites: input.hiddenSites }),
		...(parseRating(input.rating) && { rating: input.rating }),
		...(input.hidden && { hidden: true })
	};

	const batch = writeBatch(db);
	const stored: StoredEntry = { data: toStored(await encryptJson(dek, data, `${id}/data`)) };
	const thumb = keepImage ? existing?.thumb : input.image?.thumb;
	if (thumb) stored.thumb = toStored(await encrypt(dek, thumb, `${id}/thumb`));

	if (input.image) {
		const image = await encrypt(dek, input.image.image, `${id}/image`);
		if (!fitsInDoc(image.data)) throw new Error('Image trop volumineuse.');
		batch.set(imageRef(uid, id), { image: toStored(image) } satisfies StoredImage);
	} else if (input.image === null) {
		batch.delete(imageRef(uid, id));
	}
	batch.set(entryRef(uid, id), stored);
	await batch.commit();

	return { ...data, id, thumb };
}

/** Un lot Firestore accepte 500 écritures ; on reste en dessous. */
const IMPORT_BATCH_SIZE = 400;

/** Crée des fiches sans lien ni image (import d'une liste de noms) dans une collection, par lots. */
export async function createEntries(
	uid: string,
	dek: CryptoKey,
	collectionId: string,
	names: string[]
): Promise<EntrySummary[]> {
	const created: EntrySummary[] = [];
	for (let start = 0; start < names.length; start += IMPORT_BATCH_SIZE) {
		const batch = writeBatch(db);
		for (const name of names.slice(start, start + IMPORT_BATCH_SIZE)) {
			const id = doc(entriesRef(uid)).id;
			const now = Date.now();
			const data: EntryData = { collectionId, name, links: [], createdAt: now, updatedAt: now };
			batch.set(entryRef(uid, id), { data: toStored(await encryptJson(dek, data, `${id}/data`)) } satisfies StoredEntry);
			created.push({ ...data, id });
		}
		await batch.commit();
	}
	return created;
}

/**
 * Modifie plusieurs fiches en réécrivant seulement `data` (IV neuf) : miniature et image ne sont pas retouchées.
 * Par lots : une panne peut laisser une partie des fiches modifiées, il suffit alors de relancer.
 */
export async function patchStoredEntries<T extends EntrySummary & { thumbUrl?: string }>(
	uid: string,
	dek: CryptoKey,
	entries: T[],
	patch: (entry: T) => Partial<EntryData>
): Promise<T[]> {
	const updated: T[] = [];
	for (let start = 0; start < entries.length; start += IMPORT_BATCH_SIZE) {
		const batch = writeBatch(db);
		for (const entry of entries.slice(start, start + IMPORT_BATCH_SIZE)) {
			const next = { ...entry, ...patch(entry) };
			const { id, thumb: _thumb, thumbUrl: _thumbUrl, ...data } = next;
			batch.update(entryRef(uid, id), { data: toStored(await encryptJson(dek, data, `${id}/data`)) });
			updated.push(next);
		}
		await batch.commit();
	}
	return updated;
}

export async function deleteEntries(uid: string, ids: string[]): Promise<void> {
	await deleteInBatches(ids.flatMap((id) => [entryRef(uid, id), imageRef(uid, id)]));
}

export async function deleteEntry(uid: string, id: string): Promise<void> {
	const batch = writeBatch(db);
	batch.delete(entryRef(uid, id));
	batch.delete(imageRef(uid, id));
	await batch.commit();
}

// ---------------------------------------------------------------------------
// Sauvegarde : documents bruts (toujours chiffrés), sans passer par la DEK.

export type StoredEntryCopy = { id: string; data: Encrypted; thumb?: Encrypted; image?: Encrypted };

export async function readStoredEntries(uid: string, includeImages: boolean): Promise<StoredEntryCopy[]> {
	const [entrySnaps, imageSnaps] = await Promise.all([
		getDocs(entriesRef(uid)),
		includeImages ? getDocs(collection(db, 'users', uid, 'images')) : null
	]);
	const images = new Map(imageSnaps?.docs.map((d) => [d.id, fromStored((d.data() as StoredImage).image)]));
	return entrySnaps.docs.map((d) => {
		const stored = d.data() as StoredEntry;
		const image = images.get(d.id);
		return {
			id: d.id,
			data: fromStored(stored.data),
			...(stored.thumb && { thumb: fromStored(stored.thumb) }),
			...(image && { image })
		};
	});
}

export async function hasEntries(uid: string): Promise<boolean> {
	return !(await getDocs(query(entriesRef(uid), limit(1)))).empty;
}

/** Un lot Firestore : 500 écritures et ~10 Mo par requête au plus ; on garde de la marge. */
const MAX_BATCH_WRITES = 400;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;

/**
 * Écrit des fiches restaurées telles quelles (même id, donc même AAD) : remplace ou ajoute.
 * Avec les images : l'image est restaurée, ou supprimée si la fiche n'en avait pas.
 * Sans les images (sauvegarde légère) : les images en place ne sont pas touchées.
 */
export async function writeStoredEntries(
	uid: string,
	entries: StoredEntryCopy[],
	includesImages: boolean
): Promise<void> {
	let batch = writeBatch(db);
	let writes = 0;
	let bytes = 0;
	for (const entry of entries) {
		const size = entry.data.data.length + (entry.thumb?.data.length ?? 0) + (entry.image?.data.length ?? 0);
		if (writes + 2 > MAX_BATCH_WRITES || (writes > 0 && bytes + size > MAX_BATCH_BYTES)) {
			await batch.commit();
			batch = writeBatch(db);
			writes = bytes = 0;
		}
		const stored: StoredEntry = { data: toStored(entry.data), ...(entry.thumb && { thumb: toStored(entry.thumb) }) };
		batch.set(entryRef(uid, entry.id), stored);
		if (entry.image) batch.set(imageRef(uid, entry.id), { image: toStored(entry.image) } satisfies StoredImage);
		else if (includesImages) batch.delete(imageRef(uid, entry.id));
		writes += 2;
		bytes += size;
	}
	if (writes) await batch.commit();
}

/** Supprime les fiches hors de `keep`, avec leurs images (restauration, suppression totale). Retourne leur nombre. */
export async function deleteStoredEntriesExcept(uid: string, keep: Set<string>): Promise<number> {
	const ids = (await getDocs(entriesRef(uid))).docs.map((d) => d.id).filter((id) => !keep.has(id));
	await deleteEntries(uid, ids);
	return ids.length;
}

/** Après `deleteStoredEntriesExcept` : il ne reste que d'éventuelles images orphelines, la lecture est donc légère. */
export async function deleteRemainingImages(uid: string): Promise<void> {
	await deleteInBatches((await getDocs(collection(db, 'users', uid, 'images'))).docs.map((d) => d.ref));
}

async function deleteInBatches(refs: DocumentReference[]): Promise<void> {
	for (let start = 0; start < refs.length; start += MAX_BATCH_WRITES) {
		const batch = writeBatch(db);
		for (const ref of refs.slice(start, start + MAX_BATCH_WRITES)) batch.delete(ref);
		await batch.commit();
	}
}
