import { describe, expect, it } from 'vitest';
import type { BackupReading } from './reader';
import { backupView } from './readerView';

const base = { links: [], createdAt: 0, updatedAt: 0 };
const reading: BackupReading = {
	collections: [
		{
			id: 'c',
			name: 'Manga',
			ranking: ['b', 'gone', 'a'],
			tagGroups: [{ id: 'g', name: 'Genre' }],
			sites: [{ id: 's', label: 'anime', urlTemplate: 'https://anime.fr/{{name}}', enabled: true }]
		},
		{ id: 'h', name: 'Secret', hidden: true }
	],
	tags: [
		{ id: 't1', name: 'Action', collectionId: 'c', groupId: 'g' },
		{ id: 't2', name: 'Libre', collectionId: 'c' }
	],
	entries: [
		{ ...base, id: 'a', collectionId: 'c', name: 'Bravo', imageType: 'image/webp', thumb: new Uint8Array(3), tagIds: ['t2', 't1'] },
		{
			...base,
			id: 'b',
			collectionId: 'c',
			name: 'Alpha',
			imageType: 'text/html',
			thumb: new Uint8Array(3),
			hidden: true,
			links: [{ url: 'javascript:alert(1)' }, { url: 'https://ok.fr', label: 'Ok' }, { url: 'https://cache.fr', hidden: true }]
		},
		{ ...base, id: 'd', collectionId: 'c', name: 'Delta', deletedAt: 5, imageType: 'image/png' },
		{ ...base, id: 'e', collectionId: 'c', name: 'Écho', deletedAt: 9 },
		{ ...base, id: 'x', collectionId: 'h', name: 'Cachée' }
	],
	problems: [],
	createdAt: null
};

describe('vue d’une sauvegarde lue', () => {
	const [manga, secret] = backupView(reading);

	it('par collection : fiches par nom, corbeille à part (la plus récente d’abord), collection cachée signalée', () => {
		expect(manga.entries.map((e) => e.name)).toEqual(['Alpha', 'Bravo']);
		expect(manga.trash.map((e) => e.name)).toEqual(['Écho', 'Delta']);
		expect(secret).toMatchObject({ name: 'Secret', hidden: true });
		expect(secret.entries.map((e) => e.name)).toEqual(['Cachée']);
	});

	it('rang des fiches vivantes, tags par catégorie, liens calculés et sûrs, fiche cachée signalée', () => {
		const [alpha, bravo] = manga.entries;
		// Rang comme dans l'app : fiches avec image, ids inconnus ignorés.
		expect(manga.ranked).toBe(2);
		expect(alpha.rank).toBe(1);
		expect(bravo.rank).toBe(2);
		expect(manga.trash.every((e) => e.rank === undefined)).toBe(true);
		expect(bravo.tags).toEqual([
			{ group: 'Genre', names: ['Action'] },
			{ group: null, names: ['Libre'] }
		]);
		expect(alpha.hidden).toBe(true);
		expect(alpha.links).toEqual([
			{ url: 'https://anime.fr/Alpha', label: 'anime' },
			{ url: 'https://ok.fr/', label: 'Ok' }
		]);
	});

	it('n’expose une image que d’un type connu', () => {
		const [alpha, bravo] = manga.entries;
		expect(bravo).toMatchObject({ imageType: 'image/webp', thumb: new Uint8Array(3) });
		expect(alpha.imageType).toBeUndefined();
		expect(alpha.thumb).toBeUndefined();
	});
});
