import { describe, expect, it } from 'vitest';
import { randomBytes } from '$lib/crypto/crypto';
import { type Backup, backupFileName, parseBackup, serializeBackup } from './format';

const enc = (size = 16) => ({ iv: randomBytes(12), data: randomBytes(size) });

const sample: Backup = {
	createdAt: '2026-10-29T10:00:00.000Z',
	includesImages: true,
	keyring: { wrappedDek: enc(48), recoveryDek: enc(48) },
	collections: enc(),
	tags: enc(),
	entries: [
		{ id: 'abc123', data: enc(), thumb: enc(500), image: enc(5000) },
		{ id: 'def-456_x', data: enc() }
	],
	manifest: enc()
};

describe('sauvegarde', () => {
	it('fait un aller-retour sans perte', () => {
		expect(parseBackup(serializeBackup(sample))).toEqual(sample);
	});

	it('accepte une sauvegarde sans collections ni tags', () => {
		const parsed = parseBackup(serializeBackup({ ...sample, collections: null, tags: null }));
		expect(parsed.collections).toBeNull();
		expect(parsed.tags).toBeNull();
	});

	it('refuse un fichier qui n’est pas une sauvegarde', () => {
		expect(() => parseBackup('pas du json')).toThrow(/pas une sauvegarde/);
		expect(() => parseBackup('{"format":"autre"}')).toThrow(/pas une sauvegarde/);
	});

	it('refuse une version inconnue, y compris les anciennes', () => {
		for (const version of [1, 2, 3, 99]) {
			const raw = JSON.parse(serializeBackup(sample));
			raw.version = version;
			expect(() => parseBackup(JSON.stringify(raw)), String(version)).toThrow(/Version/);
		}
	});

	it('refuse un IV qui ne fait pas 12 octets', () => {
		const raw = JSON.parse(serializeBackup(sample));
		raw.keyring.wrappedDek.iv = 'QUJD'; // 3 octets
		expect(() => parseBackup(JSON.stringify(raw))).toThrow(/invalide/);
	});

	it('exige le manifeste', () => {
		const raw = JSON.parse(serializeBackup(sample));
		delete raw.manifest;
		expect(() => parseBackup(JSON.stringify(raw))).toThrow(/invalide/);
	});

	it('refuse un identifiant qui ressemble à un chemin, ou en double', () => {
		for (const id of ['a/b', '../users', '', 'x'.repeat(65)]) {
			const raw = JSON.parse(serializeBackup(sample));
			raw.entries[0].id = id;
			expect(() => parseBackup(JSON.stringify(raw)), id).toThrow(/invalide/);
		}
		const raw = JSON.parse(serializeBackup(sample));
		raw.entries[1].id = raw.entries[0].id;
		expect(() => parseBackup(JSON.stringify(raw))).toThrow(/invalide/);
	});

	it('refuse un base64 corrompu ou un champ manquant', () => {
		const raw = JSON.parse(serializeBackup(sample));
		raw.entries[0].data.iv = '@@@';
		expect(() => parseBackup(JSON.stringify(raw))).toThrow(/invalide/);
		const raw2 = JSON.parse(serializeBackup(sample));
		delete raw2.keyring.recoveryDek;
		expect(() => parseBackup(JSON.stringify(raw2))).toThrow(/invalide/);
	});

	it('nomme le fichier avec la date', () => {
		expect(backupFileName(new Date('2026-10-29T12:00:00Z'))).toBe('stash-sauvegarde-2026-10-29.json');
	});
});
