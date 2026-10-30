/**
 * Sauvegarde / restauration de bout en bout contre les émulateurs, y compris dans un compte supprimé puis recréé.
 */
import { describe, expect, it } from 'vitest';
import { deleteUser, signOut } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { checkRecoveryKey, readCurrentKeyring, rotateRecoveryKey, signUp } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { deriveRecoveryKek, unwrapDek } from '$lib/crypto/crypto';
import { auth, db } from '$lib/firebase';
import { deleteEntry, listEntries, saveEntry } from '$lib/entries/repository';
import { collectionCatalog, tagCatalog } from '$lib/entries/catalog';
import { deleteAllData } from '$lib/entries/store.svelte';
import { OldKeyRequired, checkBackup, createBackup, restoreBackup } from './backup';
import { parseBackup } from './format';

const PASSWORD = 'mot-de-passe-de-test';

function current() {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('session verrouillée');
	return { uid: user.uid, dek };
}

describe('sauvegarde (émulateurs)', () => {
	it('restaure sur le même compte, puis dans un compte supprimé et recréé', async () => {
		const email = `b${Date.now()}@example.com`;
		const oldRecoveryKey = await signUp(email, PASSWORD);
		let { uid, dek } = current();
		await collectionCatalog.save(uid, dek, [{ id: 'col-1', name: 'Papiers' }]);
		await tagCatalog.save(uid, dek, [{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);
		const kept = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: ['tag-1'] });
		const removed = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Banque', links: [], tagIds: [] });

		const backup = parseBackup((await createBackup(true)).text);
		expect(backup.entries).toHaveLength(2);

		// 1. Même compte : le compte redevient exactement le fichier.
		await deleteEntry(uid, removed.id);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Ajoutée après', links: [], tagIds: [] });
		await tagCatalog.save(uid, dek, [{ id: 'tag-2', name: 'Ajouté après', collectionId: 'col-1' }]);
		expect(await restoreBackup(backup, PASSWORD)).toEqual({ restored: 2, removed: 1, adopted: false });
		expect((await listEntries(uid, dek)).map((e) => e.name).sort()).toEqual(['Banque', 'Mutuelle']);
		expect(await tagCatalog.get(uid, dek)).toEqual([{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);

		// 2. Compte supprimé puis recréé (même email) : nouvelle DEK, la sauvegarde ne s'ouvre plus directement.
		await deleteUser(auth.currentUser!);
		await signUp(email, PASSWORD);
		({ uid, dek } = current());
		await expect(restoreBackup(backup, PASSWORD)).rejects.toBeInstanceOf(OldKeyRequired);
		await expect(restoreBackup(backup, 'faux-mot-de-passe', PASSWORD)).rejects.toThrow(
			/incorrect/
		);

		expect(await restoreBackup(backup, PASSWORD, PASSWORD)).toEqual({
			restored: 2,
			removed: 0,
			adopted: true
		});
		({ uid, dek } = current());
		const restored = await listEntries(uid, dek);
		expect(restored.find((e) => e.id === kept.id)).toMatchObject({ name: 'Mutuelle', tagIds: ['tag-1'] });
		expect(await collectionCatalog.get(uid, dek)).toEqual([{ id: 'col-1', name: 'Papiers' }]);
		expect(await tagCatalog.get(uid, dek)).toEqual([{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);

		// L'ancienne clé de récupération est de nouveau la bonne.
		const { recoveryDek } = await readCurrentKeyring();
		await expect(unwrapDek(recoveryDek, await deriveRecoveryKek(oldRecoveryKey))).resolves.toBeDefined();
	}, 60_000);

	it('refuse un fichier altéré sans rien écrire, même si la première fiche est intacte', async () => {
		await signUp(`e${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Banque', links: [], tagIds: [] });

		const backup = parseBackup((await createBackup(true)).text);
		backup.entries[1].data.iv[0] ^= 1;

		await expect(restoreBackup(backup, PASSWORD)).rejects.toThrow(/endommagée/);
		expect((await listEntries(uid, dek)).map((e) => e.name).sort()).toEqual(['Banque', 'Mutuelle']);
	}, 60_000);

	it('contrôle le fichier entier grâce au manifeste', async () => {
		await signUp(`f${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await collectionCatalog.save(uid, dek, [{ id: 'col-1', name: 'Papiers' }]);
		await tagCatalog.save(uid, dek, [{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Banque', links: [], tagIds: [] });
		const { text } = await createBackup(true);

		expect(await checkBackup(parseBackup(text))).toEqual({ entries: 2, collections: 1, tags: 1, skipped: 0 });

		const missingEntry = parseBackup(text);
		missingEntry.entries.pop();
		await expect(checkBackup(missingEntry)).rejects.toThrow(/incomplète : 1 fiche, .* au lieu de 2 fiches/);

		const keyring = parseBackup(text);
		keyring.keyring.recoveryDek.iv[0] ^= 1;
		await expect(checkBackup(keyring)).rejects.toThrow(/modifiée/);

		const date = parseBackup(text);
		date.createdAt = '2020-01-01T00:00:00.000Z';
		await expect(restoreBackup(date, PASSWORD)).rejects.toThrow(/modifiée/);

		const manifest = parseBackup(text);
		manifest.manifest.iv[0] ^= 1;
		await expect(checkBackup(manifest)).rejects.toThrow(/endommagée/);
	}, 60_000);

	it('détecte un recoveryDek remplacé, et une nouvelle clé répare le compte', async () => {
		const oldKey = await signUp(`r${Date.now()}@example.com`, PASSWORD);
		const { uid } = current();
		const ref = doc(db, 'users', uid);
		await checkRecoveryKey();
		expect(session.recoveryDamaged).toBe(false);

		const original = (await getDoc(ref)).data()!;
		await updateDoc(ref, { recoveryDek: original.wrappedDek });
		await checkRecoveryKey();
		expect(session.recoveryDamaged).toBe(true);

		await expect(rotateRecoveryKey('faux-mot-de-passe')).rejects.toThrow(/incorrect/);
		const newKey = await rotateRecoveryKey(PASSWORD);
		expect(session.recoveryDamaged).toBe(false);
		await checkRecoveryKey();
		expect(session.recoveryDamaged).toBe(false);

		const { recoveryDek } = await readCurrentKeyring();
		await expect(unwrapDek(recoveryDek, await deriveRecoveryKek(newKey))).resolves.toBeDefined();
		await expect(unwrapDek(recoveryDek, await deriveRecoveryKek(oldKey))).rejects.toThrow();
	}, 60_000);

	it('pose le sceau sur un compte plus ancien qui n’en a pas', async () => {
		await signUp(`s${Date.now()}@example.com`, PASSWORD);
		const { uid } = current();
		const ref = doc(db, 'users', uid);
		await updateDoc(ref, { keyringCheck: deleteField() });
		await checkRecoveryKey();
		expect((await getDoc(ref)).data()!.keyringCheck).toBeDefined();
		expect(session.recoveryDamaged).toBe(false);
	}, 60_000);

	it('un fichier modifié par déplacement d’octets dans le trousseau est refusé', async () => {
		await signUp(`m${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		const backup = parseBackup((await createBackup(true)).text);
		const { recoveryDek } = backup.keyring;
		backup.keyring.recoveryDek = {
			iv: recoveryDek.iv.slice(1),
			data: new Uint8Array([recoveryDek.iv[0], ...recoveryDek.data])
		};
		await expect(checkBackup(backup)).rejects.toThrow(/modifiée/);
	}, 60_000);

	it('écarte de l’export un catalogue illisible, et refuse de restaurer sans le bon mot de passe', async () => {
		await signUp(`c2${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await collectionCatalog.save(uid, dek, [{ id: 'col-1', name: 'Papiers' }]);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		const good = parseBackup((await createBackup(true)).text);
		await expect(restoreBackup(good, 'faux-mot-de-passe')).rejects.toThrow(/incorrect/);

		const collections = doc(db, 'users', uid, 'meta', 'collections');
		await setDoc(doc(db, 'users', uid, 'meta', 'tags'), (await getDoc(collections)).data()!);
		const { text, skipped } = await createBackup(true);
		expect(skipped).toBe(1);
		expect(await checkBackup(parseBackup(text))).toMatchObject({ entries: 1, tags: 0, skipped: 1 });
	}, 60_000);

	it('écarte de l’export une fiche illisible : le fichier reste restaurable', async () => {
		await signUp(`h${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		const good = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Saine', links: [], tagIds: [] });
		const bad = await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Abîmée', links: [], tagIds: [] });
		await setDoc(doc(db, 'users', uid, 'entries', bad.id), (await getDoc(doc(db, 'users', uid, 'entries', good.id))).data()!);

		const { text, skipped } = await createBackup(true);
		expect(skipped).toBe(1);
		expect(await checkBackup(parseBackup(text))).toMatchObject({ entries: 1, skipped: 1 });
	}, 60_000);

	it('supprime toutes les données après vérification du mot de passe, puis restaure', async () => {
		await signUp(`g${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await collectionCatalog.save(uid, dek, [{ id: 'col-1', name: 'Papiers' }]);
		await tagCatalog.save(uid, dek, [{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		const backup = parseBackup((await createBackup(true)).text);

		await expect(deleteAllData('faux-mot-de-passe')).rejects.toThrow(/incorrect/);
		expect(await listEntries(uid, dek)).toHaveLength(1);

		expect(await deleteAllData(PASSWORD)).toBe(1);
		expect(await listEntries(uid, dek)).toEqual([]);
		expect(await collectionCatalog.readStored(uid)).toBeNull();
		expect(await tagCatalog.readStored(uid)).toBeNull();

		// Le compte et sa DEK restent : la sauvegarde se restaure directement.
		expect(await restoreBackup(backup, PASSWORD)).toMatchObject({ restored: 1, adopted: false });
		expect((await listEntries(uid, dek)).map((e) => e.name)).toEqual(['Mutuelle']);
	}, 60_000);

	it('compte recréé avec un autre email : la clé de récupération suffit ; un compte non vide est refusé', async () => {
		const oldRecoveryKey = await signUp(`c${Date.now()}@example.com`, PASSWORD);
		let { uid, dek } = current();
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Impôts', links: [], tagIds: [] });
		const backup = parseBackup((await createBackup(false)).text);
		await signOut(auth);

		await signUp(`d${Date.now()}@example.com`, PASSWORD);
		({ uid, dek } = current());
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Déjà là', links: [], tagIds: [] });
		await expect(restoreBackup(backup, PASSWORD, oldRecoveryKey)).rejects.toThrow(
			/compte vide/
		);

		const [existing] = await listEntries(uid, dek);
		await deleteEntry(uid, existing.id);
		expect(await restoreBackup(backup, PASSWORD, oldRecoveryKey)).toMatchObject({
			adopted: true
		});
		({ uid, dek } = current());
		expect((await listEntries(uid, dek)).map((e) => e.name)).toEqual(['Impôts']);
	}, 60_000);
});
