/**
 * Catalogues chiffrés (tags, collections) : un document `users/{uid}/meta/<nom>` = { data } (JSON),
 * AAD `meta/<nom>`. Les fiches ne portent que des identifiants, dans leur propre JSON chiffré.
 */
import { deleteDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { type Encrypted, decryptJson, encryptJson } from '$lib/crypto/crypto';
import { toBase64 } from '$lib/crypto/encoding';
import { db, fromStored, toStored, type StoredEncrypted } from '$lib/firebase';
import type { Collection, Tag } from './model';
import { StaleDataError, guardStale } from './stale';

function encryptedCatalog<T>(name: 'tags' | 'collections') {
	const context = `meta/${name}`;
	const ref = (uid: string) => doc(db, 'users', uid, 'meta', name);
	const read = (snapshot: { exists(): boolean; data(): unknown }): Encrypted | null =>
		snapshot.exists() ? fromStored((snapshot.data() as { data: StoredEncrypted }).data) : null;
	// L'IV, neuf à chaque écriture, sert de version : celui lu au chargement, puis celui de nos propres écritures.
	const ivOf = (stored: Encrypted | null) => (stored ? toBase64(stored.iv) : null);
	let expected: { uid: string; iv: string | null } | null = null;

	const catalog = {
		/** Catalogue tel que stocké (chiffré), pour la sauvegarde ; null s'il n'existe pas encore. */
		async readStored(uid: string): Promise<Encrypted | null> {
			return read(await getDoc(ref(uid)));
		},

		/** Comme `readStored`, en retenant sa version : c'est sur cette copie que porteront les écritures. */
		async load(uid: string): Promise<Encrypted | null> {
			const stored = await catalog.readStored(uid);
			expected = { uid, iv: ivOf(stored) };
			return stored;
		},

		decrypt: (dek: CryptoKey, encrypted: Encrypted): Promise<T[]> => decryptJson<T[]>(dek, encrypted, context),

		async get(uid: string, dek: CryptoKey): Promise<T[]> {
			const stored = await catalog.load(uid);
			return stored ? catalog.decrypt(dek, stored) : [];
		},

		/**
		 * Comme `get`, mais un catalogue illisible (altéré) donne [] et appelle `onUnreadable`, pour ne pas bloquer
		 * les fiches. Une erreur réseau reste levée : un catalogue vide par erreur serait écrasé au prochain ajout.
		 */
		async getOrEmpty(uid: string, dek: CryptoKey, onUnreadable: () => void): Promise<T[]> {
			const stored = await catalog.load(uid);
			if (!stored) return [];
			try {
				return await catalog.decrypt(dek, stored);
			} catch {
				onUnreadable();
				return [];
			}
		},

		/**
		 * Réécrit tout le catalogue (IV neuf) : quelques Ko au plus, plus simple qu'une mise à jour fine.
		 * Refusé si un autre appareil l'a réécrit depuis son chargement (voir stale.ts), sauf `checked` faux (restauration).
		 */
		async save(uid: string, dek: CryptoKey, items: T[], checked = true): Promise<void> {
			const encrypted = await encryptJson(dek, items, context);
			await guardStale(() =>
				runTransaction(db, async (writes) => {
					const current = ivOf(read(await writes.get(ref(uid))));
					if (checked && expected?.uid === uid && current !== expected.iv) throw new StaleDataError();
					writes.set(ref(uid), { data: toStored(encrypted) });
				})
			);
			expected = { uid, iv: ivOf(encrypted) };
		},

		async remove(uid: string): Promise<void> {
			await deleteDoc(ref(uid));
			expected = { uid, iv: null };
		}
	};
	return catalog;
}

export const tagCatalog = encryptedCatalog<Tag>('tags');
/** L'ordre du tableau est l'ordre d'affichage choisi par l'utilisateur. */
export const collectionCatalog = encryptedCatalog<Collection>('collections');
