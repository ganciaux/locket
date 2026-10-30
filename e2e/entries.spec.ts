import { readFile } from 'node:fs/promises';
import { PASSWORD, addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import type { Page } from '@playwright/test';

async function addSite(page: Page, label: string, urlTemplate: string) {
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les collections' }).click();
	await page.getByText(/^Sites \(/).click();
	await page.getByLabel('Libellé du site').fill(label);
	await page.getByLabel("Modèle d'URL").fill(urlTemplate);
	await page.getByRole('button', { name: 'Ajouter un site' }).click();
	await expect(page.getByText('Sites (1 actif sur 1)')).toBeVisible();
}

async function createEntry(page: Page, name: string) {
	await goHome(page);
	await page.locator('a[href="/entry/new"]').first().click();
	await page.getByLabel('Nom', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('site de collection : lien calculé, nom custom, masquage', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addSite(page, 'anime', 'https://anime.fr/search?k=');
	await createEntry(page, 'John Doe');

	const site = page.getByRole('link', { name: 'anime', exact: true });
	await expect(site).toHaveAttribute('href', 'https://anime.fr/search?k=John%20Doe');

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Terme à chercher sur anime').fill('Johnny D');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(site).toHaveAttribute('href', 'https://anime.fr/search?k=Johnny%20D');

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Afficher anime sur cette fiche').uncheck();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'John Doe' })).toBeVisible();
	await expect(site).toHaveCount(0);
	await expect(page.getByText('Aucun lien.')).toBeVisible();
});

test('liens sur les cartes : repliés par défaut, affichés avec l’option', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addSite(page, 'anime', 'https://anime.fr/search?k=');
	await createEntry(page, 'John Doe');

	await goHome(page);
	const link = page.locator('li.card').getByRole('link', { name: 'anime', exact: true });
	await expect(page.getByText('1 lien', { exact: true })).toBeVisible();
	await expect(link).toBeHidden();

	await goSettings(page);
	await page.getByLabel(/Afficher les liens sur les cartes/).check();
	await goHome(page);
	await expect(link).toBeVisible();
	await expect(page.getByText('1 lien', { exact: true })).toHaveCount(0);
});

test('colle une image dans le formulaire, sans gêner le collage de texte', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await page.locator('a[href="/entry/new"]').first().click();

	const paste = (withImage: boolean) =>
		page.evaluate(async (image) => {
			const data = new DataTransfer();
			if (image) {
				const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
				const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
				data.items.add(new File([blob!], 'capture.png', { type: 'image/png' }));
			} else data.setData('text/plain', 'texte');
			window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
		}, withImage);

	await paste(false);
	await expect(page.getByAltText('Aperçu')).toHaveCount(0);
	await paste(true);
	await expect(page.getByAltText('Aperçu')).toBeVisible();

	await page.getByLabel('Nom', { exact: true }).fill('Avec image');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Avec image' })).toBeVisible();
});

test('lien custom masqué : conservé mais pas affiché', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Avec lien');

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByRole('button', { name: 'Ajouter un lien' }).click();
	await page.getByLabel('Adresse').fill('https://perso.example/');
	await page.getByLabel('Libellé', { exact: true }).fill('perso');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	const custom = page.getByRole('link', { name: 'perso', exact: true });
	await expect(custom).toBeVisible();

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Afficher ce lien sur la fiche').uncheck();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Avec lien' })).toBeVisible();
	await expect(custom).toHaveCount(0);

	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByLabel('Adresse')).toHaveValue('https://perso.example/');
	await expect(page.getByLabel('Adresse')).toBeDisabled();
});

test('fiche cachée : absente de la liste, visible et atténuée avec le bouton', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Secrète');

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel(/Cacher cette fiche/).check();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Secrète' })).toBeVisible();

	await goHome(page);
	await expect(page.getByText('Toutes les fiches sont cachées.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Secrète' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Cachées (1)' }).click();
	const card = page.locator('li.card').filter({ hasText: 'Secrète' });
	await expect(card).toBeVisible();
	await expect(card).toHaveClass(/opacity-50/);
});

test('sauvegarde : fichier altéré refusé, suppression totale, puis restauration', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'À garder');

	await goSettings(page);
	await page.getByRole('link', { name: 'Sauvegarder / restaurer' }).click();
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
