/**
 * Outil autonome de lecture d'une sauvegarde : le fichier généré, ouvert depuis le disque (file://), sans serveur.
 * Témoin v4, clé de récupération, page en clair enregistrée puis rouverte. Aucune erreur de CSP ne doit apparaître.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const RECOVERY_KEY = 'A2DO-LXHX-FOCE-2PD2-M65K-FP5K-JAI4-LU7I-3A7T-FZRZ-46YX-5EVM-7Q7Q';
const WITNESS = 'src/lib/backup/fixtures/witness-v4.json';

let dir = '';
test.beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'stash-outil-'));
	execSync(`npx vite build -c vite.decrypt.config.ts --outDir "${dir}" --logLevel error`, { stdio: 'inherit' });
});

/** Erreurs de la console (une violation de CSP en est une) et exceptions de la page. */
function watchErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
	page.on('pageerror', (error) => errors.push(error.message));
	return errors;
}

test('lit le témoin avec la clé de récupération, puis enregistre une page en clair sans script', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto(pathToFileURL(join(dir, 'stash-dechiffrer.html')).href);
	await expect(page.getByRole('heading', { name: 'Lire une sauvegarde Stash' })).toBeVisible();

	await page.getByLabel('Fichier de sauvegarde').setInputFiles(WITNESS);
	await expect(page.getByRole('status')).toContainText('1 fiche');
	await page.getByRole('radio', { name: 'Clé de récupération' }).check();
	await page.getByRole('textbox', { name: 'Clé de récupération' }).fill('mauvaise');
	await page.getByRole('button', { name: 'Ouvrir' }).click();
	await expect(page.getByRole('alert')).toContainText('n’ouvre pas cette sauvegarde');
	await page.getByRole('textbox', { name: 'Clé de récupération' }).fill(RECOVERY_KEY);
	await page.getByRole('button', { name: 'Ouvrir' }).click();

	await expect(page.getByRole('heading', { name: 'Collection témoin' })).toBeVisible();
	const card = page.getByRole('listitem').filter({ hasText: 'Fiche témoin' });
	await expect(card).toContainText('★ 3,5 / 5');
	await expect(card).toContainText('France');
	await expect(card).toContainText('Tag témoin');
	await expect(card.getByRole('link', { name: 'Exemple' })).toHaveAttribute('href', 'https://example.com/');
	await expect(page.getByText('Fichier incomplet ou modifié')).toHaveCount(0);

	// Page en clair : avertissement, puis fichier sans script, rouvert hors de l'outil.
	await page.getByRole('button', { name: 'Enregistrer la page en clair' }).click();
	await expect(page.getByText('en clair', { exact: true })).toBeVisible();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Enregistrer en clair' }).click();
	const file = join(dir, (await download).suggestedFilename());
	await (await download).saveAs(file);
	const plain = readFileSync(file, 'utf8');
	expect(plain).not.toMatch(/<script/i);
	expect(plain).toContain('Fiche témoin');
	expect(plain).not.toContain('Enregistrer la page en clair');

	await page.goto(pathToFileURL(file).href);
	await expect(page.getByRole('heading', { name: 'Collection témoin' })).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: 'Fiche témoin' })).toContainText('Tag témoin');
	expect(errors).toEqual([]);
});

test('signale un fichier altéré et affiche ce qui reste lisible', async ({ page }) => {
	const errors = watchErrors(page);
	const raw = JSON.parse(readFileSync(WITNESS, 'utf8'));
	const thumb = Buffer.from(raw.entries[0].thumb.data, 'base64');
	thumb[0] ^= 1;
	raw.entries[0].thumb.data = thumb.toString('base64');
	const altered = join(dir, 'altered.json');
	writeFileSync(altered, JSON.stringify(raw));

	await page.goto(pathToFileURL(join(dir, 'stash-dechiffrer.html')).href);
	await page.getByLabel('Fichier de sauvegarde').setInputFiles(altered);
	await page.getByRole('textbox', { name: 'Clé de récupération' }).fill(RECOVERY_KEY);
	await page.getByRole('button', { name: 'Ouvrir' }).click();
	await expect(page.getByText('Fichier incomplet ou modifié : seul ce qui est lisible est affiché.')).toBeVisible();
	await expect(page.getByText('1 pièce illisible : fichier abîmé ou modifié.')).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: 'Fiche témoin' })).toBeVisible();
	expect(errors).toEqual([]);
});
