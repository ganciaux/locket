/**
 * Fichier témoin : une vraie sauvegarde v4 exportée par l'app (contre les émulateurs, compte jetable), versionnée.
 * Elle doit rester lisible de bout en bout : format, dérivation du mot de passe et de la clé de récupération, AAD,
 * manifeste. Un échec ici = format ou crypto changé. Si c'est voulu : nouvelle version de format, nouveau témoin,
 * et les anciennes sauvegardes deviennent illisibles (voir MEMORY.md, Sauvegarde) ; sinon, c'est une régression.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decrypt, decryptJson, deriveKeys, deriveRecoveryKek, unwrapDek } from '$lib/crypto/crypto';
import { BACKUP_VERSION, type BackupManifest, parseBackup } from './format';

// Compte d'émulateur jetable : ces secrets n'ouvrent rien d'autre que ce fichier.
const EMAIL = 'temoin-1793793418441@example.com';
const PASSWORD = 'mot-de-passe-temoin-v4';
const RECOVERY_KEY = 'A2DO-LXHX-FOCE-2PD2-M65K-FP5K-JAI4-LU7I-3A7T-FZRZ-46YX-5EVM-7Q7Q';

const text = readFileSync(new URL('./fixtures/witness-v4.json', import.meta.url), 'utf8');
const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

describe('sauvegarde témoin (format v4)', () => {
	const backup = parseBackup(text);

	it('est au format courant', () => {
		expect(JSON.parse(text).version).toBe(BACKUP_VERSION);
		expect(backup.includesImages).toBe(true);
		expect(backup.entries).toHaveLength(1);
	});

	it('s’ouvre avec le mot de passe (même email) et avec la clé de récupération', async () => {
		const { kek } = await deriveKeys(PASSWORD, EMAIL);
		const byPassword = await unwrapDek(backup.keyring.wrappedDek, kek);
		const byRecovery = await unwrapDek(backup.keyring.recoveryDek, await deriveRecoveryKek(RECOVERY_KEY));
		for (const dek of [byPassword, byRecovery])
			await expect(decryptJson<BackupManifest>(dek, backup.manifest, 'backup/manifest')).resolves.toMatchObject({
				createdAt: backup.createdAt,
				includesImages: true,
				counts: { entries: 1, collections: 1, tags: 1 },
				skipped: 0
			});
	}, 30_000);

	it('rend catalogues, fiche, miniature et image à leur emplacement', async () => {
		const dek = await unwrapDek(backup.keyring.recoveryDek, await deriveRecoveryKek(RECOVERY_KEY));
		expect(await decryptJson(dek, backup.collections!, 'meta/collections')).toEqual([
			{ id: 'col-temoin', name: 'Collection témoin' }
		]);
		expect(await decryptJson(dek, backup.tags!, 'meta/tags')).toEqual([
			{ id: 'tag-temoin', name: 'Tag témoin', collectionId: 'col-temoin' }
		]);
		const [entry] = backup.entries;
		expect(await decryptJson(dek, entry.data, `${entry.id}/data`)).toMatchObject({
			collectionId: 'col-temoin',
			name: 'Fiche témoin',
			links: [{ url: 'https://example.com/', label: 'Exemple' }],
			tagIds: ['tag-temoin'],
			country: 'FR',
			birthYear: 1990,
			rating: 7,
			imageType: 'image/webp'
		});
		expect(await decrypt(dek, entry.thumb!, `${entry.id}/thumb`)).toEqual(bytes(300, 2));
		expect(await decrypt(dek, entry.image!, `${entry.id}/image`)).toEqual(bytes(2000, 1));
		// AAD : le même chiffré ne s'ouvre pas à un autre emplacement.
		await expect(decrypt(dek, entry.thumb!, `${entry.id}/image`)).rejects.toThrow();
	});
});
