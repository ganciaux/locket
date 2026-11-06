/** Index (backoffice) : liste par initiale, « Il manque », import, comparaison, statistiques. */
import { addFirstCollection, expect, goHome, signUp, test } from './fixtures';
import { addTagGroups, createEntry, goIndex, importTable, openIndex } from './helpers';

test('index : fiches par initiale, recherche sur le nom, retour depuis une fiche', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Écho', 'Alpha', '2046']) await createEntry(page, name);
	await goHome(page);

	await page.getByRole('heading', { name: 'Manga' }).click();
	// Menu du titre : pages propres à la collection active.
	await expect(page.locator('details.dropdown ul a')).toHaveText([
		'Chercher des fiches',
		'Index de la collection',
		'Album de la collection',
		'Gérer les liens',
		'Gérer les tags',
		'Gérer le classement',
		'Statistiques'
	]);
	// Depuis le menu, la collection est déjà choisie : son menu en en-tête, pas de sélecteur, retour vers les fiches.
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await expect(page.getByRole('heading', { name: 'Tags' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Manga' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Collection' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Mes fiches' }).click();
	await expect(page).toHaveURL(/\/$/);
	await openIndex(page);
	await expect(page).toHaveURL(/\/list$/);
	// L'import garde l'en-tête de la collection, avec un retour à l'index.
	await page.getByRole('link', { name: 'Importer' }).click();
	await expect(page.getByRole('heading', { name: 'Importer des fiches' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Manga' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Mes fiches' })).toBeVisible();
	await page.getByRole('link', { name: 'Index', exact: true }).click();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['#', 'A', 'E']);
	await expect(page.getByRole('status').filter({ hasText: 'fiches' })).toHaveText('3 fiches');

	// Sans casse ni accents, sur le nom seulement.
	await page.getByLabel('Rechercher un nom').fill('echo');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['E']);
	await expect(page.getByRole('status').filter({ hasText: 'fiche' })).toHaveText('1 fiche sur 3');

	// Lettres de séparation affichées par défaut ; sans elles, une liste continue, toujours par nom.
	await page.getByLabel('Rechercher un nom').fill('');
	const initials = page.getByRole('button', { name: 'A…Z' });
	await expect(initials).toHaveAttribute('aria-pressed', 'true');
	await initials.click();
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
	await expect(page.getByRole('listitem')).toHaveText([/2046/, /Alpha/, /Écho/]);
	await initials.click();
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['#', 'A', 'E']);

	// Les options sont mémorisées sur l'appareil.
	await page.getByRole('button', { name: 'Tags' }).click();
	await expect(page.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('link', { name: 'Écho', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Écho' })).toBeVisible();
	// Fiche, puis modification : le retour mène toujours à l'index.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByRole('heading', { name: 'Modifier la fiche' })).toBeVisible();
	await page.getByRole('link', { name: 'Index', exact: true }).click();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-pressed', 'true');

	// Crayon de la ligne : modification directe ; Annuler et Enregistrer ramènent à l'index.
	await page.getByRole('link', { name: 'Modifier Écho' }).click();
	await expect(page.getByRole('heading', { name: 'Modifier la fiche' })).toBeVisible();
	await page.getByRole('link', { name: 'Annuler' }).click();
	await expect(page).toHaveURL(/\/list$/);
	await page.getByRole('link', { name: 'Modifier Alpha' }).click();
	await page.getByLabel('Nom', { exact: true }).fill('Alpha bis');
	await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.getByRole('link', { name: 'Alpha bis', exact: true })).toBeVisible();
});

test('import d’un tableau : modèle, aperçu, lignes en erreur laissées de côté, ajouts et mises à jour', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Naruto');

	await addTagGroups(page, 'Genre');
	for (const name of ['Action', 'Aventure']) {
		await page.getByLabel('Catégorie du nouveau tag').selectOption({ label: 'Genre' });
		await page.getByLabel('Nouveau tag', { exact: true }).fill(name);
		await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
		await expect(page.getByText(name, { exact: true })).toBeVisible();
	}

	await goHome(page);
	await openIndex(page);
	await page.getByRole('link', { name: 'Importer' }).click();

	// Modèle : en-têtes de la collection et fiches existantes.
	await page.getByRole('button', { name: 'Partir de mes fiches' }).click();
	const table = page.getByLabel('Tableau', { exact: true });
	await expect(table).toHaveValue('Nom;Pays;Naissance;Note;Genre\nNaruto;;;;');

	// Légende : la liste des codes pays ISO, repliée.
	await page.getByText('Colonnes et valeurs acceptées').click();
	await page.getByText(/^Voir les 249 codes$/).click();
	await expect(page.getByRole('listitem').filter({ hasText: /^CZ Tchéquie$/ })).toBeVisible();
	await page.getByText('Colonnes et valeurs acceptées').click();

	// Une erreur d'en-tête bloque tout l'import.
	await table.fill('Nom;Pays;Auteur\nnaruto;Japon;x');
	await page.getByRole('button', { name: 'Vérifier' }).click();
	await expect(page.getByText('Rien ne peut être importé :')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Importer/ })).toBeDisabled();
	await page.getByRole('button', { name: 'Modifier le tableau' }).click();

	// Une ligne en erreur est laissée de côté : les autres s'importent sans elle, puis elle reste à corriger.
	await table.fill('Nom;Pays;Naissance;Genre\nnaruto;Japon;1999;Action\nOne Piece;JP;;Aventur');
	await page.getByRole('button', { name: 'Vérifier' }).click();
	await expect(page.getByText('Ligne 3 : tag « Aventur » inconnu dans Genre.')).toBeVisible();
	await expect(page.getByText('Pays : — → Japon · Naissance : — → 1999 · Genre : — → Action')).toBeVisible();
	await page.getByRole('button', { name: 'Importer sans les erreurs (1)' }).click();
	await expect(page.getByText('1 fiche importée, 1 ligne laissée de côté :')).toBeVisible();
	await expect(page.getByText('Ligne 3 : tag « Aventur » inconnu dans Genre.')).toBeVisible();
	await page.getByRole('button', { name: 'Corriger les lignes ignorées' }).click();
	await expect(table).toHaveValue('Nom;Pays;Naissance;Genre\nOne Piece;JP;;Aventur');

	// Rien d'autre à importer : les lignes en erreur s'isolent directement depuis l'aperçu.
	await table.fill('Nom;Pays;Naissance;Genre\nnaruto;Japon;1999;Action\nOne Piece;JP;;Aventur');
	await page.getByRole('button', { name: 'Vérifier' }).click();
	await expect(page.getByText('Rien d’autre à importer. Lignes en erreur :')).toBeVisible();
	await page.getByRole('button', { name: 'Ne garder que les lignes en erreur' }).click();
	await expect(table).toHaveValue('Nom;Pays;Naissance;Genre\nOne Piece;JP;;Aventur');

	await table.fill('Nom;Pays;Naissance;Genre\nOne Piece;JP;;Aventure');
	await page.getByRole('button', { name: 'Vérifier' }).click();
	await expect(page.getByRole('status')).toHaveText(/1 ajout · 0 modification ·\s+0 fiche inchangée/);
	await page.getByRole('button', { name: 'Importer (1)' }).click();

	await expect(page).toHaveURL(/\/list$/);
	await page.getByRole('button', { name: 'Âge' }).click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Naruto' })).toContainText(`${new Date().getFullYear() - 1999} ans`);
	await page.getByRole('link', { name: 'One Piece', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'One Piece' })).toBeVisible();
	await expect(page.getByText('Japon')).toBeVisible();
	await expect(page.getByText('Aventure', { exact: true })).toBeVisible();
});

test('index : comparer une liste de noms à la collection', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Naruto', 'Éric Dupont']) await createEntry(page, name);
	await goHome(page);
	await openIndex(page);
	await page.getByRole('link', { name: 'Comparer une liste' }).click();
	await expect(page.getByRole('heading', { name: 'Comparer une liste' })).toBeVisible();

	await page.getByLabel('Noms à comparer').fill('Zorro\n  naruto \n\nAlpha\nzorro\neric dupont');
	const missing = page.getByRole('region', { name: /^Absents/ });
	const found = page.getByRole('region', { name: /^Déjà dans la collection/ });
	await expect(missing.getByRole('heading')).toHaveText('Absents de la collection (2)');
	await expect(missing.getByRole('listitem')).toHaveText(['Alpha', 'Zorro']);
	await expect(found.getByRole('listitem')).toHaveText([/Éric Dupont\s*saisi « eric dupont »$/, /Naruto\s*saisi « naruto »$/]);
	await expect(page.getByText('1 doublon retiré de la liste.')).toBeVisible();

	// Sans tri : l'ordre saisi ; la liste des absents se copie d'un clic.
	await page.getByLabel('Trier par ordre alphabétique').uncheck();
	await expect(missing.getByRole('listitem')).toHaveText(['Zorro', 'Alpha']);
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await missing.getByRole('button', { name: 'Copier les absents' }).click();
	// Windows rend les fins de ligne du presse-papiers en CRLF.
	expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('Zorro\nAlpha');

	// Une fiche déjà présente s'ouvre depuis la liste.
	await found.getByRole('link', { name: 'Naruto' }).click();
	await expect(page.getByRole('heading', { name: 'Naruto' })).toBeVisible();
});

test('index : « Il manque » pour compléter les fiches', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action');

	await goHome(page);
	await openIndex(page);
	await importTable(page, 'Nom;Pays;Naissance;Genre\nAlpha;FR;1990;Action\nBravo;;1990;\nCharlie;JP;;Action', 3);
	await expect(page).toHaveURL(/\/list$/);

	// Pastille à choix unique, comme la note de la liste.
	const missing = page.locator('summary').filter({ hasText: 'Il manque' });
	const choose = async (label: string) => {
		await missing.click();
		await page.getByRole('radio', { name: label, exact: true }).check();
	};
	const names = page.getByRole('listitem').getByRole('link').filter({ hasText: /\S/ }); // sans les crayons
	await expect(names).toHaveText(['Alpha', 'Bravo', 'Charlie']);
	await choose('Pays');
	await expect(names).toHaveText(['Bravo']);
	await expect(page.getByRole('listitem')).toContainText('Manque : pays, image, Genre');
	await choose('Naissance');
	await expect(names).toHaveText(['Charlie']);
	await choose('Genre');
	await expect(names).toHaveText(['Bravo']);
	// Aucune image : toutes incomplètes.
	await choose('Une info');
	await expect(names).toHaveText(['Alpha', 'Bravo', 'Charlie']);
	await expect(page.getByRole('listitem').filter({ hasText: 'Alpha' })).toContainText('Manque : image');

	// Miniature (initiale sans image) et classement : affichés à la demande.
	await page.getByRole('button', { name: 'Miniature' }).click();
	const thumb = page.getByRole('listitem').filter({ hasText: 'Alpha' }).getByText('A', { exact: true });
	await expect(thumb).toBeVisible();
	// Un clic sur la miniature ouvre la fiche, comme le nom.
	await thumb.click();
	await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
	await page.goBack();
	// Trois états : petite, grande, aucune.
	await page.getByRole('button', { name: 'Miniature' }).click();
	await expect(page.getByRole('button', { name: 'Miniature : grande' })).toBeVisible();
	expect((await thumb.boundingBox())?.width).toBeGreaterThan(80);
	await page.getByRole('button', { name: 'Miniature' }).click();
	await expect(page.getByRole('button', { name: 'Miniature : aucune' })).toHaveAttribute('aria-pressed', 'false');
	await expect(thumb).toBeHidden();
	await expect(page.getByRole('button', { name: 'Classement' })).toHaveAttribute('aria-pressed', 'false');

	// Gardé en revenant d'une fiche.
	await choose('Pays');
	await names.first().click();
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	await page.goBack();
	await expect(missing).toHaveText(/Il manque\s*: Pays/);
	await expect(names).toHaveText(['Bravo']);
});

test('index : filtres note et pays ; en sélection, beaucoup de tags défilent dans le bandeau', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	const many = Array.from({ length: 60 }, (_, i) => `Tag ${i + 1}`).join(', ');
	await addTagGroups(page, `Genre = ${many}`);

	await goHome(page);
	await openIndex(page);
	await importTable(page, 'Nom;Pays;Note\nAlpha;FR;4,5\nBravo;FR;1\nCharlie;JP;', 3);

	const names = page.getByRole('listitem').getByRole('link').filter({ hasText: /\S/ });
	await page.locator('summary').filter({ hasText: 'Pays' }).click();
	await page.getByRole('checkbox', { name: /France \(2\)/ }).check();
	await expect(names).toHaveText(['Alpha', 'Bravo']);
	await page.locator('summary').filter({ hasText: 'Note' }).click();
	await page.getByRole('radio', { name: '★ 4 et plus' }).check();
	await expect(names).toHaveText(['Alpha']);
	await page.getByRole('button', { name: 'Effacer', exact: true }).click();
	await expect(names).toHaveText(['Alpha', 'Bravo', 'Charlie']);

	// Téléphone : la liste des tags dépasse l'écran et défile dans le bandeau. Sans cela, le premier tag restait
	// au-dessus de l'écran, inatteignable (bandeau fixe, page figée).
	await page.setViewportSize({ width: 390, height: 500 });
	// Bandeau « emulator mode » de Firebase (absent en production) : il recouvre le bas de l'écran.
	await page.locator('.firebase-emulator-warning').evaluate((banner) => banner.remove());
	await page.getByRole('button', { name: 'Sélection' }).click();
	const toolbar = page.getByRole('toolbar', { name: 'Actions sur la sélection' });
	await toolbar.getByRole('button', { name: 'Tout' }).click();
	await toolbar.getByRole('button', { name: 'Tags' }).click();
	await toolbar.getByRole('button', { name: 'Tag 1', exact: true }).click();
	await toolbar.getByRole('button', { name: 'Ajouter' }).click();
	await expect(toolbar.getByText('Tags ajoutés à 3 fiches.')).toBeVisible();
});

test('statistiques de la collection : chiffres clés, répartitions et lien vers les fiches à compléter', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action, Drame');

	await goHome(page);
	await openIndex(page);
	await importTable(page, 'Nom;Pays;Naissance;Note;Genre\nAlpha;FR;1985;4,5;Action\nBravo;FR;1981;;Action, Drame\nCharlie;JP;1999;1;', 3);
	await expect(page).toHaveURL(/\/list$/);

	await page.getByRole('heading', { name: 'Manga' }).click();
	await page.getByRole('link', { name: 'Statistiques' }).click();
	await expect(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible();
	const tile = (label: string) => page.locator('div, a').filter({ has: page.getByText(label, { exact: true }) }).last();
	await expect(tile('Fiches')).toContainText('3');
	await expect(tile('Notées')).toContainText('2');
	await expect(page.getByText('🇫🇷 France')).toBeVisible();
	await expect(page.getByText('Années 1980')).toBeVisible();
	await expect(page.getByText('2 / 3 fiches · 67 %')).toBeVisible();
	await expect(page.getByText('Action · 2')).toBeVisible();

	// Aucune image : les trois fiches sont à compléter, l'index s'ouvre filtré.
	await expect(tile('À compléter')).toContainText('3');
	await page.getByRole('link', { name: /À compléter/ }).click();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.locator('summary').filter({ hasText: 'Il manque' })).toHaveText(/Il manque\s*: Une info/);
});

test('index : bouton +, sélection en liste par cases à cocher, filtre par tag', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action, Drame');
	for (const name of ['Akira', 'Monster', 'Pluto']) await createEntry(page, name);

	await goIndex(page);
	await expect(page.locator('a[href="/entry/new"]')).toBeVisible();
	// En sélection : la case ou le nom cochent la fiche, sans l'ouvrir ; le « + » laisse la place à la barre.
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await expect(page.locator('a[href="/entry/new"]')).toHaveCount(0);
	await page.getByLabel('Sélectionner Akira').check();
	await page.getByRole('link', { name: 'Monster', exact: true }).click();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.getByText('2 sélectionnées')).toBeVisible();
	await page.getByRole('toolbar').getByRole('button', { name: 'Tags', exact: true }).click();
	await page.getByRole('toolbar').getByRole('button', { name: 'Action' }).click();
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	await expect(page.getByText('Tags ajoutés à 2 fiches.')).toBeVisible();
	await page.getByRole('button', { name: 'Quitter la sélection' }).click();

	// Filtre par tag, à part de celui de la recherche.
	const facet = (name: string) => page.getByRole('group', { name: 'Filtrer par tags' }).locator('summary').filter({ hasText: name });
	await facet('Genre').click();
	await page.getByRole('checkbox', { name: 'Action' }).check();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('link', { name: 'Akira', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Monster', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Pluto', exact: true })).toHaveCount(0);
	await expect(page.getByText('2 fiches sur 3')).toBeVisible();
	await goHome(page);
	await expect(page.locator('li.card')).toHaveCount(3);
	await goIndex(page);
	await page.getByRole('button', { name: 'Effacer' }).click();
	await expect(page.getByRole('link', { name: 'Pluto', exact: true })).toBeVisible();

	// En cartes : un clic ouvre la fiche.
	await page.getByRole('radio', { name: 'Cartes' }).check();
	await page.locator('li.card').filter({ hasText: 'Pluto' }).getByRole('heading').click();
	await expect(page.getByRole('heading', { name: 'Pluto', level: 1 })).toBeVisible();
});
