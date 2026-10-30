/**
 * Catalogues chiffrés (tags, collections) : un document `users/{uid}/meta/<nom>` = { data } (JSON),
 * AAD `meta/<nom>`. Les fiches ne portent que des identifiants, dans leur propre JSON chiffré.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { type Encrypted, decryptJson, encryptJson } from '$lib/crypto/crypto';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import type { Collection, Tag } from './model';

function encryptedCatalog<T>(name: 'tags' | 'collections') {
	const context = `meta/${name}`;
	const ref = (uid: string) => doc(db, 'users', uid, 'meta', name);

	const catalog = {
		/** Catalogue tel que stocké (chiffré), pour la sauvegarde ; null s'il n'existe pas encore. */
		async readStored(uid: string): Promise<Encrypted | null> {
			const snapshot = await getDoc(ref(uid));
			return snapshot.exists() ? fromStored((snapshot.data() as { data: StoredEncrypted }).data) : null;
		},

		decrypt: (dek: CryptoKey, encrypted: Encrypted): Promise<T[]> => decryptJson<T[]>(dek, encrypted, context),

		async get(uid: string, dek: CryptoKey): Promise<T[]> {
			const stored = await catalog.readStored(uid);
			return stored ? catalog.decrypt(dek, stored) : [];
		},

		/** Réécrit tout le catalogue (IV neuf) : quelques Ko au plus, plus simple qu'une mise à jour fine. */
		async save(uid: string, dek: CryptoKey, items: T[]): Promise<void> {
			await setDoc(ref(uid), { data: toStored(await encryptJson(dek, items, context)) });
		},

		remove: (uid: string): Promise<void> => deleteDoc(ref(uid))
	};
	return catalog;
}

export const tagCatalog = encryptedCatalog<Tag>('tags');
/** L'ordre du tableau est l'ordre d'affichage choisi par l'utilisateur. */
export const collectionCatalog = encryptedCatalog<Collection>('collections');
