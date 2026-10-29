/**
 * Catalogue des tags : un seul document chiffré `users/{uid}/meta/tags` = { data } (JSON `Tag[]`).
 * Les fiches ne portent que des identifiants, dans leur propre JSON chiffré.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { type Encrypted, decryptJson, encryptJson } from '$lib/crypto/crypto';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import type { Tag } from './model';

const TAGS_CONTEXT = 'meta/tags';
const tagsRef = (uid: string) => doc(db, 'users', uid, 'meta', 'tags');

/** Catalogue tel que stocké (chiffré), pour la sauvegarde ; null s'il n'existe pas encore. */
export async function readStoredTags(uid: string): Promise<Encrypted | null> {
	const snapshot = await getDoc(tagsRef(uid));
	return snapshot.exists() ? fromStored((snapshot.data() as { data: StoredEncrypted }).data) : null;
}

export const decryptTags = (dek: CryptoKey, encrypted: Encrypted): Promise<Tag[]> =>
	decryptJson<Tag[]>(dek, encrypted, TAGS_CONTEXT);

export async function getTags(uid: string, dek: CryptoKey): Promise<Tag[]> {
	const stored = await readStoredTags(uid);
	return stored ? decryptTags(dek, stored) : [];
}

/** Réécrit tout le catalogue (IV neuf) : quelques Ko au plus, plus simple qu'une mise à jour fine. */
export async function saveTags(uid: string, dek: CryptoKey, tags: Tag[]): Promise<void> {
	await setDoc(tagsRef(uid), { data: toStored(await encryptJson(dek, tags, TAGS_CONTEXT)) });
}
