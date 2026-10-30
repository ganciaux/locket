/**
 * Sauvegarde / restauration de bout en bout contre les émulateurs, y compris dans un compte supprimé puis recréé.
 */
import { describe, expect, it } from 'vitest';
import { deleteUser, signOut } from 'firebase/auth';
import { readCurrentKeyring, signUp } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { deriveRecoveryKek, unwrapDek } from '$lib/crypto/crypto';
import { auth } from '$lib/firebase';
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

		const backup = parseBackup(await createBackup(true));
		expect(backup.entries).toHaveLength(2);

		// 1. Même compte : le compte redevient exactement le fichier.
		await deleteEntry(uid, removed.id);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Ajoutée après', links: [], tagIds: [] });
		await tagCatalog.save(uid, dek, [{ id: 'tag-2', name: 'Ajouté après', collectionId: 'col-1' }]);
		expect(await restoreBackup(backup)).toEqual({ restored: 2, removed: 1, adopted: false });
		expect((await listEntries(uid, dek)).map((e) => e.name).sort()).toEqual(['Banque', 'Mutuelle']);
		expect(await tagCatalog.get(uid, dek)).toEqual([{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);

		// 2. Compte supprimé puis recréé (même email) : nouvelle DEK, la sauvegarde ne s'ouvre plus directement.
		await deleteUser(auth.currentUser!);
		await signUp(email, PASSWORD);
		({ uid, dek } = current());
		await expect(restoreBackup(backup)).rejects.toBeInstanceOf(OldKeyRequired);
		await expect(restoreBackup(backup, { currentPassword: 'faux-mot-de-passe', oldSecret: PASSWORD })).rejects.toThrow(
			/incorrect/
		);

		expect(await restoreBackup(backup, { currentPassword: PASSWORD, oldSecret: PASSWORD })).toEqual({
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

		const backup = parseBackup(await createBackup(true));
		backup.entries[1].data.iv[0] ^= 1;

		await expect(restoreBackup(backup)).rejects.toThrow(/endommagée/);
		expect((await listEntries(uid, dek)).map((e) => e.name).sort()).toEqual(['Banque', 'Mutuelle']);
	}, 60_000);

	it('contrôle le fichier entier grâce au manifeste', async () => {
		await signUp(`f${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await collectionCatalog.save(uid, dek, [{ id: 'col-1', name: 'Papiers' }]);
		await tagCatalog.save(uid, dek, [{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Banque', links: [], tagIds: [] });
		const text = await createBackup(true);

		expect(await checkBackup(parseBackup(text))).toEqual({ entries: 2, collections: 1, tags: 1 });

		const missingEntry = parseBackup(text);
		missingEntry.entries.pop();
		await expect(checkBackup(missingEntry)).rejects.toThrow(/incomplète : 1 fiche, .* au lieu de 2 fiches/);

		const keyring = parseBackup(text);
		keyring.keyring.recoveryDek.iv[0] ^= 1;
		await expect(checkBackup(keyring)).rejects.toThrow(/modifiée/);

		const date = parseBackup(text);
		date.createdAt = '2020-01-01T00:00:00.000Z';
		await expect(restoreBackup(date)).rejects.toThrow(/modifiée/);

		const manifest = parseBackup(text);
		manifest.manifest.iv[0] ^= 1;
		await expect(checkBackup(manifest)).rejects.toThrow(/endommagée/);
	}, 60_000);

	it('supprime toutes les données après vérification du mot de passe, puis restaure', async () => {
		await signUp(`g${Date.now()}@example.com`, PASSWORD);
		const { uid, dek } = current();
		await collectionCatalog.save(uid, dek, [{ id: 'col-1', name: 'Papiers' }]);
		await tagCatalog.save(uid, dek, [{ id: 'tag-1', name: 'Santé', collectionId: 'col-1' }]);
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Mutuelle', links: [], tagIds: [] });
		const backup = parseBackup(await createBackup(true));

		await expect(deleteAllData('faux-mot-de-passe')).rejects.toThrow(/incorrect/);
		expect(await listEntries(uid, dek)).toHaveLength(1);

		expect(await deleteAllData(PASSWORD)).toBe(1);
		expect(await listEntries(uid, dek)).toEqual([]);
		expect(await collectionCatalog.readStored(uid)).toBeNull();
		expect(await tagCatalog.readStored(uid)).toBeNull();

		// Le compte et sa DEK restent : la sauvegarde se restaure directement.
		expect(await restoreBackup(backup)).toMatchObject({ restored: 1, adopted: false });
		expect((await listEntries(uid, dek)).map((e) => e.name)).toEqual(['Mutuelle']);
	}, 60_000);

	it('compte recréé avec un autre email : la clé de récupération suffit ; un compte non vide est refusé', async () => {
		const oldRecoveryKey = await signUp(`c${Date.now()}@example.com`, PASSWORD);
		let { uid, dek } = current();
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Impôts', links: [], tagIds: [] });
		const backup = parseBackup(await createBackup(false));
		await signOut(auth);

		await signUp(`d${Date.now()}@example.com`, PASSWORD);
		({ uid, dek } = current());
		await saveEntry(uid, dek, { collectionId: 'col-1', name: 'Déjà là', links: [], tagIds: [] });
		await expect(restoreBackup(backup, { currentPassword: PASSWORD, oldSecret: oldRecoveryKey })).rejects.toThrow(
			/compte vide/
		);

		const [existing] = await listEntries(uid, dek);
		await deleteEntry(uid, existing.id);
		expect(await restoreBackup(backup, { currentPassword: PASSWORD, oldSecret: oldRecoveryKey })).toMatchObject({
			adopted: true
		});
		({ uid, dek } = current());
		expect((await listEntries(uid, dek)).map((e) => e.name)).toEqual(['Impôts']);
	}, 60_000);
});
