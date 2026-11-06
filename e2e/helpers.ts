/** Fonctions d'aide partagées par les parcours e2e (création de fiches, cache, duels…). */
import { PASSWORD, expect, goHome, goSettings } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/** Glissement du doigt, simulé : Chrome de bureau ne le produit pas. */
export const swipeOn = (target: Locator, dx: number) =>
	target.evaluate((node, dx) => {
		const touch = (clientX: number) => new Touch({ identifier: 1, target: node, clientX: 200 + clientX, clientY: 200 });
		const send = (type: string, x: number, active: boolean) =>
			node.dispatchEvent(
				new TouchEvent(type, { bubbles: true, touches: active ? [touch(x)] : [], changedTouches: [touch(x)] })
			);
		send('touchstart', 0, true);
		send('touchend', dx, false);
	}, dx);

export async function addSite(page: Page, label: string, urlTemplate: string) {
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les liens' }).click();
	await page.getByLabel('Libellé du site').fill(label);
	await page.getByLabel("Modèle d'URL").fill(urlTemplate);
	await page.getByRole('button', { name: 'Ajouter un site' }).click();
	await expect(page.getByText('Sites (1 actif sur 1)')).toBeVisible();
}

/** Index de la collection active (le back-office : création, sélection, ouverture des fiches), depuis n'importe où. */
export async function goIndex(page: Page) {
	await goHome(page);
	await page.locator('details.dropdown > summary').first().click();
	await page.getByRole('link', { name: 'Index de la collection' }).click();
	await expect(page).toHaveURL(/\/list$/);
}

/** Ouvre la page d'une fiche depuis l'index (la recherche ne fait qu'agrandir les cartes). */
export async function openEntry(page: Page, name: string) {
	await goIndex(page);
	await page.getByRole('link', { name, exact: true }).click();
	await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Formulaire de nouvelle fiche, par le bouton « + » de l'index. */
export async function newEntryForm(page: Page) {
	await goIndex(page);
	await page.locator('a[href="/entry/new"]').first().click();
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
}

export async function createEntry(page: Page, name: string) {
	await goIndex(page);
	await page.locator('a[href="/entry/new"]').first().click();
	await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
	await page.getByLabel('Nom', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function lockAndUnlock(page: Page) {
	await goHome(page);
	await page.getByRole('button', { name: 'Verrouiller' }).click();
	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
}

/** Compte les fiches du cache IndexedDB, ou en retire ou abîme une ; retourne leur nombre avant l'action. */
export const editCache = (page: Page, action: 'count' | 'drop' | 'damage' | 'expire') =>
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

export async function createEntryWithImage(page: Page, name: string, size = 800) {
	await goIndex(page);
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

/** Répond aux duels jusqu'à `done` ; `pick` choisit parmi les libellés « Préférer X » triés. */
export async function runDuels(page: Page, done: ReturnType<Page['getByText']>, pick: (sorted: string[]) => string) {
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

/** Page des tags, liste des catégories dépliée. */
export async function openTagGroups(page: Page) {
	await goSettings(page);
	await page.getByRole('link', { name: 'Gérer les tags' }).click();
	await page.getByText('Catégories (0)').click();
}

/** Crée des catégories une à une (« Genre = Action, Drame » crée aussi leurs tags), en partant d'aucune. */
export async function addTagGroups(page: Page, ...inputs: string[]) {
	await openTagGroups(page);
	// Une à la fois : la fin d'un ajout vide le champ, elle effacerait la suivante déjà tapée.
	for (const [i, input] of inputs.entries()) {
		await page.getByLabel('Nouvelle catégorie').fill(input);
		await page.getByRole('button', { name: 'Ajouter la catégorie' }).click();
		await expect(page.getByText(`Catégories (${i + 1})`)).toBeVisible();
	}
}

/** Index de la collection « Manga », depuis une page qui affiche son nom. */
export async function openIndex(page: Page) {
	await page.getByRole('heading', { name: 'Manga' }).click();
	await page.getByRole('link', { name: 'Index de la collection' }).click();
}

/** Import d'un tableau depuis l'index : `count` fiches attendues, retour à l'index. */
export async function importTable(page: Page, table: string, count: number) {
	await page.getByRole('link', { name: 'Importer' }).click();
	await page.getByLabel('Tableau', { exact: true }).fill(table);
	await page.getByRole('button', { name: 'Vérifier' }).click();
	await page.getByRole('button', { name: `Importer (${count})` }).click();
	await expect(page).toHaveURL(/\/list$/);
}
