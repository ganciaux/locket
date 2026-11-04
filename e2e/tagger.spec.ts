/** Mode Tagger : file, enregistrement à la suite, suggestions. */
import { addFirstCollection, expect, goHome, signUp, test } from './fixtures';
import { addTagGroups, createEntryWithImage, importTable, openIndex } from './helpers';

test('mode Tagger : file des fiches sans tag, enregistrer et suivante, navigation', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action, Drame');

	await goHome(page);
	await openIndex(page);
	await importTable(page, 'Nom;Genre\nAlpha;Action\nBravo;\nCharlie;', 3);
	await expect(page).toHaveURL(/\/list$/);

	// File : les fiches sans tag (Bravo, Charlie), Alpha en est exclue.
	await page.getByRole('button', { name: 'Tagger' }).click();
	await expect(page).toHaveURL(/\/tagging$/);
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('1 / 2');
	await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();

	await page.getByRole('button', { name: 'Drame' }).click();
	await page.getByRole('button', { name: 'Enregistrer et suivante' }).click();
	await expect(page.getByRole('heading', { name: 'Charlie' })).toBeVisible();
	await expect(page.getByText('1 faite · 1 restante')).toBeVisible();

	// Changer de fiche sans enregistrer : la modale propose de continuer, abandonner ou enregistrer.
	await page.getByRole('button', { name: 'Drame' }).click();
	await page.getByRole('button', { name: 'Fiche précédente' }).click();
	const unsaved = page.getByRole('dialog');
	await expect(unsaved.getByText('Les tags de « Charlie » ont changé.')).toBeVisible();
	await unsaved.getByRole('button', { name: 'Continuer la saisie' }).click();
	await expect(page.getByRole('heading', { name: 'Charlie' })).toBeVisible();
	await page.getByRole('button', { name: 'Fiche précédente' }).click();
	await unsaved.getByRole('button', { name: 'Abandonner' }).click();

	// Retour en arrière : la fiche enregistrée garde son tag.
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Drame' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Faite', { exact: true })).toBeVisible();

	// Dernière à faire : enregistrer et terminer ramène à l'index ; le Drame abandonné n'a pas été gardé.
	await page.getByRole('button', { name: 'Fiche suivante' }).click();
	await expect(page.getByRole('button', { name: 'Drame' })).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Action' }).click();
	await page.getByRole('button', { name: 'Enregistrer et terminer' }).click();
	await expect(page).toHaveURL(/\/list$/);
	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Charlie' })).toContainText('Action');
	await expect(page.getByRole('listitem').filter({ hasText: 'Bravo' })).toContainText('Drame');
});

test('mode Tagger : tags suggérés par les fiches ressemblantes', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action, Drame');

	// Même image : Bravo ressemble à Alpha, qui porte « Action ».
	await createEntryWithImage(page, 'Alpha');
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByRole('button', { name: 'Action' }).click();
	await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
	await createEntryWithImage(page, 'Bravo');

	await goHome(page);
	await openIndex(page);
	await page.getByRole('button', { name: 'Tagger' }).click();
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	const suggested = page.getByRole('group', { name: 'Tags suggérés' });
	await suggested.getByRole('button', { name: 'Ajouter Action' }).click();
	await expect(page.getByRole('group', { name: 'Tags de la fiche' }).getByRole('button', { name: 'Action' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(suggested).toHaveCount(0);
	await page.getByRole('button', { name: 'Enregistrer et terminer' }).click();
	await expect(page).toHaveURL(/\/list$/);
	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Bravo' })).toContainText('Action');
});
