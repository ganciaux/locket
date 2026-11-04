/**
 * Lecture hors Firebase sur le fichier témoin (voir witness.test.ts) : clé de récupération, mot de passe de l'époque,
 * mauvais secret, et fichier altéré lu malgré tout, défauts signalés.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackup } from './format';
import { unwrapBackupDek } from './keyring';
import { readBackup } from './reader';

const EMAIL = 'temoin-1793793418441@example.com';
const PASSWORD = 'mot-de-passe-temoin-v4';
const RECOVERY_KEY = 'A2DO-LXHX-FOCE-2PD2-M65K-FP5K-JAI4-LU7I-3A7T-FZRZ-46YX-5EVM-7Q7Q';

const text = readFileSync(new URL('./fixtures/witness-v4.json', import.meta.url), 'utf8');

describe('lecture d’une sauvegarde', () => {
	it('s’ouvre avec la clé de récupération seule, ou le mot de passe et son email, en DEK non extractible', async () => {
		const backup = parseBackup(text);
		const byKey = await unwrapBackupDek(backup.keyring, undefined, RECOVERY_KEY);
		const byPassword = await unwrapBackupDek(backup.keyring, EMAIL, PASSWORD);
		for (const dek of [byKey, byPassword]) expect(dek.extractable).toBe(false);
		await expect(unwrapBackupDek(backup.keyring, undefined, PASSWORD)).rejects.toThrow('Cette clé de récupération n’ouvre pas');
		await expect(unwrapBackupDek(backup.keyring, EMAIL, 'mauvais')).rejects.toThrow('Ni ce mot de passe');
	}, 30_000);

	it('rend collections, tags et fiches avec leurs images, sans défaut', async () => {
		const backup = parseBackup(text);
		const reading = await readBackup(backup, await unwrapBackupDek(backup.keyring, undefined, RECOVERY_KEY));
		expect(reading.problems).toEqual([]);
		expect(reading.createdAt).toBe(backup.createdAt);
		expect(reading.collections).toEqual([{ id: 'col-temoin', name: 'Collection témoin' }]);
		expect(reading.tags).toEqual([{ id: 'tag-temoin', name: 'Tag témoin', collectionId: 'col-temoin' }]);
		expect(reading.entries).toHaveLength(1);
		const [entry] = reading.entries;
		expect(entry).toMatchObject({ name: 'Fiche témoin', country: 'FR', birthYear: 1990, rating: 7 });
		expect(entry.thumb).toHaveLength(300);
		expect(entry.image).toHaveLength(2000);
	});

	it('lit un fichier altéré malgré tout : la pièce abîmée manque, les défauts sont signalés', async () => {
		const raw = JSON.parse(text);
		// Un octet changé dans la miniature : elle ne se déchiffre plus, la fiche reste lisible.
		const thumb = Buffer.from(raw.entries[0].thumb.data, 'base64');
		thumb[0] ^= 1;
		raw.entries[0].thumb.data = thumb.toString('base64');
		const backup = parseBackup(JSON.stringify(raw));
		const reading = await readBackup(backup, await unwrapBackupDek(backup.keyring, undefined, RECOVERY_KEY));
		expect(reading.entries[0].name).toBe('Fiche témoin');
		expect(reading.entries[0].thumb).toBeUndefined();
		expect(reading.entries[0].image).toHaveLength(2000);
		expect(reading.problems).toEqual(['1 pièce illisible : fichier abîmé ou modifié.', 'Fichier modifié depuis son export.']);
	});

	it('garde la date scellée quand celle du fichier est changée', async () => {
		const raw = JSON.parse(text);
		const sealed = raw.createdAt;
		raw.createdAt = '2001-01-01T00:00:00.000Z';
		const backup = parseBackup(JSON.stringify(raw));
		const reading = await readBackup(backup, await unwrapBackupDek(backup.keyring, undefined, RECOVERY_KEY));
		expect(reading.createdAt).toBe(sealed);
		expect(reading.problems).toEqual(['Fichier modifié depuis son export.']);
	});

	it('signale une fiche retirée du fichier', async () => {
		const raw = JSON.parse(text);
		raw.entries = [];
		const backup = parseBackup(JSON.stringify(raw));
		const reading = await readBackup(backup, await unwrapBackupDek(backup.keyring, undefined, RECOVERY_KEY));
		expect(reading.entries).toEqual([]);
		expect(reading.problems).toEqual([
			'Contenu incomplet : 0 fiche, 1 collection et 1 tag au lieu de 1 fiche, 1 collection et 1 tag.',
			'Fichier modifié depuis son export.'
		]);
	});
});
