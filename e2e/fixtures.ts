import { test as base, expect, type Page } from '@playwright/test';

export { expect };

export const PASSWORD = 'mot-de-passe-e2e-1';

/** Chaque test échoue aussi si la CSP a bloqué quelque chose. */
export const test = base.extend<{ cspGuard: void }>({
	cspGuard: [
		async ({ page }, use) => {
			const violations: string[] = [];
			page.on('console', (message) => {
				if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
			});
			await use();
			expect(violations).toEqual([]);
		},
		{ auto: true }
	]
});

let accounts = 0;

/** Crée un compte neuf et arrive sur la liste, session déverrouillée. */
export async function signUp(page: Page): Promise<{ email: string; recoveryKey: string }> {
	const email = `e2e-${Date.now()}-${accounts++}@example.com`;
	await page.goto('/signup');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel(/^Mot de passe/).fill(PASSWORD);
	await page.getByLabel('Confirmation').fill(PASSWORD);
	await page.getByRole('button', { name: 'Créer le compte' }).click();

	const key = page.locator('.font-mono');
	await expect(key).toBeVisible();
	const recoveryKey = (await key.textContent())!.trim();
	await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled();
	await page.getByLabel('J’ai conservé ma clé en lieu sûr').or(page.getByLabel("J'ai conservé ma clé en lieu sûr")).check();
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByRole('heading', { name: 'Créez votre première collection' })).toBeVisible();
	return { email, recoveryKey };
}

export async function addFirstCollection(page: Page, name = 'Manga'): Promise<void> {
	await page.getByLabel('Nom de la collection').fill(name);
	await page.getByRole('button', { name: 'Créer', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Créer une fiche' })).toBeVisible();
}

/** Navigation par clics : un rechargement verrouillerait la session (la DEK ne vit qu'en mémoire). */
export const goHome = (page: Page) => page.locator('header a[href="/"]').click();
export const goSettings = (page: Page) => page.getByRole('link', { name: 'Paramètres', exact: true }).first().click();
