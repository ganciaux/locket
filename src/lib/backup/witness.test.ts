/**
 * Fichier témoin : une vraie sauvegarde v5 exportée par l'app (contre les émulateurs, compte jetable), versionnée.
 * Elle doit rester lisible de bout en bout : format, dérivation du mot de passe et de la clé de récupération, AAD,
 * manifeste. Un échec ici = format ou crypto changé. Si c'est voulu : nouvelle version de format, nouveau témoin,
 * et les anciennes sauvegardes deviennent illisibles (voir MEMORY.md, Sauvegarde) ; sinon, c'est une régression.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decrypt, decryptJson, deriveKeys, deriveRecoveryKek, unwrapDek } from '$lib/crypto/crypto';
import { unpackThumbs } from '$lib/entries/gallery';
import { BACKUP_VERSION, type BackupManifest, parseBackup } from './format';

// Compte d'émulateur jetable : ces secrets n'ouvrent rien d'autre que ce fichier.
const EMAIL = 'temoin-1793970051167@example.com';
const PASSWORD = 'mot-de-passe-temoin-v5';
const RECOVERY_KEY = 'WTSL-R5L4-FC36-IEVS-UTWE-DTYW-MVEA-PARB-3LEM-IVVR-C6BM-S72R-X3PQ';

const text = readFileSync(new URL('./fixtures/witness-v5.json', import.meta.url), 'utf8');
const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

describe('sauvegarde témoin (format v5)', () => {
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
			imageType: 'image/webp',
			gallery: ['image/jpeg', 'image/webp']
		});
		expect(await decrypt(dek, entry.thumb!, `${entry.id}/thumb`)).toEqual(bytes(300, 2));
		expect(await decrypt(dek, entry.image!, `${entry.id}/image`)).toEqual(bytes(2000, 1));
		// Autres images : à leur emplacement `{id}_{n}`, dans l'ordre.
		expect(entry.gallery).toHaveLength(2);
		expect(await decrypt(dek, entry.gallery![0], `${entry.id}_1/image`)).toEqual(bytes(1500, 3));
		expect(await decrypt(dek, entry.gallery![1], `${entry.id}_2/image`)).toEqual(bytes(1200, 4));
		await expect(decrypt(dek, entry.gallery![1], `${entry.id}_1/image`)).rejects.toThrow();
		// Leurs vignettes, en un bloc à `{id}_t`.
		expect(unpackThumbs(await decrypt(dek, entry.galleryThumbs!, `${entry.id}_t/image`))).toEqual([
			{ type: 'image/webp', bytes: bytes(100, 5) },
			{ type: 'image/jpeg', bytes: bytes(80, 6) }
		]);
		// AAD : le même chiffré ne s'ouvre pas à un autre emplacement.
		await expect(decrypt(dek, entry.thumb!, `${entry.id}/image`)).rejects.toThrow();
	});
});
