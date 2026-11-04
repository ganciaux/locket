/** Cache local des chiffrés (IndexedDB) et miniatures. */
import { PASSWORD, addFirstCollection, expect, goSettings, signUp, test } from './fixtures';
import { createEntry, createEntryWithImage, editCache, lockAndUnlock } from './helpers';

test('cache local : suit ses écritures et celles d’un autre appareil, résiste à une copie abîmée', async ({ page, browser }) => {
	const { email } = await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Alpha');
	await createEntry(page, 'Bravo');
	const names = page.getByRole('heading', { level: 2 });
	await lockAndUnlock(page);
	await expect(names).toHaveCount(2);
	await expect.poll(() => editCache(page, 'count')).toBe(2);

	// Une écriture de cet appareil met la copie à jour, sans rechargement complet.
	await createEntry(page, 'Charlie');
	expect(await editCache(page, 'count')).toBe(3);

	// La copie sert bien : une fiche retirée de la copie disparaît, Firestore n'a pas été relu.
	await editCache(page, 'drop');
	await lockAndUnlock(page);
	await expect(names).toHaveCount(2);

	// Copie trop ancienne : relue depuis Firestore.
	await editCache(page, 'expire');
	await lockAndUnlock(page);
	await expect(names).toHaveCount(3);

	// Copie abîmée : relue depuis Firestore, jamais déclarée illisible.
	await editCache(page, 'drop');
	await editCache(page, 'damage');
	await lockAndUnlock(page);
	await expect(names).toHaveCount(3);
	await expect(page.getByText(/illisible/)).toHaveCount(0);

	// Autre appareil : son écriture change le jeton, la copie d'ici est rechargée.
	const other = await (await browser.newContext()).newPage();
	await other.goto('/');
	await other.getByLabel('Email').fill(email);
	await other.getByLabel('Mot de passe').fill(PASSWORD);
	await other.getByRole('button', { name: 'Se connecter' }).click();
	await expect(other.getByRole('heading', { name: 'Alpha' })).toBeVisible();
	await createEntry(other, 'Delta');
	await other.context().close();
	await lockAndUnlock(page);
	await expect(names).toHaveCount(4);
	await expect.poll(() => editCache(page, 'count')).toBe(4);

	// Déconnexion : plus rien sur l'appareil.
	await goSettings(page);
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
	expect(await editCache(page, 'count')).toBe(0);
});

test('miniatures : seules celles sous la taille maximale sont refaites, et restent après déverrouillage', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntryWithImage(page, 'Petite', 400);
	await createEntryWithImage(page, 'Grande');
	await createEntry(page, 'Sans image');
	await goSettings(page);
	await page.getByRole('button', { name: 'Régénérer les miniatures' }).click();
	await expect(page.getByText('1 miniature refaite.')).toBeVisible();

	await lockAndUnlock(page);
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
	await expect(page.locator('figure img')).toHaveCount(2);
	await expect.poll(() => page.locator('figure img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});
