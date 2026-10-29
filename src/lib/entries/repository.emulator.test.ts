/**
 * Test d'intégration contre les émulateurs (`npm run emulators` puis `npm run test:emulators`) :
 * chiffrement de bout en bout, type Bytes, lot fiche + image, et règles Firestore.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { Bytes, doc, getDoc } from 'firebase/firestore';
import { generateDek, randomBytes } from '$lib/crypto/crypto';
import { auth, db } from '$lib/firebase';
import { createEntries, deleteEntry, getImage, listEntries, saveEntry } from './repository';
import { collectionCatalog, tagCatalog } from './catalog';

let uid: string;
let dek: CryptoKey;
const image = { type: 'image/webp', image: randomBytes(50_000), thumb: randomBytes(3_000) };

beforeAll(async () => {
	const { user } = await createUserWithEmailAndPassword(auth, `t${Date.now()}@example.com`, 'jeton-de-test-1234');
	uid = user.uid;
	dek = await generateDek();
});

describe('fiches (émulateurs)', () => {
	it('crée, relit, modifie et supprime une fiche chiffrée', async () => {
		const created = await saveEntry(uid, dek, {
			collectionId: 'col-1',
			name: 'Banque',
			links: [{ url: 'https://example.com/', label: 'Site' }],
			tagIds: ['tag-1'],
			image
		});

		// Rien en clair dans Firestore : uniquement des Bytes.
		const raw = (await getDoc(doc(db, 'users', uid, 'entries', created.id))).data()!;
		expect(raw.data.iv).toBeInstanceOf(Bytes);
		expect(JSON.stringify(raw)).not.toContain('Banque');

		const [listed] = await listEntries(uid, dek);
		expect(listed).toMatchObject({ id: created.id, collectionId: 'col-1', name: 'Banque', imageType: 'image/webp', tagIds: ['tag-1'] });
		expect(listed.thumb).toEqual(image.thumb);
		expect(await getImage(uid, dek, created.id)).toEqual(image.image);

		// Modification sans toucher à l'image : IV neuf pour data, image conservée.
		const updated = await saveEntry(
			uid,
			dek,
			{ collectionId: 'col-1', name: 'Banque en ligne', links: [], tagIds: [] },
			listed
		);
		const rawAfter = (await getDoc(doc(db, 'users', uid, 'entries', created.id))).data()!;
		expect(rawAfter.data.iv.isEqual(raw.data.iv)).toBe(false);
		expect(updated.createdAt).toBe(created.createdAt);
		expect(updated.tagIds).toBeUndefined();
		expect(updated.thumb).toEqual(image.thumb);
		expect(await getImage(uid, dek, created.id)).toEqual(image.image);

		// Suppression de l'image seule.
		const noImage = await saveEntry(
			uid,
			dek,
			{ collectionId: 'col-1', name: 'Banque en ligne', links: [], tagIds: [], image: null },
			updated
		);
		expect(noImage.imageType).toBeUndefined();
		expect(await getImage(uid, dek, created.id)).toBeNull();

		await deleteEntry(uid, created.id);
		expect(await listEntries(uid, dek)).toEqual([]);
	});

	it('importe une liste de noms en plusieurs lots', async () => {
		const names = Array.from({ length: 450 }, (_, i) => `Fiche ${i}`);
		const created = await createEntries(uid, dek, 'col-1', names);
		expect(created).toHaveLength(450);
		const listed = await listEntries(uid, dek);
		expect(listed.map((e) => e.name).sort()).toEqual([...names].sort());
		expect(listed.every((e) => e.collectionId === 'col-1' && e.links.length === 0 && !e.imageType)).toBe(true);
		await Promise.all(created.map((e) => deleteEntry(uid, e.id)));
	}, 30_000);

	it('enregistre le catalogue de tags chiffré', async () => {
		expect(await tagCatalog.get(uid, dek)).toEqual([]);
		const tags = [{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }];
		await tagCatalog.save(uid, dek, tags);
		const raw = (await getDoc(doc(db, 'users', uid, 'meta', 'tags'))).data()!;
		expect(raw.data.data).toBeInstanceOf(Bytes);
		expect(JSON.stringify(raw)).not.toContain('Santé');
		expect(await tagCatalog.get(uid, dek)).toEqual(tags);
	});

	it('enregistre le catalogue de collections chiffré, dans l’ordre choisi', async () => {
		expect(await collectionCatalog.get(uid, dek)).toEqual([]);
		const collections = [
			{ id: 'col-2', name: 'Sportifs' },
			{ id: 'col-1', name: 'Manga' }
		];
		await collectionCatalog.save(uid, dek, collections);
		const raw = (await getDoc(doc(db, 'users', uid, 'meta', 'collections'))).data()!;
		expect(raw.data.data).toBeInstanceOf(Bytes);
		expect(JSON.stringify(raw)).not.toContain('Manga');
		expect(await collectionCatalog.get(uid, dek)).toEqual(collections);
		// AAD : le catalogue de tags ne se déchiffre pas comme un catalogue de collections.
		const tagsStored = await tagCatalog.readStored(uid);
		await expect(collectionCatalog.decrypt(dek, tagsStored!)).rejects.toThrow();
	});

	it('refuse un chiffré déplacé dans une autre fiche (AAD)', async () => {
		const a = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'A', links: [], tagIds: [], image });
		const b = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'B', links: [], tagIds: [], image });
		const rawA = (await getDoc(doc(db, 'users', uid, 'images', a.id))).data()!;
		const { setDoc } = await import('firebase/firestore');
		await setDoc(doc(db, 'users', uid, 'images', b.id), rawA);
		await expect(getImage(uid, dek, b.id)).rejects.toThrow();
		await deleteEntry(uid, a.id);
		await deleteEntry(uid, b.id);
	});

	it('règles : un autre utilisateur ne peut rien lire', async () => {
		const mine = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Privée', links: [], tagIds: [] });
		await signOut(auth);
		await createUserWithEmailAndPassword(auth, `x${Date.now()}@example.com`, 'jeton-de-test-5678');
		await expect(getDoc(doc(db, 'users', uid, 'entries', mine.id))).rejects.toMatchObject({
			code: 'permission-denied'
		});
		await signOut(auth);
		await expect(getDoc(doc(db, 'users', uid))).rejects.toMatchObject({ code: 'permission-denied' });
	});
});
