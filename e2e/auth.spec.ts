import { PASSWORD, expect, goSettings, signUp, test } from './fixtures';

const NEW_PASSWORD = 'nouveau-mot-de-passe-e2e';

test('verrouille, refuse un mauvais mot de passe, puis déverrouille', async ({ page }) => {
	await signUp(page);
	await page.getByRole('button', { name: 'Verrouiller' }).click();

	await expect(page.getByRole('heading', { name: 'Déverrouiller' })).toBeVisible();
	await page.getByLabel('Mot de passe').fill('pas-le-bon-mot-de-passe');
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
	await expect(page.getByText('Mot de passe incorrect.')).toBeVisible();

	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
	await expect(page.getByRole('heading', { name: 'Créez votre première collection' })).toBeVisible();
});

test('remplace la clé de récupération depuis les paramètres', async ({ page }) => {
	const { recoveryKey } = await signUp(page);
	await goSettings(page);
	await page.getByRole('button', { name: 'Remplacer la clé' }).click();
	await page.getByLabel('Mot de passe', { exact: true }).first().fill('pas-le-bon-mot-de-passe');
	await page.getByRole('button', { name: 'Générer une nouvelle clé' }).click();
	await expect(page.getByText('Mot de passe incorrect.')).toBeVisible();

	await page.getByLabel('Mot de passe', { exact: true }).first().fill(PASSWORD);
	await page.getByRole('button', { name: 'Générer une nouvelle clé' }).click();
	const key = page.locator('.font-mono');
	await expect(key).toBeVisible();
	expect((await key.textContent())!.trim()).not.toBe(recoveryKey);
	await page.getByRole('button', { name: 'J’ai conservé ma clé' }).or(page.getByRole('button', { name: "J'ai conservé ma clé" })).click();
	await expect(key).toHaveCount(0);
});

test('teste la clé de récupération sans rien modifier', async ({ page }) => {
	const { recoveryKey } = await signUp(page);
	await goSettings(page);
	await page.getByRole('button', { name: 'Tester ma clé' }).click();
	const field = page.getByLabel('Clé à tester');

	await field.fill(recoveryKey.replace(/^./, (first) => (first === 'A' ? 'B' : 'A')));
	await page.getByRole('button', { name: 'Tester', exact: true }).click();
	await expect(page.getByText('Cette clé n’ouvre pas ce compte.').or(page.getByText(/Cette clé n'ouvre pas ce compte/))).toBeVisible();

	await field.fill(recoveryKey);
	await page.getByRole('button', { name: 'Tester', exact: true }).click();
	await expect(page.getByText('Cette clé est la bonne.')).toBeVisible();
});

test('se déconnecte et se reconnecte', async ({ page }) => {
	const { email } = await signUp(page);
	await goSettings(page);
	await page.getByRole('button', { name: 'Se déconnecter' }).click();

	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Mot de passe').fill('pas-le-bon-mot-de-passe');
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible();

	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByRole('heading', { name: 'Créez votre première collection' })).toBeVisible();
});

test('récupère le compte avec le lien et la clé, et refuse une mauvaise clé', async ({ page }) => {
	const { email, recoveryKey } = await signUp(page);

	await page.goto('/forgot-password');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Envoyer le lien' }).click();
	await page.getByRole('link', { name: 'Émulateur : ouvrir le lien de connexion' }).click();

	await expect(page.getByRole('heading', { name: 'Récupérer votre compte' })).toBeVisible();
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Continuer' }).click();

	const key = page.getByLabel('Clé de récupération');
	// Le premier caractère : le dernier ne porte qu'un bit utile, le changer redonne souvent la même clé.
	await key.fill(recoveryKey.replace(/^./, (first) => (first === 'A' ? 'B' : 'A')));
	await page.getByLabel(/^Nouveau mot de passe/).fill(NEW_PASSWORD);
	await page.getByLabel('Confirmation').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: 'Récupérer le compte' }).click();
	await expect(page.getByText('Clé de récupération incorrecte.')).toBeVisible();

	await key.fill(recoveryKey);
	await page.getByRole('button', { name: 'Récupérer le compte' }).click();
	await expect(page.getByRole('heading', { name: 'Créez votre première collection' })).toBeVisible();

	// Le nouveau mot de passe ouvre le compte, l'ancien non.
	await page.getByRole('button', { name: 'Verrouiller' }).click();
	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
	await expect(page.getByText('Mot de passe incorrect.')).toBeVisible();
	await page.getByLabel('Mot de passe').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: 'Déverrouiller' }).click();
	await expect(page.getByRole('heading', { name: 'Créez votre première collection' })).toBeVisible();
});

test('un lien déjà utilisé est refusé et propose d’en demander un autre', async ({ page }) => {
	const { email } = await signUp(page);
	await page.goto('/forgot-password');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Envoyer le lien' }).click();
	const emulatorLink = page.getByRole('link', { name: 'Émulateur : ouvrir le lien de connexion' });
	const href = (await emulatorLink.getAttribute('href'))!;

	await emulatorLink.click();
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByLabel('Clé de récupération')).toBeVisible();

	await page.goto(href);
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible();
});
