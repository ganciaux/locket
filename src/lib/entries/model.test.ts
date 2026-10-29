import { describe, expect, it } from 'vitest';
import {
	ENCODE_ATTEMPTS,
	MAX_DOC_BYTES,
	MAX_NAME_LENGTH,
	byName,
	encodeUnderLimit,
	fitWithin,
	fitsInDoc,
	linkTitle,
	matchesFilter,
	matchesSearch,
	parseLinkUrl,
	parseNameList,
	parseTagName
} from './model';

describe('parseLinkUrl', () => {
	it('accepte http(s) et ajoute https:// si le schéma manque', () => {
		expect(parseLinkUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
		expect(parseLinkUrl('http://example.com')).toBe('http://example.com/');
		expect(parseLinkUrl('  example.com/page ')).toBe('https://example.com/page');
	});

	it('refuse les schémas dangereux ou inutiles', () => {
		for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'file:///c:/x', 'mailto:a@b.c'])
			expect(parseLinkUrl(url), url).toBeNull();
	});

	it('refuse le vide et les URL invalides', () => {
		expect(parseLinkUrl('   ')).toBeNull();
		expect(parseLinkUrl('https://')).toBeNull();
	});
});

describe('linkTitle', () => {
	it('préfère le libellé, sinon le domaine sans www', () => {
		expect(linkTitle({ url: 'https://www.example.com/a', label: 'Mon compte' })).toBe('Mon compte');
		expect(linkTitle({ url: 'https://www.example.com/a/b?c=1' })).toBe('example.com');
		expect(linkTitle({ url: 'https://app.example.com/' })).toBe('app.example.com');
	});
});

describe('parseNameList', () => {
	it('un nom par ligne, espaces nettoyés, lignes vides ignorées', () => {
		expect(parseNameList('  Banque \r\n\n Impôts   en  ligne\n', [])).toEqual({
			names: ['Banque', 'Impôts en ligne'],
			duplicates: 0
		});
	});

	it('ignore les doublons, existants ou dans la liste, sans casse ni accents', () => {
		expect(parseNameList('École\necole\nBANQUE\nMutuelle', ['Banque'])).toEqual({
			names: ['École', 'Mutuelle'],
			duplicates: 2
		});
	});

	it('tronque les noms trop longs', () => {
		expect(parseNameList('x'.repeat(MAX_NAME_LENGTH + 50), []).names[0]).toHaveLength(MAX_NAME_LENGTH);
	});
});

describe('tags', () => {
	const tags = new Map([
		['t1', 'Administratif'],
		['t2', 'Santé']
	]);
	const entry = { name: 'Mutuelle', tagIds: ['t1', 't2', 'supprimé'] };

	it('filtre : tous les tags sélectionnés sont requis', () => {
		expect(matchesFilter(entry, '', ['t1'], tags)).toBe(true);
		expect(matchesFilter(entry, '', ['t1', 't2'], tags)).toBe(true);
		expect(matchesFilter({ name: 'Banque', tagIds: ['t1'] }, '', ['t1', 't2'], tags)).toBe(false);
		expect(matchesFilter({ name: 'Banque' }, '', [], tags)).toBe(true);
	});

	it('le texte cherche aussi dans les tags, sans casse ni accents', () => {
		expect(matchesFilter(entry, 'sante', [], tags)).toBe(true);
		expect(matchesFilter(entry, 'mutu', [], tags)).toBe(true);
		expect(matchesFilter(entry, 'supprimé', [], tags)).toBe(false);
	});

	it('parseTagName nettoie et refuse vide ou doublon', () => {
		const existing = [{ id: 't1', name: 'Administratif' }];
		expect(parseTagName('  Vie   pratique ', existing)).toBe('Vie pratique');
		expect(() => parseTagName('   ', existing)).toThrow();
		expect(() => parseTagName('administratif', existing)).toThrow();
	});
});

describe('recherche et tri', () => {
	it('ignore casse et accents', () => {
		expect(matchesSearch('École Primaire', 'ecole')).toBe(true);
		expect(matchesSearch('Banque', 'BANQ')).toBe(true);
		expect(matchesSearch('Banque', 'impôts')).toBe(false);
		expect(matchesSearch('Banque', '')).toBe(true);
	});

	it('trie par nom à la française', () => {
		const names = ['zèbre', 'Éléphant', 'avion'].map((name) => ({ name })).sort(byName);
		expect(names.map((n) => n.name)).toEqual(['avion', 'Éléphant', 'zèbre']);
	});
});

describe('taille', () => {
	it('fitWithin réduit sans déformer ni agrandir', () => {
		expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
		expect(fitWithin(3000, 4000, 300)).toEqual({ width: 225, height: 300 });
		expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
	});

	it('fitsInDoc compte la marge du document', () => {
		expect(fitsInDoc(new Uint8Array(MAX_DOC_BYTES - 2048))).toBe(true);
		expect(fitsInDoc(new Uint8Array(MAX_DOC_BYTES))).toBe(false);
	});

	it('encodeUnderLimit baisse la qualité jusqu’à tenir', async () => {
		const calls: number[] = [];
		const bytes = await encodeUnderLimit(async (quality, scale) => {
			calls.push(quality);
			return new Uint8Array(quality * scale >= 0.7 ? MAX_DOC_BYTES : 1000);
		});
		expect(bytes).toHaveLength(1000);
		expect(calls).toEqual([0.85, 0.75, 0.6]);
	});

	it('encodeUnderLimit abandonne après le dernier essai', async () => {
		let count = 0;
		await expect(
			encodeUnderLimit(async () => {
				count++;
				return new Uint8Array(MAX_DOC_BYTES);
			})
		).rejects.toThrow();
		expect(count).toBe(ENCODE_ATTEMPTS.length);
	});
});
