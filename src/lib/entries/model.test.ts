import { describe, expect, it } from 'vitest';
import {
	ENCODE_ATTEMPTS,
	MAX_DOC_BYTES,
	MAX_NAME_LENGTH,
	NO_TAG_FILTER,
	type TagFilter,
	buildSiteUrl,
	byName,
	encodeUnderLimit,
	entryLinks,
	fitWithin,
	fitsInDoc,
	isTrashExpired,
	linkTitle,
	matchesFilter,
	matchesSearch,
	moveItem,
	parseLabel,
	parseLinkUrl,
	COUNTRY_CODES,
	UNRATED,
	countryFlag,
	countryName,
	formatRating,
	matchesCountryFilter,
	parseCountry,
	resolveCountry,
	matchesLinkFilter,
	matchesRatingFilter,
	parseNameList,
	parseRating,
	parseSiteTemplate,
	shuffleRank,
	sortBy,
	trashDaysLeft,
	withRecoveredCollections
} from './model';

describe('corbeille', () => {
	const day = 24 * 60 * 60 * 1000;
	const now = 1_000 * day;

	it('compte les jours restants, sans descendre sous zéro', () => {
		expect(trashDaysLeft(now, now)).toBe(30);
		expect(trashDaysLeft(now - day / 2, now)).toBe(30);
		expect(trashDaysLeft(now - 29 * day, now)).toBe(1);
		expect(trashDaysLeft(now - 40 * day, now)).toBe(0);
	});

	it('n’expire qu’après 30 jours, et jamais hors de la corbeille', () => {
		expect(isTrashExpired(undefined, now)).toBe(false);
		expect(isTrashExpired(now - 29 * day, now)).toBe(false);
		expect(isTrashExpired(now - 30 * day, now)).toBe(true);
	});
});

describe('withRecoveredCollections', () => {
	it('recrée une fois chaque collection inconnue, à la suite des autres', () => {
		const known = [{ id: 'a', name: 'Manga' }];
		const entries = [{ collectionId: 'a' }, { collectionId: 'b' }, { collectionId: 'b' }];
		expect(withRecoveredCollections(known, entries)).toEqual([...known, { id: 'b', name: 'Collection récupérée 1' }]);
	});

	it('ne change rien si tout est connu', () => {
		const known = [{ id: 'a', name: 'Manga' }];
		expect(withRecoveredCollections(known, [{ collectionId: 'a' }])).toEqual(known);
	});
});

describe('sites', () => {
	const anime = { id: 's1', label: 'anime', urlTemplate: 'https://anime.fr/search?k={{name}}', enabled: true };

	it('accepte un modèle, ou un simple préfixe complété par {{name}}', () => {
		expect(parseSiteTemplate(' https://anime.fr/wiki/{{name}}/ep ')).toBe('https://anime.fr/wiki/{{name}}/ep');
		expect(parseSiteTemplate('anime.fr/search?k=')).toBe('https://anime.fr/search?k={{name}}');
	});

	it('refuse un modèle sans domaine fixe ou qui n’est pas http(s)', () => {
		for (const template of ['', '{{name}}', 'https://{{name}}.fr/x', 'https://anime.fr{{name}}', 'javascript:alert({{name}})'])
			expect(() => parseSiteTemplate(template), template).toThrow(/invalide/);
	});

	it('encode le terme : il ne peut pas sortir de sa place', () => {
		expect(buildSiteUrl(anime, 'john doe')).toBe('https://anime.fr/search?k=john%20doe');
		expect(buildSiteUrl(anime, 'a&b=c/../d#e')).toBe('https://anime.fr/search?k=a%26b%3Dc%2F..%2Fd%23e');
		expect(buildSiteUrl({ ...anime, urlTemplate: 'https://anime.fr/{{name}}' }, '$&')).toBe('https://anime.fr/%24%26');
	});

	it('assemble les liens : sites actifs d’abord, puis liens saisis', () => {
		const off = { ...anime, id: 's2', label: 'off', enabled: false };
		const custom = { url: 'https://perso.fr/', label: 'perso' };
		expect(entryLinks({ name: 'John Doe', links: [custom] }, [anime, off])).toEqual([
			{ url: 'https://anime.fr/search?k=John%20Doe', label: 'anime' },
			custom
		]);
	});

	it('utilise le terme propre à la fiche, sinon son nom', () => {
		const link = (siteTerms: Record<string, string>) => entryLinks({ name: 'John', links: [], siteTerms }, [anime])[0].url;
		expect(link({ s1: 'Johnny D' })).toBe('https://anime.fr/search?k=Johnny%20D');
		expect(link({ s1: '  ' })).toBe('https://anime.fr/search?k=John');
	});

	it('masque un site sur une seule fiche, sans perdre les liens saisis', () => {
		const custom = { url: 'https://perso.fr/' };
		expect(entryLinks({ name: 'x', links: [custom], hiddenSites: ['s1'] }, [anime])).toEqual([custom]);
		expect(entryLinks({ name: 'x', links: [], hiddenSites: ['autre'] }, [anime])).toHaveLength(1);
	});

	it('n’affiche pas un lien saisi masqué', () => {
		const shown = { url: 'https://a.fr/' };
		expect(entryLinks({ name: 'x', links: [shown, { url: 'https://b.fr/', hidden: true }] })).toEqual([shown]);
	});

	it('ignore un site au modèle invalide, sans site aussi', () => {
		expect(entryLinks({ name: 'x', links: [] }, [{ ...anime, urlTemplate: 'javascript:{{name}}' }])).toEqual([]);
		expect(entryLinks({ name: 'x', links: [] })).toEqual([]);
	});
});

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
			duplicates: []
		});
	});

	it('ignore les doublons, existants ou dans la liste, sans casse ni accents', () => {
		expect(parseNameList('École\necole\nBANQUE\nMutuelle', ['Banque'])).toEqual({
			names: ['École', 'Mutuelle'],
			duplicates: ['ecole', 'BANQUE']
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

	const filter = (patch: Partial<TagFilter>): TagFilter => ({ ...NO_TAG_FILTER, ...patch });
	const banque = { name: 'Banque', tagIds: ['t1'] };
	const sansTag = { name: 'Notes', tagIds: ['supprimé'] };

	it('sans tag sélectionné : pas de filtre', () => {
		expect(matchesFilter(banque, '', NO_TAG_FILTER, tags)).toBe(true);
		expect(matchesFilter({ name: 'Notes' }, '', NO_TAG_FILTER, tags)).toBe(true);
	});

	it('mode OU (par défaut) : au moins un des tags sélectionnés', () => {
		expect(matchesFilter(banque, '', filter({ tagIds: ['t1', 't2'] }), tags)).toBe(true);
		expect(matchesFilter(banque, '', filter({ tagIds: ['t2'] }), tags)).toBe(false);
	});

	it('mode ET : tous les tags sélectionnés', () => {
		expect(matchesFilter(entry, '', filter({ tagIds: ['t1', 't2'], mode: 'and' }), tags)).toBe(true);
		expect(matchesFilter(banque, '', filter({ tagIds: ['t1', 't2'], mode: 'and' }), tags)).toBe(false);
	});

	it('« sans tag » : uniquement les fiches sans tag connu', () => {
		expect(matchesFilter(sansTag, '', filter({ untagged: true }), tags)).toBe(true);
		expect(matchesFilter(banque, '', filter({ untagged: true }), tags)).toBe(false);
	});

	it('le texte cherche aussi dans les tags, sans casse ni accents', () => {
		expect(matchesFilter(entry, 'sante', NO_TAG_FILTER, tags)).toBe(true);
		expect(matchesFilter(entry, 'mutu', NO_TAG_FILTER, tags)).toBe(true);
		expect(matchesFilter(entry, 'supprimé', NO_TAG_FILTER, tags)).toBe(false);
	});

	it('parseLabel nettoie et refuse vide ou doublon', () => {
		const existing = [{ id: 't1', name: 'Administratif' }];
		expect(parseLabel('  Vie   pratique ', existing)).toBe('Vie pratique');
		expect(() => parseLabel('   ', existing)).toThrow();
		expect(() => parseLabel('administratif', existing)).toThrow();
	});
});

describe('moveItem', () => {
	it('échange avec le voisin, sans modifier la liste d’origine', () => {
		const list = ['a', 'b', 'c'];
		expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c']);
		expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b']);
		expect(list).toEqual(['a', 'b', 'c']);
	});

	it('ne bouge pas au-delà des extrémités', () => {
		const list = ['a', 'b'];
		expect(moveItem(list, 0, -1)).toBe(list);
		expect(moveItem(list, 1, 1)).toBe(list);
		expect(moveItem(list, 5, -1)).toBe(list);
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

	it('trie par création ou modification, du plus récent au plus ancien, puis par nom', () => {
		const list = [
			{ id: '2', name: 'b', createdAt: 1, updatedAt: 5 },
			{ id: '1', name: 'a', createdAt: 1, updatedAt: 2 },
			{ id: '3', name: 'c', createdAt: 3, updatedAt: 1 }
		];
		const order = (o: 'name' | 'created' | 'updated') => [...list].sort(sortBy(o)).map((e) => e.name);
		expect(order('name')).toEqual(['a', 'b', 'c']);
		expect(order('created')).toEqual(['c', 'a', 'b']);
		expect(order('updated')).toEqual(['b', 'a', 'c']);
	});

	it('mélange de façon stable pour une graine, autrement pour une autre', () => {
		const list = Array.from({ length: 30 }, (_, i) => ({ id: `id${i}`, name: `n${i}`, createdAt: 0, updatedAt: 0 }));
		const shuffled = (seed: number) => [...list].sort(sortBy('random', seed)).map((e) => e.id);
		expect(shuffled(1)).toEqual(shuffled(1));
		expect(shuffled(1)).not.toEqual(shuffled(2));
		expect(shuffled(1)).not.toEqual(list.map((e) => e.id));
		expect([...shuffled(1)].sort()).toEqual(list.map((e) => e.id).sort());
		expect(shuffleRank('a', 1)).toBe(shuffleRank('a', 1));
	});
});

describe('note', () => {
	it('accepte un entier de 1 à 10, rien d’autre', () => {
		expect(parseRating(1)).toBe(1);
		expect(parseRating(10)).toBe(10);
		for (const value of [0, 11, 4.5, -1, '8', null, undefined, NaN]) expect(parseRating(value), String(value)).toBeUndefined();
	});

	it('s’affiche en étoiles, à la française', () => {
		expect(formatRating(9)).toBe('4,5');
		expect(formatRating(8)).toBe('4');
	});

	it('filtre par note minimale ou sans note', () => {
		expect(matchesRatingFilter(undefined, 0)).toBe(true);
		expect(matchesRatingFilter(8, 8)).toBe(true);
		expect(matchesRatingFilter(7, 8)).toBe(false);
		expect(matchesRatingFilter(undefined, 6)).toBe(false);
		expect(matchesRatingFilter(undefined, UNRATED)).toBe(true);
		expect(matchesRatingFilter(10, UNRATED)).toBe(false);
	});

	it('trie de la meilleure note à la moins bonne, non notées à la fin, puis par nom', () => {
		const list = [
			{ id: '1', name: 'b', createdAt: 0, updatedAt: 0 },
			{ id: '2', name: 'a', createdAt: 0, updatedAt: 0, rating: 6 },
			{ id: '3', name: 'c', createdAt: 0, updatedAt: 0, rating: 9 },
			{ id: '4', name: 'd', createdAt: 0, updatedAt: 0, rating: 6 }
		];
		expect([...list].sort(sortBy('rating')).map((e) => e.name)).toEqual(['c', 'a', 'd', 'b']);
	});
});

describe('pays', () => {
	it('liste ISO complète, sans doublon', () => {
		expect(COUNTRY_CODES).toHaveLength(249);
		expect(new Set(COUNTRY_CODES).size).toBe(249);
	});

	it('n’accepte qu’un code ISO connu', () => {
		expect(parseCountry('FR')).toBe('FR');
		for (const value of ['fr', 'XX', 'EU', 'FRA', '', null, 12]) expect(parseCountry(value), String(value)).toBeUndefined();
	});

	it('drapeau et nom français', () => {
		expect(countryFlag('FR')).toBe('🇫🇷');
		expect(countryFlag('GB')).toBe('🇬🇧');
		expect(countryName('UA')).toBe('Ukraine');
		expect(countryName('DE')).toBe('Allemagne');
	});

	it('comprend le code, le nom sans casse ni accents, ou une suggestion', () => {
		expect(resolveCountry(' fr ')).toBe('FR');
		expect(resolveCountry('Bresil')).toBe('BR');
		expect(resolveCountry('royaume-uni')).toBe('GB');
		expect(resolveCountry('🇨🇴 Colombie (CO)')).toBe('CO');
		expect(resolveCountry('Atlantide')).toBeUndefined();
		expect(resolveCountry('XX')).toBeUndefined();
		expect(resolveCountry('')).toBeUndefined();
	});

	it('filtre : tous, sans pays, un pays', () => {
		expect(matchesCountryFilter(undefined, '')).toBe(true);
		expect(matchesCountryFilter(undefined, 'none')).toBe(true);
		expect(matchesCountryFilter('FR', 'none')).toBe(false);
		expect(matchesCountryFilter('FR', 'FR')).toBe(true);
		expect(matchesCountryFilter('ES', 'FR')).toBe(false);
	});
});

describe('filtre sur les liens', () => {
	it('toutes les fiches, ou seulement celles avec liens', () => {
		expect(matchesLinkFilter(0, false)).toBe(true);
		expect(matchesLinkFilter(2, true)).toBe(true);
		expect(matchesLinkFilter(0, true)).toBe(false);
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
