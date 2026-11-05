/** Tags et catégories : rangement, saisie groupée, unicité, suppression. */
import { addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import { addTagGroups, createEntry, openTagGroups } from './helpers';

test('catégories de tags : ordre, tags rangés, choix groupé, suppression sans perte', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Naruto');

	await addTagGroups(page, 'Genre', 'Statut');
	await page.getByRole('button', { name: 'Monter Statut' }).click();

	const addTag = async (name: string, group: string) => {
		await page.getByLabel('Catégorie du nouveau tag').selectOption({ label: group });
		await page.getByLabel('Nouveau tag', { exact: true }).fill(name);
		await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
		await expect(page.getByText(name, { exact: true })).toBeVisible();
	};
	await addTag('Action', 'Genre');
	await addTag('Fini', 'Statut');
	await addTag('Libre', 'Sans catégorie');
	const tagHeadings = page.getByRole('heading', { level: 2 }).filter({ hasNotText: 'Catégories' });
	await expect(tagHeadings).toHaveText(['Statut', 'Genre', 'Sans catégorie']);

	// Changer de catégorie déplace le tag ; la catégorie vide disparaît de la liste.
	await page.getByLabel('Catégorie du tag Libre').selectOption({ label: 'Genre' });
	await expect(tagHeadings).toHaveText(['Statut', 'Genre']);

	// Formulaire : une ligne par catégorie, dans l'ordre choisi.
	await goHome(page);
	await page.locator('li.card').filter({ hasText: 'Naruto' }).getByRole('heading').click();
	await page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await page.getByRole('link', { name: 'Modifier' }).click();
	const picker = page.getByRole('group', { name: 'Tags de la fiche' });
	await expect(picker.getByRole('group')).toHaveText([/^Statut\s*Fini$/, /^Genre\s*Action\s*Libre$/]);
	await picker.getByRole('button', { name: 'Action' }).click();
	await picker.getByRole('button', { name: 'Fini' }).click();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Naruto' })).toBeVisible();
	await expect(page.getByText('Statut', { exact: true })).toBeVisible();
	await expect(page.getByText('Genre', { exact: true })).toBeVisible();

	// Filtre en facettes : une pastille par catégorie ; ET entre catégories, OU dans une catégorie.
	await goHome(page);
	const facet = (name: string) => page.getByRole('group', { name: 'Filtrer par tags' }).locator('summary').filter({ hasText: name });
	const naruto = page.locator('li.card').filter({ hasText: 'Naruto' });
	await facet('Statut').click();
	await page.getByRole('checkbox', { name: 'Fini' }).check();
	await expect(naruto).toHaveCount(1);
	await expect(facet('Statut')).toHaveText(/Statut\s*: Fini/);
	await facet('Genre').click(); // ferme la liste de Statut
	await expect(page.getByRole('checkbox', { name: 'Fini' })).toBeHidden();
	await page.getByRole('checkbox', { name: 'Libre' }).check();
	await expect(naruto).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Action' }).check();
	await expect(naruto).toHaveCount(1);
	await expect(facet('Genre')).toContainText('+1');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('checkbox', { name: 'Action' })).toBeHidden();

	// « Non renseigné » : en OU avec les tags de la catégorie.
	await facet('Statut').click();
	await page.getByRole('checkbox', { name: 'Non renseigné' }).check();
	await expect(naruto).toHaveCount(1);
	await page.getByRole('checkbox', { name: 'Fini' }).uncheck();
	await expect(naruto).toHaveCount(0);
	await expect(facet('Statut')).toHaveText(/Statut\s*: Non renseigné/);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Effacer', exact: true }).click();

	// Recherche simple / avancée : Genre seulement sur demande, Statut jamais ; « Autres » toujours.
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByText('Catégories (2)').click();
	await page.getByLabel('Filtre de la catégorie Genre').selectOption('advanced');
	await expect(page.getByLabel('Filtre de la catégorie Genre')).toHaveValue('advanced');
	await page.getByLabel('Filtre de la catégorie Statut').selectOption('off');
	await expect(page.getByLabel('Filtre de la catégorie Statut')).toHaveValue('off');
	await goHome(page);
	const advanced = page.getByRole('button', { name: 'Recherche avancée' });
	await expect(advanced).toHaveAttribute('aria-pressed', 'false');
	await expect(facet('Genre')).toHaveCount(0);
	await expect(facet('Statut')).toHaveCount(0);
	await advanced.click();
	await expect(facet('Genre')).toBeVisible();
	await expect(facet('Statut')).toHaveCount(0);
	// Un filtre actif n'est jamais caché : la catégorie reste en recherche simple tant qu'elle est cochée.
	await facet('Genre').click();
	await page.getByRole('checkbox', { name: 'Action' }).check();
	await page.keyboard.press('Escape');
	await advanced.click();
	await expect(facet('Genre')).toHaveText(/Genre\s*: Action/);
	await page.getByRole('button', { name: 'Effacer', exact: true }).click();
	await expect(facet('Genre')).toHaveCount(0);

	// Supprimer une catégorie garde ses tags, sans catégorie.
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByText('Catégories (2)').click();
	await page.getByRole('button', { name: 'Supprimer la catégorie Genre' }).click();
	await expect(page.getByText('Ses 2 tags resteront, sans catégorie.')).toBeVisible();
	await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
	await expect(tagHeadings).toHaveText(['Statut', 'Sans catégorie']);
	await expect(page.getByText('Action', { exact: true })).toBeVisible();
});

test('catégorie créée avec ses tags : « Genre = Action, Drame »', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	// Un tag existant, sans catégorie : il sera rangé dans la nouvelle.
	await page.getByLabel('Nouveau tag', { exact: true }).fill('Action');
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	await expect(page.getByText('Action', { exact: true })).toBeVisible();

	await page.getByText('Catégories (0)').click();
	await page.getByLabel('Nouvelle catégorie').fill('Genre = action, Drame, , Comédie, drame');
	await page.getByRole('button', { name: 'Ajouter la catégorie' }).click();
	await expect(page.getByText('Catégories (1)')).toBeVisible();
	await expect(page.getByText('3 tags')).toBeVisible();
	const tagHeadings = page.getByRole('heading', { level: 2 }).filter({ hasNotText: 'Catégories' });
	await expect(tagHeadings).toHaveText(['Genre']);
	for (const name of ['Action', 'Drame', 'Comédie']) await expect(page.getByText(name, { exact: true })).toHaveCount(1);
});

test('tags : même nom dans deux catégories, unique dans une catégorie', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Genre = Action', 'Thème = Action');
	await expect(page.getByText('Action', { exact: true })).toHaveCount(2);

	// Dans une même catégorie, le nom reste unique (sans casse ni accents).
	const addTag = async (name: string, group: string) => {
		await page.getByLabel('Catégorie du nouveau tag').selectOption({ label: group });
		await page.getByLabel('Nouveau tag', { exact: true }).fill(name);
		await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	};
	await addTag('action', 'Genre');
	await expect(page.getByText('« action » existe déjà.')).toBeVisible();
	await addTag('Action', 'Sans catégorie');
	await expect(page.getByText('Action', { exact: true })).toHaveCount(3);

	// Changer de catégorie vers une catégorie qui a déjà ce nom : refusé, le menu revient à la catégorie actuelle.
	const select = page.getByLabel('Catégorie du tag Action').last();
	await select.selectOption({ label: 'Genre' });
	await expect(page.getByText('« Action » existe déjà.')).toBeVisible();
	await expect(select).toHaveValue('');
	await expect(page.getByText('Action', { exact: true })).toHaveCount(3);
});

test('catégories sur plusieurs lignes, puis tout supprimer : catégories, puis tags', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Naruto');
	await openTagGroups(page);

	const input = page.getByLabel('Nouvelle catégorie');
	await input.fill('Genre = Action, Drame\nStatut = Fini, En cours\n\nThème = Action');
	await input.press('Control+Enter');
	await expect(page.getByText('Catégories (3)')).toBeVisible();
	await expect(input).toHaveValue('');
	const tagHeadings = page.getByRole('heading', { level: 2 }).filter({ hasNotText: 'Catégories' });
	await expect(tagHeadings).toHaveText(['Genre', 'Statut', 'Thème']);
	// Une catégorie existante est complétée ; une ligne fautive bloque tout, avec son numéro.
	await input.fill('Genre = Comédie, drame\nStatut');
	await page.getByRole('button', { name: 'Ajouter la catégorie' }).click();
	await expect(page.getByText('Ligne 2 : « Statut » existe déjà.')).toBeVisible();
	await expect(page.getByText('Comédie', { exact: true })).toHaveCount(0);
	await input.fill('Genre = Comédie, drame');
	await page.getByRole('button', { name: 'Ajouter la catégorie' }).click();
	await expect(page.getByText('Comédie', { exact: true })).toBeVisible();
	await expect(page.getByText('Drame', { exact: true })).toHaveCount(1);

	// Le tag sur une fiche, pour le message de suppression.
	await goHome(page);
	await page.locator('li.card').filter({ hasText: 'Naruto' }).getByRole('heading').click();
	await page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByRole('group', { name: 'Tags de la fiche' }).getByRole('button', { name: 'Fini' }).click();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Naruto' })).toBeVisible();

	// Toutes les catégories : les tags restent, sans catégorie.
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByText('Catégories (3)').click();
	await page.getByRole('button', { name: 'Supprimer toutes les catégories' }).click();
	await page.getByRole('button', { name: 'Annuler' }).click();
	await expect(page.getByText('Catégories (3)')).toBeVisible();
	await page.getByRole('button', { name: 'Supprimer toutes les catégories' }).click();
	await expect(page.getByText('Supprimer les 3 catégories ? Leurs tags resteront, sans catégorie.')).toBeVisible();
	await page.getByRole('button', { name: 'Tout supprimer' }).click();
	await expect(page.getByText('Catégories (0)')).toBeVisible();
	await expect(page.getByText('Fini', { exact: true })).toBeVisible();

	// Tous les tags de la collection.
	await page.getByRole('button', { name: 'Supprimer tous les tags' }).click();
	await expect(page.getByText('Supprimer les 6 tags de « Manga » et les retirer de 1 fiche ? Les catégories restent.')).toBeVisible();
	await page.getByRole('button', { name: 'Tout supprimer' }).click();
	await expect(page.getByText("Aucun tag dans « Manga » pour l'instant.")).toBeVisible();
});

test('bordure des cartes : catégorie en un seul choix, couleur par tag, remplacée par la sélection', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addTagGroups(page, 'Rareté = Or, Argent');
	await page.getByRole('checkbox', { name: 'Bordure des cartes' }).check();
	// Chaque choix est enregistré (pastille affichée) avant le suivant.
	await page.getByLabel('Couleur de bordure du tag Or').selectOption({ label: 'Or' });
	await expect(page.locator('span.bg-\\[\\#c9a227\\]')).toBeVisible();
	await page.getByLabel('Couleur de bordure du tag Argent').selectOption({ label: 'Argent' });
	await expect(page.locator('span.bg-\\[\\#a7adb7\\]')).toBeVisible();

	// Un seul tag de la catégorie sur la fiche : cocher Argent décoche Or.
	await goHome(page);
	await page.locator('a[href="/entry/new"]').first().click();
	await page.getByLabel('Nom', { exact: true }).fill('Akira');
	const picker = page.getByRole('group', { name: 'Tags de la fiche' });
	await picker.getByRole('button', { name: 'Or' }).click();
	await picker.getByRole('button', { name: 'Argent' }).click();
	await expect(picker.getByRole('button', { name: 'Or' })).toHaveAttribute('aria-pressed', 'false');
	await expect(picker.getByRole('button', { name: 'Argent' })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Akira' })).toBeVisible();

	await goHome(page);
	const card = page.locator('li.card').filter({ hasText: 'Akira' });
	await expect(card).toHaveClass(/ring-\[#a7adb7\]/);

	// Sélection : ajouter Or remplace Argent.
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await card.getByRole('heading').click();
	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await page.getByRole('toolbar').getByRole('button', { name: 'Or' }).click();
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	await expect(card).toHaveClass(/ring-\[#c9a227\]/);
	await page.getByRole('button', { name: 'Tags sur les cartes' }).click();
	await expect(card.getByText('Argent')).toHaveCount(0);
});
