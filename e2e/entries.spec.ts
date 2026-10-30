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

	// Bascule de la liste : vaut pour la visite, Paramètres reste la valeur par défaut.
	await page.getByRole('button', { name: 'Liens', exact: true }).click();
	await expect(link).toBeHidden();
	await expect(page.getByText('1 lien', { exact: true })).toBeVisible();

	// Filtre sur la présence de liens.
	await createEntry(page, 'Sans site');
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Afficher anime sur cette fiche').uncheck();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Sans site' })).toBeVisible();
	await goHome(page);
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	// Par défaut, seulement les fiches avec liens ; la pastille bascule vers toutes les fiches.
	await expect(card('John Doe')).toBeVisible();
	await expect(card('Sans site')).toHaveCount(0);
	await expect(page.getByText('1 fiche sur 2')).toBeVisible();
	await page.getByRole('button', { name: 'Avec liens' }).click();
	await expect(card('Sans site')).toBeVisible();
	await expect(page.getByText('2 fiches', { exact: true })).toBeVisible();

	// Sélection : masquer puis réafficher un site de la collection ; la sélection reste ouverte.
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await card('John Doe').getByRole('heading').click();
	await page.getByRole('toolbar').getByRole('button', { name: 'Liens', exact: true }).click();
	await page.getByRole('toolbar').getByText('anime', { exact: true }).click();
	await page.getByRole('button', { name: 'Masquer', exact: true }).click();
	// Les liens sont dépliés (réglage de Paramètres coché plus haut) : on regarde le lien lui-même.
	const anime = card('John Doe').getByRole('link', { name: 'anime', exact: true });
	await expect(anime).toHaveCount(0);
	await expect(page.getByText('1 sélectionnée')).toBeVisible();
	await page.getByRole('toolbar').getByRole('button', { name: 'Liens', exact: true }).click();
	await page.getByRole('toolbar').getByText('anime', { exact: true }).click();
	await page.getByRole('button', { name: 'Afficher', exact: true }).click();
	await expect(anime).toBeVisible();

	// « Définir » sans site coché les masque tous, puis avec anime coché il est le seul affiché.
	await page.getByRole('toolbar').getByRole('button', { name: 'Liens', exact: true }).click();
	await page.getByRole('button', { name: 'Masquer tous', exact: true }).click();
	await expect(anime).toHaveCount(0);
	await page.getByRole('toolbar').getByRole('button', { name: 'Liens', exact: true }).click();
	await page.getByRole('toolbar').getByText('anime', { exact: true }).click();
	await page.getByRole('button', { name: 'Définir', exact: true }).click();
	await expect(anime).toBeVisible();
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

test('sélection multiple : cacher, taguer, mettre à la corbeille', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Fiche A');
	await createEntry(page, 'Fiche B');
	await createEntry(page, 'Fiche C');

	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByLabel('Nouveau tag').fill('Lu');
	await page.getByRole('button', { name: 'Ajouter' }).click();
	await expect(page.getByText('Lu', { exact: true })).toBeVisible();
	await page.getByLabel('Nouveau tag').fill('Vu');
	await page.getByRole('button', { name: 'Ajouter' }).click();
	await expect(page.getByText('Vu', { exact: true })).toBeVisible();
	await goHome(page);

	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await card('Fiche A').getByRole('heading').click(); // coche sans ouvrir la fiche
	await card('Fiche B').getByLabel('Sélectionner Fiche B').check();
	await expect(page.getByText('2 sélectionnées')).toBeVisible();

	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await page.getByRole('toolbar').getByText('Lu', { exact: true }).click();
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	await expect(card('Fiche A').getByText('Lu')).toBeVisible();
	await expect(card('Fiche B').getByText('Lu')).toBeVisible();
	await expect(card('Fiche C').getByText('Lu')).toHaveCount(0);

	// « Définir » remplace les tags : A et B n'ont plus que Vu.
	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await page.getByRole('toolbar').getByText('Vu', { exact: true }).click();
	await page.getByRole('button', { name: 'Définir', exact: true }).click();
	await expect(card('Fiche A').getByText('Vu')).toBeVisible();
	await expect(card('Fiche A').getByText('Lu')).toHaveCount(0);
	await expect(card('Fiche B').getByText('Lu')).toHaveCount(0);

	// La sélection reste ouverte et cochée : on enchaîne en décochant B.
	await expect(page.getByText('2 sélectionnées')).toBeVisible();
	await card('Fiche B').getByRole('heading').click();
	await page.getByRole('button', { name: 'Cacher', exact: true }).click();
	await expect(card('Fiche A')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Cachées (1)' })).toBeVisible();
	await expect(page.getByText('0 sélectionnée')).toBeVisible();

	// « Tout » est une bascule : un second clic désélectionne tout.
	await page.getByRole('button', { name: 'Tout', exact: true }).click();
	await expect(page.getByText('2 sélectionnées')).toBeVisible();
	await page.getByRole('button', { name: 'Tout', exact: true }).click();
	await expect(page.getByText('0 sélectionnée')).toBeVisible();
	await page.getByRole('button', { name: 'Tout', exact: true }).click();
	await page.getByRole('toolbar').getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await expect(card('Fiche B')).toHaveCount(0);
	await expect(card('Fiche C')).toHaveCount(0);

	await goSettings(page);
	await page.getByRole('link', { name: 'Ouvrir la corbeille' }).click();
	await expect(page.getByText('Fiche B')).toBeVisible();
	await expect(page.getByText('Fiche C')).toBeVisible();
	await expect(page.getByText('Fiche A')).toHaveCount(0);
});

test('note : depuis la fiche, conservée en modification, filtre et tri', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Moyenne');
	await page.getByRole('radio', { name: '3 sur 5' }).click();
	await expect(page.getByText('3 / 5')).toBeVisible();

	await createEntry(page, 'Excellente');
	await page.getByRole('radio', { name: '4,5 sur 5' }).click();
	await expect(page.getByText('4,5 / 5')).toBeVisible();
	// Le formulaire garde la note.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Nom', { exact: true }).fill('Excellente !');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('4,5 / 5')).toBeVisible();
	// Retoucher la note actuelle l'efface.
	await page.getByRole('radio', { name: '4,5 sur 5' }).click();
	await expect(page.getByText('Pas encore notée')).toBeVisible();
	await page.getByRole('radio', { name: '4,5 sur 5' }).click();

	await createEntry(page, 'Sans avis');
	await goHome(page);
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await expect(card('Excellente').getByRole('img', { name: 'Note : 4,5 sur 5' })).toBeVisible();

	await page.getByLabel('Filtrer par note').selectOption({ label: '★ 4 et plus' });
	await expect(card('Excellente')).toBeVisible();
	await expect(card('Moyenne')).toHaveCount(0);
	await page.getByLabel('Filtrer par note').selectOption({ label: 'Sans note' });
	await expect(card('Sans avis')).toBeVisible();
	await expect(card('Excellente')).toHaveCount(0);
	await page.getByRole('button', { name: 'Effacer' }).click();

	await page.getByLabel('Trier par').selectOption('rating');
	await expect(page.locator('li.card h2')).toHaveText(['Excellente !', 'Moyenne', 'Sans avis']);
});

test('pays : saisi par nom ou par code, affiché et filtré', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);

	async function setCountry(name: string, input: string) {
		await createEntry(page, name);
		await page.getByRole('link', { name: 'Modifier' }).click();
		await page.getByLabel('Pays').fill(input);
	}

	await setCountry('Pelé', 'bresil');
	await expect(page.getByRole('status').filter({ hasText: 'Brésil' })).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('Brésil', { exact: true })).toBeVisible();

	await setCountry('Zidane', 'fr');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('France', { exact: true })).toBeVisible();

	await setCountry('Inconnu', 'Atlantide');
	await expect(page.getByText('Pays non reconnu')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Inconnu' })).toBeVisible();

	await goHome(page);
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await page.getByLabel('Filtrer par pays').selectOption('BR');
	await expect(card('Pelé')).toBeVisible();
	await expect(card('Zidane')).toHaveCount(0);
	await page.getByLabel('Filtrer par pays').selectOption('none');
	await expect(card('Inconnu')).toBeVisible();
	await expect(card('Pelé')).toHaveCount(0);
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
