/** Album : fiches face cachée, découvertes une à une par le dé, gardées après verrouillage, remises à zéro. */
import { addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import { createEntry, lockAndUnlock } from './helpers';

async function openAlbum(page: import('@playwright/test').Page) {
	await goHome(page);
	await page.getByRole('heading', { name: 'Manga' }).click();
	await page.getByRole('link', { name: 'Album de la collection' }).click();
}

test('album : tirages sans remise, fiche agrandie en lecture seule, complet, gardé, recommencé', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Akira', 'Berserk', 'Claymore']) await createEntry(page, name);

	await openAlbum(page);
	const progress = page.getByRole('status').filter({ hasText: '/ 3' });
	await expect(progress).toHaveText('0 / 3');
	await expect(page.getByRole('img', { name: /face cachée/ })).toHaveCount(3);

	// Un tirage : la carte se révèle agrandie, sans rien pour l'ouvrir, la modifier ou la comparer.
	const dice = page.getByRole('button', { name: 'Tirer une carte' });
	await dice.click();
	const zoom = page.getByRole('dialog');
	await expect(zoom).toBeVisible();
	await expect(progress).toHaveText('1 / 3');
	await expect(zoom.getByRole('link', { name: 'Ouvrir la fiche' })).toHaveCount(0);
	await expect(zoom.getByRole('link', { name: 'Modifier la fiche' })).toHaveCount(0);
	await expect(zoom.getByRole('button', { name: 'Similaires' })).toHaveCount(0);
	// Une autre depuis la fiche agrandie, puis fermée : les deux sont retournées dans l'album.
	await zoom.getByRole('button', { name: 'Tirer une autre carte' }).click();
	await expect(progress).toHaveText('2 / 3');
	await page.keyboard.press('Escape');
	await expect(zoom).toBeHidden();
	await expect(page.getByRole('button', { name: /^Voir / })).toHaveCount(2);
	await expect(page.getByRole('img', { name: /face cachée/ })).toHaveCount(1);

	// La dernière : jamais une déjà découverte, l'album est complet et le dé disparaît.
	await dice.click();
	await expect(progress).toHaveText('3 / 3');
	await page.keyboard.press('Escape');
	await expect(page.getByText('Album complet')).toBeVisible();
	await expect(dice).toHaveCount(0);

	// Une carte découverte se regarde, sans nouveau tirage.
	await page.getByRole('button', { name: 'Voir Berserk' }).click();
	await expect(zoom.getByRole('heading', { name: 'Berserk' })).toBeVisible();
	await expect(zoom.getByRole('button', { name: 'Tirer une autre carte' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// Gardé dans le catalogue chiffré : toujours là après verrouillage.
	await lockAndUnlock(page);
	await openAlbum(page);
	await expect(progress).toHaveText('3 / 3');

	// Recommencer : tout repart face cachée.
	await page.getByRole('button', { name: "Recommencer l'album" }).click();
	await page.getByRole('button', { name: 'Recommencer', exact: true }).click();
	await expect(progress).toHaveText('0 / 3');
	await expect(page.getByRole('img', { name: /face cachée/ })).toHaveCount(3);

	// Dos des cartes : bordeaux nuit par défaut, au choix dans Paramètres.
	await expect(page.getByRole('img', { name: /face cachée/ }).first()).toHaveAttribute('data-back', 'night');
	await goSettings(page);
	await page.getByRole('radiogroup', { name: "Dos des cartes de l'album" }).getByText('Papier ivoire').click();
	await expect(page.getByRole('radio', { name: 'Papier ivoire' })).toBeChecked();
	await openAlbum(page);
	await expect(page.getByRole('img', { name: /face cachée/ }).first()).toHaveAttribute('data-back', 'ivory');
});
