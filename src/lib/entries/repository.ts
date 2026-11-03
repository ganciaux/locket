/**
 * Fiches dans Firestore, toujours chiffrées par la DEK :
 *   users/{uid}/entries/{id} : { data, thumb? }  (lu pour la liste)
 *   users/{uid}/images/{id}  : { image }         (lu seulement à l'ouverture d'une fiche)
 * Le SDK web lit les documents en entier : l'image à part évite de la télécharger pour afficher la liste.
 * AAD = "<id>/<champ>" : un chiffré déplacé vers une autre fiche ou un autre champ ne se déchiffre plus.
 *   users/{uid}/meta/version : { token }         (aléa changé à chaque écriture de fiche, voir `commitEntries`)
 */
import {
	Bytes as FirestoreBytes,
	type DocumentReference,
	type Transaction,
	collection,
	doc,
	getDoc,
	getDocs,
	limit,
	query,
	runTransaction,
	writeBatch
} from 'firebase/firestore';
import { type Encrypted, decrypt, decryptJson, encrypt, encryptJson, randomBytes } from '$lib/crypto/crypto';
import type { Bytes } from '$lib/crypto/encoding';
import { auth, db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import { type CacheChanges, type CachedEntry, applyToCache, cachedToken, clearCache, fillCache, readCache } from './cache';
import { type Entry, type EntryData, type Link, fitsInDoc, parseBirthYear, parseCountry, parseRating } from './model';

type StoredEntry = { data: StoredEncrypted; thumb?: StoredEncrypted };
type StoredImage = { image: StoredEncrypted };

/** Image prête à chiffrer (voir images.ts). */
export type PreparedImage = { type: string; image: Bytes; thumb: Bytes };

/** Fiche de la liste : métadonnées + miniature déchiffrée. */
export type EntrySummary = Entry & { thumb?: Bytes };

const entriesRef = (uid: string) => collection(db, 'users', uid, 'entries');
const entryRef = (uid: string, id: string) => doc(db, 'users', uid, 'entries', id);
const imageRef = (uid: string, id: string) => doc(db, 'users', uid, 'images', id);
const versionRef = (uid: string) => doc(db, 'users', uid, 'meta', 'version');

const toCached = (id: string, stored: StoredEntry): CachedEntry => ({
	id,
	data: fromStored(stored.data),
	...(stored.thumb && { thumb: fromStored(stored.thumb) })
});

/**
 * Seule porte d'écriture des fiches : le jeton change dans la même transaction, un appareil à jour ne manque donc pas
 * une modification faite par cette version de l'app (les règles Firestore ne l'imposent pas). La copie locale ne suit que si le jeton lu est le sien : sinon un autre appareil a écrit entre-temps,
 * et elle sera rechargée au prochain déverrouillage.
 * Une à la fois : en parallèle, les transactions se disputeraient le jeton jusqu'à échouer.
 */
function commitEntries(uid: string, write: (writes: Transaction) => void, changes: CacheChanges): Promise<void> {
	const commit = commitQueue.then(() => commitNow(uid, write, changes));
	commitQueue = commit.catch(() => {});
	return commit;
}

let commitQueue: Promise<void> = Promise.resolve();

async function commitNow(uid: string, write: (writes: Transaction) => void, changes: CacheChanges): Promise<void> {
	const known = await cachedToken(uid);
	const next = FirestoreBytes.fromUint8Array(randomBytes(16));
	const inSync = await runTransaction(db, async (writes) => {
		const version = await writes.get(versionRef(uid));
		write(writes);
		writes.set(versionRef(uid), { token: next });
		return (version.data()?.token as FirestoreBytes | undefined)?.toBase64() === known;
	});
	if (known && inSync) await applyToCache(uid, known, next.toBase64(), changes);
}

async function decryptSummary(dek: CryptoKey, stored: CachedEntry): Promise<EntrySummary> {
	const { id } = stored;
	const data = await decryptJson<EntryData>(dek, stored.data, `${id}/data`);
	// Une miniature abîmée ne doit pas rendre illisible une fiche saine : elle s'affiche sans.
	const thumb = stored.thumb ? await decrypt(dek, stored.thumb, `${id}/thumb`).catch(() => undefined) : undefined;
	return { ...data, id, thumb };
}

async function decryptSummaries(dek: CryptoKey, stored: CachedEntry[], onUnreadable?: (id: string) => void) {
	const results = await Promise.all(
		stored.map(async (entry) => {
			try {
				return await decryptSummary(dek, entry);
			} catch (e) {
				if (!onUnreadable) throw e;
				onUnreadable(entry.id);
				return null;
			}
		})
	);
	return results.filter((entry) => entry !== null);
}

/**
 * Une fiche illisible (altérée) n'empêche pas de lire les autres : `onUnreadable` reçoit son id.
 * Sans `onUnreadable`, l'erreur est levée.
 * Le jeton est lu avant les fiches : une écriture entre les deux laisse au pire une copie à recharger, jamais une copie
 * périmée sous un jeton à jour.
 */
export async function listEntries(
	uid: string,
	dek: CryptoKey,
	onUnreadable?: (id: string) => void
): Promise<EntrySummary[]> {
	const version = await getDoc(versionRef(uid));
	const token = (version.data()?.token as FirestoreBytes | undefined)?.toBase64();
	const cached = token ? await readCache(uid, token) : null;
	if (cached) {
		let damaged = false;
		const list = await decryptSummaries(dek, cached, () => (damaged = true));
		// Une miniature perdue ici disparaîtrait de Firestore à la prochaine modification de la fiche.
		const withThumb = new Set(cached.filter((entry) => entry.thumb).map((entry) => entry.id));
		if (!damaged && !list.some((entry) => withThumb.has(entry.id) && !entry.thumb)) return list;
		// La suppression des fiches illisibles agit sur Firestore : seule sa version peut les déclarer telles.
		await clearCache();
	}
	const snapshot = await getDocs(entriesRef(uid));
	const stored = snapshot.docs.map((d) => toCached(d.id, d.data() as StoredEntry));
	// Hors réseau, le SDK peut répondre sans erreur avec une liste partielle ; après une déconnexion, plus rien à garder.
	if (token && !snapshot.metadata.fromCache && auth.currentUser?.uid === uid) await fillCache(uid, token, stored);
	return decryptSummaries(dek, stored, onUnreadable);
}

export async function getEntry(uid: string, dek: CryptoKey, id: string): Promise<EntrySummary | null> {
	const snapshot = await getDoc(entryRef(uid, id));
	return snapshot.exists() ? decryptSummary(dek, toCached(id, snapshot.data() as StoredEntry)) : null;
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
	shownSites?: string[];
	hidden?: boolean;
	rating?: number;
	country?: string;
	birthYear?: number;
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
		...(input.shownSites?.length && { shownSites: input.shownSites }),
		...(parseRating(input.rating) && { rating: input.rating }),
		...(parseCountry(input.country) && { country: input.country }),
		...(parseBirthYear(input.birthYear) && { birthYear: input.birthYear }),
		...(input.hidden && { hidden: true })
	};

	const stored: StoredEntry = { data: toStored(await encryptJson(dek, data, `${id}/data`)) };
	const thumb = keepImage ? existing?.thumb : input.image?.thumb;
	if (thumb) stored.thumb = toStored(await encrypt(dek, thumb, `${id}/thumb`));

	const image = input.image ? await encrypt(dek, input.image.image, `${id}/image`) : undefined;
	if (image && !fitsInDoc(image.data)) throw new Error('Image trop volumineuse.');
	await commitEntries(
		uid,
		(writes) => {
			if (image) writes.set(imageRef(uid, id), { image: toStored(image) } satisfies StoredImage);
			else if (input.image === null) writes.delete(imageRef(uid, id));
			writes.set(entryRef(uid, id), stored);
		},
		{ put: [toCached(id, stored)] }
	);

	return { ...data, id, thumb };
}

/** Un lot Firestore accepte 500 écritures ; on reste en dessous. */
const IMPORT_BATCH_SIZE = 400;

/** Fiche créée par l'import : un nom, et les champs donnés par le tableau. */
export type EntryDraft = Pick<EntryData, 'name' | 'country' | 'birthYear' | 'rating' | 'tagIds'>;

/** Crée des fiches sans lien ni image (import d'un tableau) dans une collection, par lots. */

export async function createEntries(
	uid: string,
	dek: CryptoKey,
	collectionId: string,
	drafts: EntryDraft[]
): Promise<EntrySummary[]> {
	const created: EntrySummary[] = [];
	for (let start = 0; start < drafts.length; start += IMPORT_BATCH_SIZE) {
		const stored: CachedEntry[] = [];
		for (const draft of drafts.slice(start, start + IMPORT_BATCH_SIZE)) {
			const id = doc(entriesRef(uid)).id;
			const now = Date.now();
			const data: EntryData = { ...draft, collectionId, links: [], createdAt: now, updatedAt: now };
			stored.push({ id, data: await encryptJson(dek, data, `${id}/data`) });
			created.push({ ...data, id });
		}
		await commitEntries(
			uid,
			(writes) => stored.forEach(({ id, data }) => writes.set(entryRef(uid, id), { data: toStored(data) } satisfies StoredEntry)),
			{ put: stored }
		);
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
		const patched: Pick<CachedEntry, 'id' | 'data'>[] = [];
		const chunk: T[] = [];
		for (const entry of entries.slice(start, start + IMPORT_BATCH_SIZE)) {
			const next = { ...entry, ...patch(entry) };
			const { id, thumb: _thumb, thumbUrl: _thumbUrl, ...data } = next;
			patched.push({ id, data: await encryptJson(dek, data, `${id}/data`) });
			chunk.push(next);
		}
		await commitEntries(
			uid,
			(writes) => patched.forEach(({ id, data }) => writes.update(entryRef(uid, id), { data: toStored(data) })),
			{ patch: patched }
		);
		updated.push(...chunk);
	}
	return updated;
}

/** Remplace seulement des miniatures (IV neuf) : `data` et l'image ne sont pas retouchées. */
export async function saveThumbs(uid: string, dek: CryptoKey, thumbs: { id: string; thumb: Bytes }[]): Promise<void> {
	const patched = await Promise.all(thumbs.map(async ({ id, thumb }) => ({ id, thumb: await encrypt(dek, thumb, `${id}/thumb`) })));
	await commitEntries(
		uid,
		(writes) => patched.forEach(({ id, thumb }) => writes.update(entryRef(uid, id), { thumb: toStored(thumb) })),
		{ patch: patched }
	);
}

export async function deleteEntries(uid: string, ids: string[]): Promise<void> {
	const size = MAX_BATCH_WRITES / 2; // fiche + image
	for (let start = 0; start < ids.length; start += size) {
		const chunk = ids.slice(start, start + size);
		await commitEntries(
			uid,
			(writes) =>
				chunk.forEach((id) => {
					writes.delete(entryRef(uid, id));
					writes.delete(imageRef(uid, id));
				}),
			{ remove: chunk }
		);
	}
}

export const deleteEntry = (uid: string, id: string): Promise<void> => deleteEntries(uid, [id]);

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
	async function commit(chunk: StoredEntryCopy[]) {
		await commitEntries(
			uid,
			(writes) => {
				for (const entry of chunk) {
					const stored: StoredEntry = { data: toStored(entry.data), ...(entry.thumb && { thumb: toStored(entry.thumb) }) };
					writes.set(entryRef(uid, entry.id), stored);
					if (entry.image) writes.set(imageRef(uid, entry.id), { image: toStored(entry.image) } satisfies StoredImage);
					else if (includesImages) writes.delete(imageRef(uid, entry.id));
				}
			},
			// Sans le champ image : le cache ne garde jamais d'image complète.
			{ put: chunk.map(({ id, data, thumb }) => ({ id, data, ...(thumb && { thumb }) })) }
		);
	}

	let chunk: StoredEntryCopy[] = [];
	let bytes = 0;
	for (const entry of entries) {
		const size = entry.data.data.length + (entry.thumb?.data.length ?? 0) + (entry.image?.data.length ?? 0);
		if ((chunk.length + 1) * 2 > MAX_BATCH_WRITES || (chunk.length > 0 && bytes + size > MAX_BATCH_BYTES)) {
			await commit(chunk);
			chunk = [];
			bytes = 0;
		}
		chunk.push(entry);
		bytes += size;
	}
	if (chunk.length) await commit(chunk);
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
