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
import { tagCatalog } from '$lib/entries/catalog';
import { OldKeyRequired, createBackup, restoreBackup } from './backup';
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
		await tagCatalog.save(uid, dek, [{ id: 'tag-1', name: 'Santé' }]);
		const kept = await saveEntry(uid, dek, { name: 'Mutuelle', links: [], tagIds: ['tag-1'] });
		const removed = await saveEntry(uid, dek, { name: 'Banque', links: [], tagIds: [] });

		const backup = parseBackup(await createBackup(true));
		expect(backup.entries).toHaveLength(2);

		// 1. Même compte : la fiche supprimée revient, rien d'autre ne change.
		await deleteEntry(uid, removed.id);
		expect(await restoreBackup(backup)).toEqual({ restored: 2, adopted: false });
		expect((await listEntries(uid, dek)).map((e) => e.name).sort()).toEqual(['Banque', 'Mutuelle']);

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
			adopted: true
		});
		({ uid, dek } = current());
		const restored = await listEntries(uid, dek);
		expect(restored.find((e) => e.id === kept.id)).toMatchObject({ name: 'Mutuelle', tagIds: ['tag-1'] });
		expect(await tagCatalog.get(uid, dek)).toEqual([{ id: 'tag-1', name: 'Santé' }]);

		// L'ancienne clé de récupération est de nouveau la bonne.
		const { recoveryDek } = await readCurrentKeyring();
		await expect(unwrapDek(recoveryDek, await deriveRecoveryKek(oldRecoveryKey))).resolves.toBeDefined();
	}, 60_000);

	it('compte recréé avec un autre email : la clé de récupération suffit ; un compte non vide est refusé', async () => {
		const oldRecoveryKey = await signUp(`c${Date.now()}@example.com`, PASSWORD);
		let { uid, dek } = current();
		await saveEntry(uid, dek, { name: 'Impôts', links: [], tagIds: [] });
		const backup = parseBackup(await createBackup(false));
		await signOut(auth);

		await signUp(`d${Date.now()}@example.com`, PASSWORD);
		({ uid, dek } = current());
		await saveEntry(uid, dek, { name: 'Déjà là', links: [], tagIds: [] });
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
