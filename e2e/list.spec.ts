/** « Mes fiches » : cartes, fiche agrandie, recherche, navigation, sélection multiple, éléments cachés. */
import { PASSWORD, addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import { addSite, createEntry, createEntryWithImage, swipeOn } from './helpers';

test('fiche agrandie : au-dessus de la liste, voisines, fermeture, accès à la fiche', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addSite(page, 'anime', 'https://anime.fr/search?k=');
	await createEntry(page, 'Jane Roe');
	await createEntry(page, 'John Doe');

	await page.getByRole('main').getByRole('link', { name: 'Mes fiches', exact: true }).click();
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	const animeOf = (name: string) => card(name).getByRole('link', { name: 'anime', exact: true });
	// Copier le nom depuis la liste, sans agrandir ni ouvrir la carte.
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: 'Copier le nom de John Doe' }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('John Doe');
	await expect(page.getByRole('button', { name: 'Copié' })).toBeVisible();

	// Un clic agrandit la carte, la liste reste dessous ; un autre clic la referme.
	const zoom = page.getByRole('dialog');
	await expect(animeOf('John Doe')).toHaveCount(0);
	await card('John Doe').getByRole('heading').click();
	await expect(zoom.getByRole('heading', { name: 'John Doe' })).toBeVisible();
	await expect(zoom.getByRole('link', { name: 'anime', exact: true })).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
	await zoom.locator('figure').click();
	await expect(zoom).toHaveCount(0);

	// Clic sur le fond, Échap, flèches du clavier et glissement du doigt.
	await card('John Doe').locator('figure').click({ force: true });
	await expect(zoom).toBeVisible();
	await page.mouse.click(3, 3);
	await expect(zoom).toHaveCount(0);
	await card('John Doe').getByRole('heading').click();
	const nextKey = (await zoom.getByRole('button', { name: 'Fiche suivante' }).isEnabled()) ? 'ArrowRight' : 'ArrowLeft';
	await page.keyboard.press(nextKey);
	await expect(zoom.getByRole('heading', { name: 'Jane Roe' })).toBeVisible();
	await swipeOn(zoom, nextKey === 'ArrowRight' ? 80 : -80);
	await expect(zoom.getByRole('heading', { name: 'John Doe' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(zoom).toHaveCount(0);

	await card('Jane Roe').getByRole('heading').click();
	await zoom.getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await expect(page).toHaveURL(/\/entry\/[^/]+$/);
	await page.getByRole('main').getByRole('link', { name: 'Mes fiches', exact: true }).click();

	// Bascule de la liste : les liens sur toutes les cartes, puis de nouveau compactes.
	const linksToggle = page.getByRole('button', { name: 'Liens sur les cartes' });
	await linksToggle.click();
	await expect(animeOf('John Doe')).toBeVisible();
	await expect(animeOf('Jane Roe')).toBeVisible();
	await linksToggle.click();
	await expect(animeOf('John Doe')).toHaveCount(0);

	// Clic = ouvrir la fiche : la barre « Détails » de la carte l'agrandit.
	await goSettings(page);
	await page.getByRole('radio', { name: 'Ouvrir la fiche' }).check();
	await goHome(page);
	await expect(animeOf('John Doe')).toHaveCount(0);
	await card('John Doe').getByRole('button', { name: 'Détails' }).click();
	await expect(zoom.getByRole('link', { name: 'anime', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(zoom).toHaveCount(0);
	await card('John Doe').getByRole('heading').click();
	await expect(page).toHaveURL(/\/entry\/[^/]+$/);

	// Liens sur les cartes pour la suite : réglage retenu, et plus de barre « Détails » sans tag à montrer.
	await goHome(page);
	await linksToggle.click();
	await goSettings(page);
	await goHome(page);
	await expect(linksToggle).toHaveAttribute('aria-pressed', 'true');
	await expect(animeOf('John Doe')).toBeVisible();
	await expect(card('John Doe').getByRole('button', { name: 'Détails' })).toHaveCount(0);

	// Filtre sur la présence de liens.
	await createEntry(page, 'Sans site');
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByLabel('Afficher anime sur cette fiche').uncheck();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name: 'Sans site' })).toBeVisible();
	await goHome(page);
	// Par défaut, seulement les fiches avec liens ; la pastille bascule vers toutes les fiches.
	await expect(card('John Doe')).toBeVisible();
	await expect(card('Sans site')).toHaveCount(0);
	await expect(page.getByText('2 fiches sur 3')).toBeVisible();
	await page.getByRole('button', { name: 'Avec liens' }).click();
	await expect(card('Sans site')).toBeVisible();
	await expect(page.getByText('3 fiches', { exact: true })).toBeVisible();

	// Sélection : masquer puis réafficher un site de la collection ; la sélection reste ouverte.
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await card('John Doe').getByRole('heading').click();
	await page.getByRole('toolbar').getByRole('button', { name: 'Liens', exact: true }).click();
	await page.getByRole('toolbar').getByText('anime', { exact: true }).click();
	await page.getByRole('button', { name: 'Masquer', exact: true }).click();
	// Liens sur les cartes : on regarde le lien lui-même.
	const anime = animeOf('John Doe');
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
	await page.getByRole('button', { name: 'Tags sur les cartes' }).click();
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

test('sélection multiple : la dernière action s’annule, tags comme corbeille', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Fiche A');
	await createEntry(page, 'Fiche B');
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByLabel('Nouveau tag').fill('Lu');
	await page.getByRole('button', { name: 'Ajouter' }).click();
	await expect(page.getByText('Lu', { exact: true })).toBeVisible();
	await goHome(page);

	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await page.getByRole('button', { name: 'Tags sur les cartes' }).click();
	await page.getByRole('button', { name: 'Sélection', exact: true }).click();
	await page.getByRole('button', { name: 'Tout', exact: true }).click();
	await page.getByRole('button', { name: 'Tags', exact: true }).click();
	await page.getByRole('toolbar').getByText('Lu', { exact: true }).click();
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	await expect(card('Fiche A').getByText('Lu')).toBeVisible();
	await expect(page.getByText('Tags ajoutés à 2 fiches.')).toBeVisible();
	await page.getByRole('button', { name: 'Annuler', exact: true }).click();
	await expect(card('Fiche A').getByText('Lu')).toHaveCount(0);
	await expect(card('Fiche B').getByText('Lu')).toHaveCount(0);
	await expect(page.getByText('Tags ajoutés à 2 fiches.')).toHaveCount(0);

	await page.getByRole('toolbar').getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await expect(card('Fiche A')).toHaveCount(0);
	await expect(page.getByText('2 fiches mises à la corbeille.')).toBeVisible();
	await page.getByRole('button', { name: 'Annuler', exact: true }).click();
	await expect(card('Fiche A')).toBeVisible();
	await expect(card('Fiche B')).toBeVisible();

	// Annulation écrite dans Firestore : toujours là après une réouverture.
	await page.reload();
	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
	await expect(card('Fiche A')).toBeVisible();
	await expect(card('Fiche B')).toBeVisible();
});

test('recherche : filtre la liste, effacée d’un clic', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Jane Roe');
	await createEntry(page, 'John Doe');
	await goHome(page);

	const cards = page.locator('li.card');
	const search = page.getByLabel('Rechercher');
	await expect(page.getByRole('button', { name: 'Effacer la recherche' })).toHaveCount(0);
	await search.fill('jane');
	await expect(cards).toHaveCount(1);
	await page.getByRole('button', { name: 'Effacer la recherche' }).click();
	await expect(search).toHaveValue('');
	await expect(search).toBeFocused();
	await expect(cards).toHaveCount(2);
});

test('fiche agrandie : ouvrir, modifier, ressemblantes', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntryWithImage(page, 'Alpha');
	await createEntryWithImage(page, 'Bravo');
	await createEntry(page, 'Zulu');
	await goHome(page);

	const zoom = page.getByRole('dialog');
	await page.locator('li.card').filter({ hasText: 'Alpha' }).getByRole('heading').click();
	// Pas de focus d'entrée sur le bouton de copie : il s'entourerait d'un trait.
	await expect(zoom.getByRole('button', { name: 'Copier le nom' })).not.toBeFocused();

	await zoom.getByRole('button', { name: 'Similaires' }).click();
	await expect(zoom.getByRole('button', { name: 'Voir Bravo' })).toBeVisible();
	await expect(zoom.getByRole('button', { name: 'Voir Zulu' })).toHaveCount(0);
	await zoom.getByRole('button', { name: 'Voir Bravo' }).click();
	await expect(zoom.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	// Même image, noms sans mot commun ; ni tags ni pays : non comparables, absents du détail.
	await expect(zoom.getByText(/^Ressemblance/)).toHaveText('Ressemblance 70 % : image 100 % · nom 0 %');
	// Aperçu : fermer ramène à la fiche de départ, le zoom reste ouvert.
	await page.keyboard.press('Escape');
	await expect(zoom.getByRole('heading', { name: 'Alpha' })).toBeVisible();
	await zoom.getByRole('button', { name: 'Voir Bravo' }).click();
	await zoom.getByRole('button', { name: 'Retour à Alpha' }).click();
	await expect(zoom.getByRole('heading', { name: 'Alpha' })).toBeVisible();

	// « Aller à cette fiche » quitte l'aperçu : fermer referme alors le zoom.
	await zoom.getByRole('button', { name: 'Voir Bravo' }).click();
	await zoom.getByRole('button', { name: 'Aller à cette fiche' }).click();
	await expect(zoom.getByRole('button', { name: 'Retour à Alpha' })).toHaveCount(0);
	await expect(zoom.getByRole('heading', { name: 'Bravo' })).toBeVisible();

	await zoom.getByRole('link', { name: 'Modifier la fiche' }).click();
	await expect(page).toHaveURL(/\/entry\/[^/]+\/edit$/);
	await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Bravo');
});

test('navigation : fiches voisines dans la liste filtrée, retour et place conservés', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Alpha', 'Bravo', 'Charlie']) await createEntry(page, name);

	await goHome(page);
	await page.getByLabel('Trier par').selectOption('name');
	const card = (name: string) => page.locator('li.card').filter({ hasText: name });
	await card('Alpha').getByRole('heading').click();
	await page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la fiche' }).click();

	const previous = page.getByRole('button', { name: 'Fiche précédente' });
	const next = page.getByRole('button', { name: 'Fiche suivante' });
	await expect(page.getByText('1 / 3')).toBeVisible();
	await expect(previous).toBeDisabled();
	await next.click();
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	await expect(page.getByText('2 / 3')).toBeVisible();

	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('heading', { name: 'Charlie' })).toBeVisible();
	await expect(next).toBeDisabled();
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();

	// Modifier la fiche ne fait pas perdre la liste d'origine.
	await page.getByRole('link', { name: 'Modifier' }).click();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('2 / 3')).toBeVisible();

	// Une recherche réduit la navigation aux résultats.
	await page.getByRole('link', { name: 'Mes fiches' }).first().click();
	await page.getByLabel('Rechercher').fill('br');
	await card('Bravo').getByRole('heading').click();
	await page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la fiche' }).click();
	// Sinon la carte et le zoom, encore affichés, donnent deux titres « Bravo ».
	await expect(page).toHaveURL(/\/entry\/[^/]+$/);
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	await expect(next).toHaveCount(0);

	// Une fiche créée n'appartient pas à la liste d'origine : elle navigue dans sa collection.
	await createEntry(page, 'Delta');
	await expect(page.getByText('4 / 4')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Mes fiches' }).first()).toBeVisible();
});

test('collection cachée : absente du menu et des choix, réaffichée sur demande', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les collections' }).click();
	await page.getByLabel('Nouvelle collection').fill('Movie');
	await page.getByRole('button', { name: 'Ajouter' }).click();
	await expect(page.getByLabel('Cacher la collection Movie')).toBeVisible();

	// Au moins une reste visible.
	await page.getByLabel('Cacher la collection Manga').check();
	await expect(page.getByLabel('Cacher la collection Manga')).toBeChecked();
	await page.getByLabel('Cacher la collection Movie').click();
	await expect(page.getByText('Au moins une collection doit rester visible.')).toBeVisible();
	await expect(page.getByLabel('Cacher la collection Movie')).not.toBeChecked();

	// La collection active cachée laisse la place à la première visible.
	await goHome(page);
	await page.getByRole('heading', { name: 'Movie' }).click();
	const choices = page.locator('details.dropdown ul button[aria-current]');
	await expect(choices).toHaveCount(1);
	await page.getByRole('button', { name: 'Afficher les cachées (1)' }).click();
	await expect(choices).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Masquer les cachées (1)' })).toHaveAttribute('aria-pressed', 'true');
});

test('une fiche au hasard parmi celles affichées, agrandie comme un clic sur sa carte', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Akira');
	await createEntry(page, 'Monster');
	await createEntry(page, 'Pluto');
	await goHome(page);

	// Filtré sur un seul résultat : pas de tirage.
	await page.getByLabel('Rechercher').fill('akira');
	await expect(page.getByRole('button', { name: 'Une fiche au hasard' })).toHaveCount(0);

	// Jamais deux fois la même de suite.
	await page.getByLabel('Rechercher').fill('');
	const dice = page.getByRole('button', { name: 'Une fiche au hasard' });
	const picked: string[] = [];
	for (let i = 0; i < 3; i++) {
		await dice.click();
		const heading = page.getByRole('dialog').getByRole('heading').first();
		await expect(heading).toHaveText(/^(Akira|Monster|Pluto)$/);
		picked.push((await heading.textContent())!.trim());
		await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	}
	expect(picked[1]).not.toBe(picked[0]);
	expect(picked[2]).not.toBe(picked[1]);

	// Après un tirage, le dé de la carte agrandie en refait un ; un clic ordinaire sur une carte ne le propose pas.
	await dice.click();
	const zoomed = page.getByRole('dialog');
	const first = (await zoomed.getByRole('heading').first().textContent())!.trim();
	await zoomed.getByRole('button', { name: 'Un autre tirage' }).click();
	await expect(zoomed.getByRole('heading').first()).not.toHaveText(first);
	await zoomed.getByRole('button', { name: 'Fermer' }).click();
	await page.locator('li.card').first().getByRole('heading').click();
	await expect(zoomed.getByRole('button', { name: 'Un autre tirage' })).toHaveCount(0);
	await zoomed.getByRole('button', { name: 'Fermer' }).click();

	// Clic réglé sur « Ouvrir la fiche » : le tirage ouvre la fiche, dont le bandeau propose un autre tirage.
	await goSettings(page);
	await page.getByRole('radio', { name: 'Ouvrir la fiche' }).click();
	await goHome(page);
	await dice.click();
	await expect(page).toHaveURL(/\/entry\/[^/]+\?tirage$/);
	const opened = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
	await page.getByRole('button', { name: 'Un autre tirage' }).click();
	await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(opened);
	await expect(page).toHaveURL(/\?tirage$/);
});

test('tirage au hasard : mode et durée réglés dans Paramètres, aperçu animé, retenus', async ({ page }) => {
	await signUp(page);
	await goSettings(page);
	const sample = page.locator('div.size-20[aria-hidden="true"]');
	const animated = () => sample.evaluate((node) => node.getAnimations().length > 0);

	await page.getByRole('radio', { name: 'Retournement' }).check();
	expect(await animated()).toBe(true);
	await expect(page.getByText('La carte arrive de dos et se retourne.')).toBeVisible();
	await page.getByLabel('Durée du tirage').fill('2000');
	await expect(page.getByText('Durée : 2 s')).toBeVisible();

	await goHome(page);
	await goSettings(page);
	await expect(page.getByRole('radio', { name: 'Retournement' })).toBeChecked();
	await expect(page.getByLabel('Durée du tirage')).toHaveValue('2000');
	await page.getByRole('button', { name: 'Aperçu' }).click();
	expect(await animated()).toBe(true);
	// Animation au hasard : l'icône Remélanger, à côté du titre.
	const shuffle = page.getByRole('button', { name: 'Animation au hasard' });
	await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
	await shuffle.click();
	await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Une des trois animations, différente à chaque tirage.')).toBeVisible();
	// Exemple en or : paillettes en plus du reflet.
	await page.getByLabel("Bordure de l'exemple").selectOption('gold');
	await expect(page.locator('.reveal-spark').first()).toBeAttached();
	await goHome(page);
	await goSettings(page);
	await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
});