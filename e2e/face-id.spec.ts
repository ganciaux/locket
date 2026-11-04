/** Face ID par l'authentificateur virtuel de Chrome (protocole DevTools), avec l'extension `prf`. */
import type { Page } from '@playwright/test';
import { PASSWORD, expect, goSettings, signUp, test } from './fixtures';

// Le rechargement garde la page : on déverrouille sur les paramètres.
const SETTINGS = 'Paramètres';
const NEW_PASSWORD = 'nouveau-mot-de-passe-e2e';

async function addAuthenticator(page: Page) {
	const client = await page.context().newCDPSession(page);
	await client.send('WebAuthn.enable');
	await client.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			ctap2Version: 'ctap2_1',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			hasPrf: true,
			automaticPresenceSimulation: true
		}
	});
}

const stored = (page: Page) => page.evaluate(() => localStorage.getItem('locket.faceId'));

async function enable(page: Page, password: string) {
	await page.getByLabel('Mot de passe', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Activer', exact: true }).click();
}

test('active Face ID, déverrouille avec après réouverture, puis le désactive', async ({ page }) => {
	await signUp(page);
	await addAuthenticator(page);
	await goSettings(page);
	await page.getByRole('button', { name: 'Activer Face ID' }).click();
	await enable(page, 'pas-le-bon-mot-de-passe');
	await expect(page.getByText('Mot de passe incorrect.')).toBeVisible();
	expect(await stored(page)).toBeNull();

	await enable(page, PASSWORD);
	await expect(page.getByText('Activé sur cet appareil.')).toBeVisible();
	// Rien de la sortie PRF ni de la DEK en clair : seulement la copie emballée.
	expect(Object.keys(JSON.parse((await stored(page))!)).sort()).toEqual(['credentialId', 'data', 'iv', 'uid']);

	// Réouverture de l'app : la DEK est perdue, Face ID la retrouve.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Déverrouiller' })).toBeVisible();
	await expect(page.getByLabel('Mot de passe')).not.toBeFocused();
	await page.getByRole('button', { name: 'Déverrouiller avec Face ID' }).click();
	await expect(page.getByRole('heading', { name: SETTINGS, level: 1 })).toBeVisible();

	await page.getByRole('button', { name: 'Désactiver Face ID' }).click();
	await expect(page.getByText('Face ID désactivé.')).toBeVisible();
	expect(await stored(page)).toBeNull();
	await page.getByRole('button', { name: 'Verrouiller' }).click();
	await expect(page.getByRole('button', { name: 'Déverrouiller avec Face ID' })).toHaveCount(0);
});

test('un nouveau mot de passe désactive Face ID, et la déconnexion efface la copie', async ({ page }) => {
	await signUp(page);
	await addAuthenticator(page);
	await goSettings(page);
	await page.getByRole('button', { name: 'Activer Face ID' }).click();
	await enable(page, PASSWORD);
	await expect(page.getByText('Activé sur cet appareil.')).toBeVisible();
	const original = (await stored(page))!;

	await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
	await page.getByLabel('Nouveau mot de passe').fill(NEW_PASSWORD);
	await page.getByLabel('Confirmation').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
	await expect(page.getByText('Mot de passe modifié.')).toBeVisible();
	expect(await stored(page)).toBeNull();

	// La copie d'un autre appareil (remise ici) ne s'ouvre plus : le poivre du trousseau a été retiré.
	await page.evaluate((text) => localStorage.setItem('locket.faceId', text), original);
	await page.reload();
	await page.getByRole('button', { name: 'Déverrouiller avec Face ID' }).click();
	await expect(page.getByText("Face ID n'ouvre plus ce compte")).toBeVisible();
	await expect(page.getByRole('button', { name: 'Déverrouiller avec Face ID' })).toHaveCount(0);
	expect(await stored(page)).toBeNull();

	await page.getByLabel('Mot de passe').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
	await expect(page.getByRole('heading', { name: SETTINGS, level: 1 })).toBeVisible();

	await page.evaluate((text) => localStorage.setItem('locket.faceId', text), original);
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
	expect(await stored(page)).toBeNull();
});
