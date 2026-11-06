/** Classement par duels. */
import { addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import { createEntry, createEntryWithImage, openEntry, runDuels } from './helpers';
import type { Page } from '@playwright/test';

test('classement : retour depuis une fiche, relancer, abandonner, terminer, supprimer', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Alpha', 'Bravo', 'Charlie']) await createEntryWithImage(page, name);

	const inOrder = (names: string[]) => names[0];
	const reversed = (names: string[]) => names[names.length - 1];
	await goHome(page);
	await page.getByLabel('Trier par').selectOption('rank');
	await page.getByRole('link', { name: 'Classer (3)' }).click();
	await runDuels(page, page.getByText('Toutes les fiches avec image sont classées.'), inOrder);
	await page.getByRole('link', { name: 'Voir le classement' }).click();
	const rows = page.locator('ol li');
	await expect(rows.first()).toContainText('Alpha');

	// La fiche ouverte depuis le classement y revient, et ses voisines suivent l'ordre du classement.
	await rows.nth(1).getByRole('link', { name: 'Bravo', exact: true }).click();
	await expect(page.getByText('2 / 3')).toBeVisible();
	await page.getByRole('button', { name: 'Fiche suivante' }).click();
	await expect(page.getByRole('heading', { name: 'Charlie' })).toBeVisible();
	await page.getByRole('link', { name: 'Classement', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Classement' })).toBeVisible();

	// Relancer : l'ancien classement reste en place tant que le nouveau n'est pas fini.
	await page.getByRole('button', { name: 'Relancer le classement' }).click();
	await expect(page.getByRole('heading', { name: 'Nouveau classement' })).toBeVisible();
	await page.getByRole('link', { name: 'Retour' }).click();
	await expect(page.getByText(/Nouveau classement en cours/)).toBeVisible();
	await expect(rows.first()).toContainText('Alpha');

	await page.getByRole('button', { name: 'Abandonner' }).click();
	await page.getByRole('button', { name: 'Abandonner' }).click();
	await expect(page.getByText(/Nouveau classement en cours/)).toHaveCount(0);
	await expect(rows).toHaveCount(3);

	await page.getByRole('button', { name: 'Relancer le classement' }).click();
	await runDuels(page, page.getByText('Nouveau classement terminé : il remplace le précédent.'), reversed);
	await page.getByRole('link', { name: 'Voir le classement' }).click();
	await expect(rows.first()).toContainText('Charlie');
	await expect(rows.nth(2)).toContainText('Alpha');

	await page.getByRole('button', { name: 'Supprimer le classement' }).click();
	await expect(rows).toHaveCount(3);
	await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
	await expect(rows).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Lancer le classement (3)' })).toBeVisible();
});

test('classement par duels : rangs sur les cartes, décalés par la corbeille, reclassement', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Charlie', 'Alpha', 'Bravo']) await createEntryWithImage(page, name);
	// Sans image : jamais classée.
	await createEntry(page, 'Delta');

	// Préférence : l'ordre alphabétique, quels que soient la fiche tirée et le côté.
	const duel = (done: ReturnType<Page['getByText']>) => runDuels(page, done, (names) => names[0]);

	await goHome(page);
	await page.getByLabel('Trier par').selectOption('rank');
	await page.getByRole('link', { name: 'Classer (3)' }).click();
	const allRanked = page.getByText('Toutes les fiches avec image sont classées.');
	await duel(allRanked);

	// Gestion : les fiches dans l'ordre, retrait, puis classement relancé depuis les paramètres.
	await page.getByRole('link', { name: 'Voir le classement' }).click();
	const rows = page.locator('ol li');
	await expect(rows).toHaveCount(3);
	await expect(rows.first()).toContainText('Alpha');
	await expect(rows.nth(2)).toContainText('Charlie');
	await page.getByRole('button', { name: 'Retirer Charlie du classement' }).click();
	await page.getByRole('button', { name: 'Annuler' }).click();
	await expect(rows).toHaveCount(3);
	await page.getByRole('button', { name: 'Retirer Charlie du classement' }).click();
	await page.getByRole('button', { name: 'Retirer', exact: true }).click();
	await expect(rows).toHaveCount(2);
	await expect(page.getByText('2 classées, 1 à classer · 1 sans image, non classable')).toBeVisible();

	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer le classement' }).click();
	await page.getByRole('link', { name: 'Lancer le classement (1)' }).click();
	// Image complète et non miniature (640 px au plus).
	await expect.poll(() => page.locator('figure img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
	// Quitter en cours de duels : le classement reste, la fiche en cours attend, et on reprend plus tard.
	await page.getByRole('button', { name: 'Préférer Charlie', exact: true }).click();
	await expect(page.getByText(/^Encore 1 duel/)).toBeVisible();
	await page.getByRole('link', { name: 'Retour' }).click();
	await expect(rows).toHaveCount(2);
	await expect(page.getByText('2 classées, 1 à classer')).toBeVisible();
	await page.getByRole('link', { name: 'Lancer le classement (1)' }).click();
	await duel(allRanked);
	await page.getByRole('link', { name: 'Voir le classement' }).click();
	await expect(rows).toHaveCount(3);

	// Aussi accessible depuis le menu des collections.
	await goHome(page);
	await page.locator('summary').first().click();
	await page.getByRole('link', { name: 'Gérer le classement' }).click();
	await expect(page.getByRole('heading', { name: 'Classement' })).toBeVisible();

	await goHome(page);
	await page.getByLabel('Trier par').selectOption('rank');
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await expect(page.locator('li.card').first()).toContainText('Alpha');
	await expect(card('Alpha')).toContainText('#1');
	await expect(card('Charlie')).toContainText('#3');
	await expect(card('Delta')).not.toContainText('#');

	// Bravo à la corbeille : Charlie remonte, sans réécrire le classement.
	await openEntry(page, 'Bravo');
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await goHome(page);
	await page.getByLabel('Trier par').selectOption('rank');
	await expect(card('Charlie')).toContainText('#2');

	// Reclasser Alpha : il perd contre Charlie, puis revient sur sa fiche.
	await openEntry(page, 'Alpha');
	await expect(page.getByText('1re sur 2 au classement')).toBeVisible();
	await page.getByRole('link', { name: 'Reclasser' }).click();
	await page.getByRole('button', { name: 'Préférer Charlie', exact: true }).click();
	await expect(page.getByText('2e sur 2 au classement')).toBeVisible();
	await page.getByRole('button', { name: 'Retirer', exact: true }).click();
	await expect(page.getByText('2e sur 2 au classement')).toBeVisible();
	await page.getByRole('button', { name: 'Retirer', exact: true }).click();
	await expect(page.getByText('Pas encore classée')).toBeVisible();
});
