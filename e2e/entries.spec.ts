/** Fiches : formulaire, image, liens, sites, nom unique, note, pays, naissance. */
import { addFirstCollection, expect, goHome, signUp, test } from './fixtures';
import { addSite, createEntry, createEntryWithImage, goIndex, lockAndUnlock, newEntryForm, openEntry, openIndex, swipeOn } from './helpers';

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

test('colle une image dans le formulaire, sans gêner le collage de texte', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await newEntryForm(page);

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
	await expect(page.getByAltText('Couverture', { exact: true })).toHaveCount(0);
	await paste(true);
	await expect(page.getByAltText('Couverture', { exact: true })).toBeVisible();

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

	// Note : pastille à choix unique, refermée dès le choix.
	const ratingFacet = page.locator('summary').filter({ hasText: 'Note' });
	await ratingFacet.click();
	await page.getByRole('radio', { name: '★ 4 et plus' }).check();
	await expect(ratingFacet).toHaveText(/Note\s*: ★ 4 et plus/);
	await expect(card('Excellente')).toBeVisible();
	await expect(card('Moyenne')).toHaveCount(0);
	await ratingFacet.click();
	await page.getByRole('radio', { name: 'Sans note' }).check();
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
	// Pays à cocher, en OU.
	await page.locator('summary').filter({ hasText: 'Pays' }).click();
	await page.getByRole('checkbox', { name: /Brésil/ }).check();
	await expect(card('Pelé')).toBeVisible();
	await expect(card('Zidane')).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Sans pays' }).check();
	await expect(card('Inconnu')).toBeVisible();
	await expect(card('Pelé')).toBeVisible();
	// Filtre actif résumé en clair sous les filtres.
	await expect(page.getByText('Pays : Brésil ou Sans pays', { exact: true })).toBeVisible();
	await page.getByRole('checkbox', { name: /Brésil/ }).uncheck();
	await expect(card('Pelé')).toHaveCount(0);
	await expect(card('Inconnu')).toBeVisible();
});

test('nom unique dans la collection : signalé à la saisie, refusé à l’enregistrement', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'École');

	await newEntryForm(page);
	const name = page.getByLabel('Nom', { exact: true });
	await name.fill('Naruto');
	await expect(page.getByText('Disponible')).toBeVisible();
	await name.fill(' ecole ');
	await expect(page.getByText('Déjà pris dans cette collection')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('« École » existe déjà dans cette collection.')).toBeVisible();
	// La croix efface le nom pris, pour en saisir un autre.
	await page.getByRole('button', { name: 'Effacer le nom' }).click();
	await expect(name).toHaveValue('');
	await expect(name).toBeFocused();
	await name.fill('École');

	// La fiche modifiée ne se compte pas elle-même.
	await page.getByRole('link', { name: 'voir « École »' }).click();
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByText('Disponible')).toBeVisible();
});

test('site sur demande : absent tant que la fiche ne l’active pas, avec son propre terme', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addSite(page, 'anime', 'https://anime.fr/search?k=');
	await page.getByLabel('Libellé du site').fill('wiki');
	await page.getByLabel("Modèle d'URL").fill('https://wiki.fr/{{name}}');
	await page.getByRole('button', { name: 'Ajouter un site' }).click();
	await page.getByLabel('Utilisation de wiki').selectOption({ label: 'Sur demande' });
	await expect(page.getByText('Sites (2 actifs sur 2)')).toBeVisible();

	await createEntry(page, 'Goku');
	await expect(page.getByRole('link', { name: 'anime', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'wiki', exact: true })).toHaveCount(0);

	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByLabel('Terme à chercher sur wiki')).toBeDisabled();
	await page.getByLabel('Afficher wiki sur cette fiche').check();
	await page.getByLabel('Terme à chercher sur wiki').fill('Son_Goku');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('link', { name: 'wiki', exact: true })).toHaveAttribute('href', 'https://wiki.fr/Son_Goku');

	// Un terme peut être un chemin : les « / » sont gardés.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Terme à chercher sur wiki').fill('/model/name');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('link', { name: 'wiki', exact: true })).toHaveAttribute('href', 'https://wiki.fr/model/name');
});

test('nouvelle fiche depuis une fiche, nom prêt à saisir', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Jane Roe');

	await page.getByRole('link', { name: 'Nouvelle fiche' }).click();
	await expect(page.getByRole('heading', { name: 'Nouvelle fiche' })).toBeVisible();
	await page.keyboard.type('John Doe');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'John Doe' })).toBeVisible();

	// Glissement du doigt : la voisine, par ordre de nom ici.
	await swipeOn(page.locator('article'), 80);
	await expect(page.getByRole('heading', { name: 'Jane Roe' })).toBeVisible();
	await swipeOn(page.locator('article'), -80);
	await expect(page.getByRole('heading', { name: 'John Doe' })).toBeVisible();

	// Création à la suite : formulaire vide, nom prêt à saisir, sans quitter la page.
	await page.getByRole('link', { name: 'Nouvelle fiche' }).click();
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
	await page.keyboard.type('Alice');
	await page.getByRole('button', { name: 'Et une autre fiche' }).click();
	await expect(page.getByText('« Alice » enregistrée.')).toBeVisible();
	await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('');
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
	await page.keyboard.type('Bob');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Bob' })).toBeVisible();

	// En modification, le focus n'est pas forcé sur le nom.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByLabel('Nom', { exact: true })).not.toBeFocused();
});

test('année de naissance : âge sur la fiche, le zoom et l’index, effaçable', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Akira');
	const age = `${new Date().getFullYear() - 1990} ans`;

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Année de naissance').fill('1990');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText(`${age} (1990)`)).toBeVisible();
	await goHome(page);
	// Pas sur la carte (place comptée) : dans l'index, à la demande.
	await expect(page.locator('li.card').getByText(age)).toHaveCount(0);
	await openIndex(page);
	await expect(page.getByText(age)).toHaveCount(0);
	await page.getByRole('button', { name: 'Âge' }).click();
	await expect(page.getByRole('listitem').getByText(age)).toBeVisible();
	await goHome(page);

	await page.locator('li.card').getByRole('heading').click();
	await expect(page.getByRole('dialog').getByText(age)).toBeVisible();
	await page.keyboard.press('Escape');
	await openEntry(page, 'Akira');
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByLabel('Année de naissance')).toHaveValue('1990');
	await page.getByLabel('Année de naissance').fill('');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Akira' })).toBeVisible();
	await expect(page.getByText(age)).toHaveCount(0);
});

test('remarques : saisies, affichées, gardées par une note, trouvées par la recherche', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Monster');
	await createEntry(page, 'Akira');

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Remarques').fill('  Vu en 2024\n\n\n\nConseillé par Élodie  ');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	const remarks = page.getByText(/^Vu en 2024\s+Conseillé par Élodie$/);
	await expect(remarks).toBeVisible();

	// Une écriture partielle (la note) réécrit la fiche sans perdre les remarques.
	await page.getByRole('radio', { name: '4 sur 5' }).check({ force: true });
	await expect(page.getByText('4 / 5')).toBeVisible();
	await lockAndUnlock(page);
	await page.getByLabel('Rechercher').fill('elodie');
	await expect(page.locator('li.card')).toHaveCount(1);
	await openEntry(page, 'Akira');
	await expect(remarks).toBeVisible();
});

test('fiche validée : confirmation avant de modifier, note figée, filtre, laissée de côté par la sélection', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Monster');
	await createEntry(page, 'Akira');

	await page.getByRole('button', { name: 'Valider', exact: true }).click();
	await expect(page.getByText(/Validée le [0-9]/)).toBeVisible();
	await expect(page.getByRole('radio', { name: '4 sur 5' })).toBeDisabled();

	// Modifier demande confirmation ; la fiche reste validée après l'enregistrement.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByText('« Akira » est validée. La modifier quand même ?')).toBeVisible();
	await expect(page.getByLabel('Nom', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Modifier quand même' }).click();
	await page.getByLabel('Remarques').fill('Relue');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('Relue')).toBeVisible();
	await expect(page.getByText(/Validée le [0-9]/)).toBeVisible();

	await goHome(page);
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await expect(card('Akira').getByRole('img', { name: 'Validée' })).toBeVisible();
	await expect(card('Monster').getByRole('img', { name: 'Validée' })).toHaveCount(0);
	await page.locator('summary').filter({ hasText: 'Statut' }).click();
	await page.getByRole('radio', { name: 'À valider' }).check();
	await expect(card('Akira')).toHaveCount(0);
	await expect(card('Monster')).toBeVisible();
	await page.locator('summary').filter({ hasText: 'Statut' }).click();
	await page.getByRole('radio', { name: 'Validées' }).check();
	await expect(card('Monster')).toHaveCount(0);
	await page.getByRole('button', { name: 'Effacer' }).click();

	// Même filtre dans l'index, à part de celui de « Mes fiches ».
	await openIndex(page);
	await expect(page).toHaveURL(/\/list$/);
	await page.locator('summary').filter({ hasText: 'Statut' }).click();
	await page.getByRole('radio', { name: 'À valider' }).check();
	await expect(page.getByRole('link', { name: 'Monster', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Akira', exact: true })).toHaveCount(0);
	// Coche en bout de ligne (affichée par défaut), masquable par « Validées ».
	await page.locator('summary').filter({ hasText: 'Statut' }).click();
	await page.getByRole('radio', { name: 'Validées' }).check();
	const row = page.getByRole('listitem').filter({ hasText: 'Akira' });
	await expect(row.getByRole('img', { name: 'Validée' })).toBeVisible();
	await page.getByRole('button', { name: 'Validées', exact: true }).click();
	await expect(row.getByRole('img', { name: 'Validée' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Effacer' }).click();

	// Sélection (index en cartes) : « Cacher » laisse la validée de côté.
	await page.getByRole('radio', { name: 'Cartes' }).check();
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await page.getByRole('button', { name: 'Tout', exact: true }).click();
	await expect(page.getByText('1 validée laissée de côté')).toBeVisible();
	await page.getByRole('button', { name: 'Cacher', exact: true }).click();
	await expect(card('Monster')).toHaveCount(0);
	await expect(card('Akira')).toBeVisible();

	// Akira reste cochée (seule affichée) : retirer la validation depuis la sélection.
	await expect(page.getByText('1 sélectionnée')).toBeVisible();
	await page.getByRole('button', { name: 'Dévalider' }).click();
	await expect(card('Akira').getByRole('img', { name: 'Validée' })).toHaveCount(0);
});

test('cadrage de la carte : seulement pour une image non carrée, appliqué à la miniature', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await newEntryForm(page);
	await page.getByLabel('Nom', { exact: true }).fill('Portrait');
	const paste = (width: number, height: number) =>
		page.evaluate(
			async ([width, height]) => {
				const canvas = Object.assign(document.createElement('canvas'), { width, height });
				const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
				const data = new DataTransfer();
				data.items.add(new File([blob!], 'capture.png', { type: 'image/png' }));
				window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
			},
			[width, height]
		);

	// Carrée : rien à cadrer.
	await paste(300, 300);
	await expect(page.getByAltText('Couverture', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Cadrage de la carte')).toHaveCount(0);

	// En hauteur : de haut en bas (la carrée retirée d'abord, sinon la nouvelle viendrait à la suite).
	await page.getByRole('button', { name: "Retirer l'image 1" }).click();
	await paste(300, 600);
	const framing = page.getByLabel('Cadrage de la carte');
	await expect(framing).toHaveValue('50');
	await expect(page.getByText('Haut', { exact: true })).toBeVisible();
	await framing.fill('0');
	await expect(page.getByAltText('Aperçu de la carte')).toHaveClass(/object-\[0%_0%\]/);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Portrait' })).toBeVisible();

	await goHome(page);
	await expect(page.locator('li.card img')).toHaveClass(/object-\[0%_0%\]/);
	await openEntry(page, 'Portrait');
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByLabel('Cadrage de la carte')).toHaveValue('0');
});

test('recadrer et pivoter : nouvelle image puis image enregistrée, remplacée à l’enregistrement', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await newEntryForm(page);
	await page.getByLabel('Nom', { exact: true }).fill('Photo');
	await page.evaluate(async () => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 300, height: 600 });
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		const data = new DataTransfer();
		data.items.add(new File([blob!], 'capture.png', { type: 'image/png' }));
		window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	});
	const preview = page.getByAltText('Couverture', { exact: true });
	const naturalSize = () => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
	await expect(preview).toBeVisible();

	// Pivoter d'un quart de tour : l'image passe en largeur.
	await page.getByRole('button', { name: 'Recadrer ou pivoter' }).click();
	const apply = page.getByRole('button', { name: 'Appliquer' });
	await expect(apply).toBeDisabled();
	await page.getByRole('button', { name: 'Pivoter à droite' }).click();
	await apply.click();
	await expect(preview).toBeVisible();
	expect(await naturalSize()).toEqual([600, 300]);
	await expect(page.getByText('Gauche', { exact: true })).toBeVisible();

	// Recadrer : le coin bas droit tiré vers le centre.
	await page.getByRole('button', { name: 'Recadrer ou pivoter' }).click();
	const corner = page.locator('circle[data-handle="se"]');
	const box = (await corner.boundingBox())!;
	const svgBox = (await page.locator('svg[preserveAspectRatio]').boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2, { steps: 5 });
	await page.mouse.up();
	await apply.click();
	await expect(preview).toBeVisible();
	const [width, height] = await naturalSize();
	expect(width).toBeGreaterThan(250);
	expect(width).toBeLessThan(350);
	expect(height).toBeGreaterThan(120);
	expect(height).toBeLessThan(180);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Photo' })).toBeVisible();

	// Image déjà enregistrée : rouverte (déchiffrée) dans l'éditeur, annuler ne change rien.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByRole('button', { name: 'Recadrer ou pivoter' }).click();
	await expect(page.locator('svg[preserveAspectRatio]')).toHaveAttribute('viewBox', `0 0 ${width} ${height}`);
	await page.getByRole('button', { name: 'Annuler', exact: true }).first().click();
	await expect(preview).toBeVisible();
});

test('autres images : ajoutées, réordonnées, une passe en couverture, affichées sur la fiche, retirées', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntryWithImage(page, 'Album', 400);
	// Images de tailles différentes, pour les reconnaître (largeur × hauteur).
	const png = (width: number, height: number) =>
		page.evaluate(
			([w, h]) => Object.assign(document.createElement('canvas'), { width: w, height: h }).toDataURL('image/png').split(',')[1],
			[width, height]
		);
	const file = async (name: string, width: number, height: number) => ({
		name,
		mimeType: 'image/png',
		buffer: Buffer.from(await png(width, height), 'base64')
	});

	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Ajouter des images').setInputFiles([await file('a.png', 500, 200), await file('b.png', 200, 500)]);
	const extras = page.getByRole('list', { name: 'Images' }).getByRole('img', { name: /^Image \d/ });
	await expect(extras).toHaveCount(2);
	const sizes = () => extras.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).naturalWidth));
	await expect.poll(sizes).toEqual([500, 200]);
	await page.getByRole('button', { name: "Reculer l'image 2" }).click();
	await expect.poll(sizes).toEqual([200, 500]);
	// La 500 × 200 avancée jusqu'en couverture : l'ancienne couverture (400) prend sa place, puis recule.
	await page.getByRole('button', { name: "Avancer l'image 3" }).click();
	await expect.poll(sizes).toEqual([500, 200]);
	await page.getByRole('button', { name: "Avancer l'image 2" }).click();
	const preview = page.getByAltText('Couverture', { exact: true });
	await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(500);
	await expect.poll(sizes).toEqual([400, 200]);
	await page.getByRole('button', { name: "Reculer l'image 2" }).click();
	await expect.poll(sizes).toEqual([200, 400]);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Album' })).toBeVisible();

	// Sur la fiche : carrousel de la couverture et des deux autres ; un point amène à son image, chargée en entier.
	const strip = page.getByRole('list', { name: 'Images de la fiche' });
	await expect(strip.getByRole('button')).toHaveCount(3);
	await strip.getByRole('button', { name: "Afficher l'image 2 de Album" }).click();
	await expect(strip.getByRole('button', { name: "Afficher l'image 2 de Album" })).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => page.getByRole('img', { name: 'Album, image 2' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(200);

	// Rouvertes (déchiffrées) dans le formulaire ; une retirée.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect.poll(sizes).toEqual([200, 400]);
	await page.getByRole('button', { name: "Retirer l'image 2" }).click();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Album' })).toBeVisible();
	await expect(strip.getByRole('button')).toHaveCount(2);

	// Nombre d'images (couverture comprise) sur la carte, en pile, et dans l'index, qui filtre ces fiches.
	await createEntry(page, 'Seule');
	await goHome(page);
	const albumCard = page.locator('li.card').filter({ hasText: 'Album' });
	await expect(albumCard.getByRole('img', { name: '2 images' })).toBeVisible();
	await expect(albumCard).toHaveAttribute('data-stack', '2');
	await expect(page.locator('li.card').filter({ hasText: 'Seule' })).not.toHaveAttribute('data-stack');
	await goIndex(page);
	await expect(page.getByRole('listitem').filter({ hasText: 'Album' }).getByRole('img', { name: '2 images' })).toBeVisible();
	await page.getByRole('button', { name: 'Plusieurs images' }).click();
	await expect(page.getByRole('link', { name: 'Album', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Seule', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Effacer', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Seule', exact: true })).toBeVisible();

	// Fiche agrandie : le même carrousel ; glisser sur les images ne change pas de fiche, glisser ailleurs si.
	await goHome(page);
	await page.locator('li.card').filter({ hasText: 'Album' }).getByRole('heading').click();
	const zoom = page.getByRole('dialog');
	const zoomStrip = zoom.getByRole('list', { name: 'Images de la fiche' });
	await expect(zoomStrip.getByRole('button')).toHaveCount(2);
	await zoomStrip.getByRole('button', { name: "Afficher l'image 2 de Album" }).click();
	await expect.poll(() => zoom.getByRole('img', { name: 'Album, image 2' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(400);
	await swipeOn(zoom.getByRole('img', { name: 'Album, image 2' }), -150);
	await expect(zoom.getByRole('heading', { name: 'Album' })).toBeVisible();
	const first = (await zoom.getByRole('status').filter({ hasText: '/ 2' }).textContent())?.trim() === '1 / 2';
	await swipeOn(zoom.getByRole('heading', { name: 'Album' }), first ? -150 : 150);
	await expect(zoom.getByRole('heading', { name: 'Seule' })).toBeVisible();
});

test('images : collées par le bouton « Coller », par Ctrl+V ou dans la zone de collage, à la suite de la couverture', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntryWithImage(page, 'Collage', 400);
	await page.getByRole('link', { name: 'Modifier' }).click();
	const extras = page.getByRole('list', { name: 'Images' }).getByRole('img', { name: /^Image \d/ });
	const cover = page.getByAltText('Couverture', { exact: true });
	await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(400);

	// Bouton « Coller » : l'image du presse-papiers, à la suite.
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.evaluate(async () => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 300, height: 200 });
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
	});
	await page.getByRole('button', { name: 'Coller', exact: true }).click();
	await expect(extras).toHaveCount(1);

	// Ctrl+V n'importe où : ajoutée aussi, la couverture ne change pas.
	await page.evaluate(async () => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 250, height: 250 });
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		const data = new DataTransfer();
		data.items.add(new File([blob!], 'capture.png', { type: 'image/png' }));
		window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	});
	await expect(extras).toHaveCount(2);
	await expect.poll(() => extras.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).naturalWidth))).toEqual([300, 250]);
	expect(await cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(400);

	// Zone de collage (iPhone : appui long, « Coller ») : l'image s'ajoute, la zone se referme ; un texte n'y reste pas.
	const zone = page.getByLabel('Zone de collage des images');
	await zone.focus();
	await zone.evaluate(async (node) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 220, height: 220 });
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		const data = new DataTransfer();
		data.items.add(new File([blob!], 'photo.png', { type: 'image/png' }));
		node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	});
	await expect(extras).toHaveCount(3);
	await expect(zone).not.toBeFocused();
	await zone.fill('du texte');
	await expect(zone).toHaveValue('');
	expect(await cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(400);
});
