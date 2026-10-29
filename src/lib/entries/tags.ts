/**
 * Catalogue des tags : un seul document chiffré `users/{uid}/meta/tags` = { data } (JSON `Tag[]`).
 * Les fiches ne portent que des identifiants, dans leur propre JSON chiffré.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { decryptJson, encryptJson } from '$lib/crypto/crypto';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import type { Tag } from './model';

const TAGS_CONTEXT = 'meta/tags';
const tagsRef = (uid: string) => doc(db, 'users', uid, 'meta', 'tags');

export async function getTags(uid: string, dek: CryptoKey): Promise<Tag[]> {
	const snapshot = await getDoc(tagsRef(uid));
	if (!snapshot.exists()) return [];
	const { data } = snapshot.data() as { data: StoredEncrypted };
	return decryptJson<Tag[]>(dek, fromStored(data), TAGS_CONTEXT);
}

/** Réécrit tout le catalogue (IV neuf) : quelques Ko au plus, plus simple qu'une mise à jour fine. */
export async function saveTags(uid: string, dek: CryptoKey, tags: Tag[]): Promise<void> {
	await setDoc(tagsRef(uid), { data: toStored(await encryptJson(dek, tags, TAGS_CONTEXT)) });
}
