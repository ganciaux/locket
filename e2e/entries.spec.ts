import { readFile } from 'node:fs/promises';
import { PASSWORD, addFirstCollection, expect, goHome, goSettings, signUp, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/** Glissement du doigt, simulé : Chrome de bureau ne le produit pas. */
const swipeOn = (target: Locator, dx: number) =>
	target.evaluate((node, dx) => {
		const touch = (clientX: number) => new Touch({ identifier: 1, target: node, clientX: 200 + clientX, clientY: 200 });
		const send = (type: string, x: number, active: boolean) =>
			node.dispatchEvent(
				new TouchEvent(type, { bubbles: true, touches: active ? [touch(x)] : [], changedTouches: [touch(x)] })
			);
		send('touchstart', 0, true);
		send('touchend', dx, false);
	}, dx);

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
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
	await page.getByLabel('Nom', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function lockAndUnlock(page: Page) {
	await goHome(page);
	await page.getByRole('button', { name: 'Verrouiller' }).click();
	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
}

/** Compte les fiches du cache IndexedDB, ou en retire ou abîme une ; retourne leur nombre avant l'action. */
const editCache = (page: Page, action: 'count' | 'drop' | 'damage' | 'expire') =>
	page.evaluate(async (action) => {
		const done = <T>(req: IDBRequest<T>) =>
			new Promise<T>((resolve, reject) => {
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
		const open = indexedDB.open('stash-cache');
		const cache = await done(open);
		const tx = cache.transaction(['entries', 'state'], 'readwrite');
		const store = tx.objectStore('entries');
		const list = await done(store.getAll());
		if (action === 'expire') {
			const state = await done(tx.objectStore('state').get('current'));
			await done(tx.objectStore('state').put({ ...state, filledAt: 0 }, 'current'));
		}
		if (action === 'drop') await done(store.delete(list[0].id));
		if (action === 'damage') {
			list[0].data.data[0] ^= 1;
			await done(store.put(list[0]));
		}
		cache.close();
		return list.length;
	}, action);

test('cache local : suit ses écritures et celles d’un autre appareil, résiste à une copie abîmée', async ({ page, browser }) => {
	const { email } = await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Alpha');
	await createEntry(page, 'Bravo');
	const names = page.getByRole('heading', { level: 2 });
	await lockAndUnlock(page);
	await expect(names).toHaveCount(2);
	await expect.poll(() => editCache(page, 'count')).toBe(2);

	// Une écriture de cet appareil met la copie à jour, sans rechargement complet.
	await createEntry(page, 'Charlie');
	expect(await editCache(page, 'count')).toBe(3);

	// La copie sert bien : une fiche retirée de la copie disparaît, Firestore n'a pas été relu.
	await editCache(page, 'drop');
	await lockAndUnlock(page);
	await expect(names).toHaveCount(2);

	// Copie trop ancienne : relue depuis Firestore.
	await editCache(page, 'expire');
	await lockAndUnlock(page);
	await expect(names).toHaveCount(3);

	// Copie abîmée : relue depuis Firestore, jamais déclarée illisible.
	await editCache(page, 'drop');
	await editCache(page, 'damage');
	await lockAndUnlock(page);
	await expect(names).toHaveCount(3);
	await expect(page.getByText(/illisible/)).toHaveCount(0);

	// Autre appareil : son écriture change le jeton, la copie d'ici est rechargée.
	const other = await (await browser.newContext()).newPage();
	await other.goto('/');
	await other.getByLabel('Email').fill(email);
	await other.getByLabel('Mot de passe').fill(PASSWORD);
	await other.getByRole('button', { name: 'Se connecter' }).click();
	await expect(other.getByRole('heading', { name: 'Alpha' })).toBeVisible();
	await createEntry(other, 'Delta');
	await other.context().close();
	await lockAndUnlock(page);
	await expect(names).toHaveCount(4);
	await expect.poll(() => editCache(page, 'count')).toBe(4);

	// Déconnexion : plus rien sur l'appareil.
	await goSettings(page);
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
	expect(await editCache(page, 'count')).toBe(0);
});

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

test('fiche agrandie : au-dessus de la liste, voisines, fermeture, accès à la fiche', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await addSite(page, 'anime', 'https://anime.fr/search?k=');
	await createEntry(page, 'Jane Roe');
	await createEntry(page, 'John Doe');

	await page.getByRole('link', { name: 'Retour', exact: true }).click();
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
	await page.getByRole('link', { name: 'Retour', exact: true }).click();

	// Bascule de la liste : tout détailler pour la visite, Paramètres reste la valeur par défaut.
	await page.getByRole('button', { name: 'Détails', exact: true }).click();
	await expect(animeOf('John Doe')).toBeVisible();
	await expect(animeOf('Jane Roe')).toBeVisible();

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

	// Cartes détaillées par défaut pour la suite.
	await goSettings(page);
	await page.getByLabel(/Cartes détaillées/).check();
	await goHome(page);
	await expect(animeOf('John Doe')).toBeVisible();

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
	// Cartes détaillées : on regarde le lien lui-même.
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

test('colle une image dans le formulaire, sans gêner le collage de texte', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await page.locator('a[href="/entry/new"]').first().click();
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();

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
	await page.getByRole('button', { name: 'Détails', exact: true }).click(); // tags visibles sur les cartes
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

test('nom unique dans la collection : signalé à la saisie, refusé à l’enregistrement', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'École');

	await goHome(page);
	await page.locator('a[href="/entry/new"]').first().click();
	const name = page.getByLabel('Nom', { exact: true });
	await name.fill('Naruto');
	await expect(page.getByText('Disponible')).toBeVisible();
	await name.fill(' ecole ');
	await expect(page.getByText('Déjà pris dans cette collection')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('« École » existe déjà dans cette collection.')).toBeVisible();

	// La fiche modifiée ne se compte pas elle-même.
	await page.getByRole('link', { name: 'voir « École »' }).click();
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page.getByText('Disponible')).toBeVisible();
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

async function createEntryWithImage(page: Page, name: string, size = 800) {
	await goHome(page);
	await page.locator('a[href="/entry/new"]').first().click();
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
	await page.evaluate(async (size) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		const data = new DataTransfer();
		data.items.add(new File([blob!], 'capture.png', { type: 'image/png' }));
		window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	}, size);
	await expect(page.getByAltText('Aperçu')).toBeVisible();
	await page.getByLabel('Nom', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

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

test('miniatures : seules celles sous la taille maximale sont refaites, et restent après déverrouillage', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntryWithImage(page, 'Petite', 400);
	await createEntryWithImage(page, 'Grande');
	await createEntry(page, 'Sans image');
	await goSettings(page);
	await page.getByRole('button', { name: 'Régénérer les miniatures' }).click();
	await expect(page.getByText('1 miniature refaite.')).toBeVisible();

	await lockAndUnlock(page);
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
	await expect(page.locator('figure img')).toHaveCount(2);
	await expect.poll(() => page.locator('figure img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

/** Répond aux duels jusqu'à `done` ; `pick` choisit parmi les libellés « Préférer X » triés. */
async function runDuels(page: Page, done: ReturnType<Page['getByText']>, pick: (sorted: string[]) => string) {
	for (let i = 0; i < 12; i++) {
		await expect(page.getByText('Laquelle préférez-vous ?').or(done)).toBeVisible();
		if (await done.isVisible()) return;
		const choices = page.getByRole('button', { name: /^Préférer / });
		await expect(choices.first()).toBeEnabled();
		const names = await choices.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
		await page.getByRole('button', { name: pick(names.sort()), exact: true }).click();
	}
	throw new Error('Trop de duels');
}

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
	await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();
	await expect(next).toHaveCount(0);

	// Une fiche créée n'appartient pas à la liste d'origine : elle navigue dans sa collection.
	await createEntry(page, 'Delta');
	await expect(page.getByText('4 / 4')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Mes fiches' }).first()).toBeVisible();
});

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
	await card('Bravo').getByRole('heading').click();
	await page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
	await page.getByLabel('Trier par').selectOption('rank');
	await expect(card('Charlie')).toContainText('#2');

	// Reclasser Alpha : il perd contre Charlie, puis revient sur sa fiche.
	await card('Alpha').getByRole('heading').click();
	await page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await expect(page.getByText('1re sur 2 au classement')).toBeVisible();
	await page.getByRole('link', { name: 'Reclasser' }).click();
	await page.getByRole('button', { name: 'Préférer Charlie', exact: true }).click();
	await expect(page.getByText('2e sur 2 au classement')).toBeVisible();
	await page.getByRole('button', { name: 'Retirer', exact: true }).click();
	await expect(page.getByText('2e sur 2 au classement')).toBeVisible();
	await page.getByRole('button', { name: 'Retirer', exact: true }).click();
	await expect(page.getByText('Pas encore classée')).toBeVisible();
});

test('index : fiches par initiale, recherche sur le nom, retour depuis une fiche', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	for (const name of ['Écho', 'Alpha', '2046']) await createEntry(page, name);
	await goHome(page);

	await page.getByRole('heading', { name: 'Manga' }).click();
	await page.getByRole('link', { name: 'Index de la collection' }).click();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['#', 'A', 'E']);
	await expect(page.getByRole('status').filter({ hasText: 'fiches' })).toHaveText('3 fiches');

	// Sans casse ni accents, sur le nom seulement.
	await page.getByLabel('Rechercher un nom').fill('echo');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['E']);
	await expect(page.getByRole('status').filter({ hasText: 'fiche' })).toHaveText('1 fiche sur 3');

	// Les options sont mémorisées sur l'appareil.
	await page.getByRole('button', { name: 'Tags' }).click();
	await expect(page.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('link', { name: 'Écho' }).click();
	await expect(page.getByRole('heading', { name: 'Écho' })).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/list$/);
	await expect(page.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-pressed', 'true');
});

test('catégories de tags : ordre, tags rangés, choix groupé, suppression sans perte', async ({ page }) => {
	await signUp(page);
	await addFirstCollection(page);
	await createEntry(page, 'Naruto');

	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByText('Catégories (0)').click();
	for (const [i, name] of ['Genre', 'Statut'].entries()) {
		await page.getByLabel('Nouvelle catégorie').fill(name);
		await page.getByRole('button', { name: 'Ajouter la catégorie' }).click();
		await expect(page.getByText(`Catégories (${i + 1})`)).toBeVisible();
	}
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
