/**
 * Fiches dans Firestore, toujours chiffrées par la DEK :
 *   users/{uid}/entries/{id} : { data, thumb? }  (lu pour la liste)
 *   users/{uid}/images/{id}  : { image }         (lu seulement à l'ouverture d'une fiche)
 * Le SDK web lit les documents en entier : l'image à part évite de la télécharger pour afficher la liste.
 * AAD = "<id>/<champ>" : un chiffré déplacé vers une autre fiche ou un autre champ ne se déchiffre plus.
 */
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { decrypt, decryptJson, encrypt, encryptJson } from '$lib/crypto/crypto';
import type { Bytes } from '$lib/crypto/encoding';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import { type Entry, type EntryData, type Link, fitsInDoc } from './model';

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
	const thumb = stored.thumb ? await decrypt(dek, fromStored(stored.thumb), `${id}/thumb`) : undefined;
	return { ...data, id, thumb };
}

export async function listEntries(uid: string, dek: CryptoKey): Promise<EntrySummary[]> {
	const snapshot = await getDocs(entriesRef(uid));
	return Promise.all(snapshot.docs.map((d) => decryptSummary(dek, d.id, d.data() as StoredEntry)));
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
	name: string;
	links: Link[];
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
		name: input.name.trim(),
		links: input.links,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		...(imageType && { imageType })
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

/** Crée des fiches sans lien ni image (import d'une liste de noms), par lots. */
export async function createEntries(uid: string, dek: CryptoKey, names: string[]): Promise<EntrySummary[]> {
	const created: EntrySummary[] = [];
	for (let start = 0; start < names.length; start += IMPORT_BATCH_SIZE) {
		const batch = writeBatch(db);
		for (const name of names.slice(start, start + IMPORT_BATCH_SIZE)) {
			const id = doc(entriesRef(uid)).id;
			const now = Date.now();
			const data: EntryData = { name, links: [], createdAt: now, updatedAt: now };
			batch.set(entryRef(uid, id), { data: toStored(await encryptJson(dek, data, `${id}/data`)) } satisfies StoredEntry);
			created.push({ ...data, id });
		}
		await batch.commit();
	}
	return created;
}

export async function deleteEntry(uid: string, id: string): Promise<void> {
	const batch = writeBatch(db);
	batch.delete(entryRef(uid, id));
	batch.delete(imageRef(uid, id));
	await batch.commit();
}
