/** Corbeille et sauvegarde : restauration, fichiers altérés, compte neuf. */
import { readFile } from 'node:fs/promises';
import { PASSWORD, addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import { addTagGroups, createEntry, createEntryWithImage, lockAndUnlock, openIndex } from './helpers';

test('corbeille : suppression réversible, puis définitive', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'À revoir');

	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await expect(page.getByRole('link', { name: 'Créer une fiche' })).toBeVisible();

	await goSettings(page);
	await page.getByRole('link', { name: 'Ouvrir la corbeille' }).click();
	await expect(page.getByText('À revoir')).toBeVisible();
	await expect(page.getByText('Encore 30 jours')).toBeVisible();
	await page.getByRole('button', { name: 'Restaurer' }).click();
	await expect(page.getByText('La corbeille est vide.')).toBeVisible();

	await goHome(page);
	await page.getByRole('heading', { name: 'À revoir' }).click();
	await page.getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await expect(page.getByRole('link', { name: 'Créer une fiche' })).toBeVisible();

	await goSettings(page);
	await page.getByRole('link', { name: 'Ouvrir la corbeille' }).click();
	await page.getByRole('button', { name: 'Supprimer définitivement À revoir' }).click();
	await page.getByRole('button', { name: 'Supprimer définitivement', exact: true }).click();
	await expect(page.getByText('La corbeille est vide.')).toBeVisible();

	// Depuis la fiche, la suppression définitive ne passe pas par la corbeille.
	await goHome(page);
	await createEntry(page, 'Jetable');
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
	await expect(page.getByRole('link', { name: 'Créer une fiche' })).toBeVisible();
	await goSettings(page);
	await page.getByRole('link', { name: 'Ouvrir la corbeille' }).click();
	await expect(page.getByText('La corbeille est vide.')).toBeVisible();
});

test('sauvegarde : fichier altéré refusé, suppression totale, puis restauration', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'À garder');

	await goSettings(page);
	await page.getByRole('link', { name: 'Sauvegarder / restaurer' }).click();
	// L'outil de lecture se télécharge depuis la page (le fichier lui-même est testé dans decrypt-tool.spec.ts).
	const tool = page.getByRole('link', { name: "Télécharger l'outil de lecture" });
	await expect(tool).toHaveAttribute('href', '/stash-dechiffrer.html');
	await expect(tool).toHaveAttribute('download', 'stash-dechiffrer.html');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Télécharger la sauvegarde' }).click();
	const path = await (await download).path();
	const file = await readFile(path);
	const upload = (buffer: Buffer) =>
		page.locator('input[type=file]').setInputFiles({ name: 'sauvegarde.json', mimeType: 'application/json', buffer });

	const altered = JSON.parse(file.toString());
	altered.entries[0].data.iv = `${altered.entries[0].data.iv[0] === 'A' ? 'B' : 'A'}${altered.entries[0].data.iv.slice(1)}`;
	await upload(Buffer.from(JSON.stringify(altered)));
	await expect(page.getByText(/Sauvegarde endommagée/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Restaurer' })).toBeDisabled();

	const truncated = JSON.parse(file.toString());
	truncated.entries = [];
	await upload(Buffer.from(JSON.stringify(truncated)));
	await expect(page.getByText(/Sauvegarde incomplète/)).toBeVisible();

	await goSettings(page);
	await page.getByRole('button', { name: 'Supprimer toutes les données' }).click();
	await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
	const confirm = page.getByRole('button', { name: 'Tout supprimer' });
	await expect(confirm).toBeDisabled();
	await page.getByLabel('Écrivez SUPPRIMER pour confirmer').fill('SUPPRIMER');
	await confirm.click();
	await expect(page.getByText('Toutes les données ont été supprimées (1 fiche).')).toBeVisible();

	await goHome(page);
	await expect(page.getByRole('heading', { name: 'Créez votre première collection' })).toBeVisible();

	await goSettings(page);
	await page.getByRole('link', { name: 'Sauvegarder / restaurer' }).click();
	await upload(file);
	await expect(page.getByText('Fichier vérifié : complet et non modifié depuis son export.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Restaurer' })).toBeDisabled();
	await page.getByLabel(/Je comprends que le contenu actuel/).check();
	await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
	await page.getByRole('button', { name: 'Restaurer' }).click();
	await expect(page.getByText('1 fiche restaurée.')).toBeVisible();

	await page.getByRole('link', { name: 'Voir mes fiches' }).click();
	await expect(page.getByRole('heading', { name: 'À garder' })).toBeVisible();
});

test('sauvegarde : restaurée dans un compte neuf avec l’ancienne clé de récupération', async ({ page }) => {
	// Ancien compte : une collection, un tag rangé, une fiche avec image complète.
	const { recoveryKey } = await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action');
	await createEntryWithImage(page, 'Gardée');
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByRole('button', { name: 'Action' }).click();
	await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Gardée' })).toBeVisible();

	await goSettings(page);
	await page.getByRole('link', { name: 'Sauvegarder / restaurer' }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Télécharger la sauvegarde' }).click();
	const file = await readFile((await (await download).path())!);

	// Tout est perdu sauf le fichier et la clé : nouveau compte, autre email, nouvelle clé.
	await goSettings(page);
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await signUp(page);
	await goSettings(page);
	await page.getByRole('link', { name: 'Sauvegarder / restaurer' }).click();
	await page.locator('input[type=file]').setInputFiles({ name: 'sauvegarde.json', mimeType: 'application/json', buffer: file });
	await expect(page.getByText('Fichier chiffré avec une autre clé : il sera vérifié à la restauration.')).toBeVisible();
	await page.getByLabel(/Je comprends que le contenu actuel/).check();
	await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
	await page.getByRole('button', { name: 'Restaurer' }).click();
	const oldSecret = page.getByLabel("Ancien mot de passe ou clé de récupération de l'ancien compte");
	await oldSecret.fill(recoveryKey);
	await page.getByRole('button', { name: 'Restaurer' }).click();
	await expect(page.getByText(/1 fiche restaurée\.\s*Votre clé de récupération valable est désormais celle de l'ancien compte\./)).toBeVisible();

	// Fiche, tag et image complète relus, y compris après verrouillage avec le mot de passe du nouveau compte.
	await lockAndUnlock(page);
	await openIndex(page);
	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Gardée' })).toContainText('Action');
	await page.getByRole('link', { name: 'Gardée', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Gardée' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Gardée' })).toBeVisible();

	// L'ancienne clé de récupération ouvre désormais ce compte.
	await goSettings(page);
	await page.getByRole('button', { name: 'Tester ma clé' }).click();
	await page.getByLabel('Clé à tester').fill(recoveryKey);
	await page.getByRole('button', { name: 'Tester', exact: true }).click();
	await expect(page.getByText('Cette clé est la bonne.')).toBeVisible();
});

test('corbeille : une fiche restaurée dont le nom est repris est renommée', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Doublon');
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await createEntry(page, 'Doublon');

	await goSettings(page);
	await page.getByRole('link', { name: 'Ouvrir la corbeille' }).click();
	await page.getByRole('button', { name: 'Restaurer' }).click();
	await expect(page.getByText(/fiche restaurée sous le nom « Doublon \(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\) »/)).toBeVisible();
	await goHome(page);
	await expect(page.locator('li.card').filter({ hasText: 'Doublon (' })).toHaveCount(1);
	await expect(page.getByText('2 fiches', { exact: true })).toBeVisible();
});
