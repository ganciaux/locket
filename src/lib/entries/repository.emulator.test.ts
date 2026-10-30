/**
 * Test d'intégration contre les émulateurs (`npm run emulators` puis `npm run test:emulators`) :
 * chiffrement de bout en bout, type Bytes, lot fiche + image, et règles Firestore.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { Bytes, collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
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
	}, 60_000);

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
		await setDoc(doc(db, 'users', uid, 'images', b.id), rawA);
		await expect(getImage(uid, dek, b.id)).rejects.toThrow();
		await deleteEntry(uid, a.id);
		await deleteEntry(uid, b.id);
	});

	it('garde les exceptions d’une fiche : termes, sites masqués, lien masqué, fiche cachée', async () => {
		const input = {
			collectionId: 'col-1',
			name: 'Cachée',
			links: [{ url: 'https://example.com/', hidden: true }],
			tagIds: [],
			siteTerms: { s1: 'Johnny' },
			hiddenSites: ['s2'],
			hidden: true
		};
		const { id } = await saveEntry(uid, dek, input);
		const [listed] = await listEntries(uid, dek);
		expect(listed).toMatchObject({ siteTerms: input.siteTerms, hiddenSites: input.hiddenSites, hidden: true, links: input.links });
		await saveEntry(uid, dek, { ...input, siteTerms: {}, hiddenSites: [], hidden: false }, listed);
		const [cleared] = await listEntries(uid, dek);
		expect(cleared.siteTerms).toBeUndefined();
		expect(cleared.hiddenSites).toBeUndefined();
		expect(cleared.hidden).toBeUndefined();
		await deleteEntry(uid, id);
	}, 60_000);

	it('une fiche illisible n’empêche pas de lire les autres', async () => {
		const good = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Saine', links: [], tagIds: [] });
		const bad = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Abîmée', links: [], tagIds: [] });
		// Le chiffré d'une autre fiche : l'AAD le refuse.
		await setDoc(doc(db, 'users', uid, 'entries', bad.id), (await getDoc(doc(db, 'users', uid, 'entries', good.id))).data()!);

		const unreadable: string[] = [];
		expect((await listEntries(uid, dek, (id) => unreadable.push(id))).map((e) => e.name)).toEqual(['Saine']);
		expect(unreadable).toEqual([bad.id]);
		await expect(listEntries(uid, dek)).rejects.toThrow();
		await deleteEntry(uid, good.id);
		await deleteEntry(uid, bad.id);
	}, 60_000);

	it('règles : hors de son espace, ni lecture, ni liste, ni écriture, ni suppression', async () => {
		const mine = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Privée', links: [], tagIds: [] });
		const denied = { code: 'permission-denied' };
		const paths = [
			`users/${uid}`,
			`users/${uid}/entries/${mine.id}`,
			`users/${uid}/images/${mine.id}`,
			`users/${uid}/meta/tags`,
			`users/${uid}/meta/collections`,
			'autre/document'
		];
		async function expectRefused() {
			for (const path of paths) {
				const ref = doc(db, path);
				await expect(getDoc(ref), path).rejects.toMatchObject(denied);
				await expect(setDoc(ref, { intrus: true }), path).rejects.toMatchObject(denied);
				await expect(deleteDoc(ref), path).rejects.toMatchObject(denied);
			}
			for (const name of ['entries', 'images', 'meta'])
				await expect(getDocs(collection(db, 'users', uid, name)), name).rejects.toMatchObject(denied);
			await expect(getDocs(collection(db, 'users')), 'liste des comptes').rejects.toMatchObject(denied);
		}

		await signOut(auth);
		await createUserWithEmailAndPassword(auth, `x${Date.now()}@example.com`, 'jeton-de-test-5678');
		await expectRefused(); // autre compte
		await signOut(auth);
		await expectRefused(); // sans compte
	}, 60_000);
});
