import { describe, expect, it } from 'vitest';
import { albumOrder, discoveredIn, pickHidden, withDiscovered } from './album';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('album', () => {
	it('range les classées par rang, puis les autres dans leur ordre (par nom)', () => {
		expect(albumOrder(items, ['c', 'a']).map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
		// Un id classé qui n'est plus dans la collection est ignoré.
		expect(albumOrder(items, ['z', 'd']).map((item) => item.id)).toEqual(['d', 'a', 'b', 'c']);
	});

	it('ne compte que les découvertes encore dans la collection', () => {
		expect(discoveredIn(['a', 'z'], ['a', 'b'])).toEqual(new Set(['a']));
		expect(discoveredIn(undefined, ['a'])).toEqual(new Set());
	});

	it('tire toujours une carte encore face cachée, rien quand l’album est complet', () => {
		const ids = ['a', 'b', 'c'];
		for (let i = 0; i < 50; i++) expect(pickHidden(ids, new Set(['a', 'c']))).toBe('b');
		expect(pickHidden(ids, new Set(['a']), () => 0)).toBe('b');
		expect(pickHidden(ids, new Set(['a']), () => 0.99)).toBe('c');
		expect(pickHidden(ids, new Set(ids))).toBeUndefined();
	});

	it('enregistre la découverte sans doublon, en oubliant les fiches disparues', () => {
		expect(withDiscovered(['a', 'z'], 'b', ['a', 'b', 'c'])).toEqual(['a', 'b']);
		expect(withDiscovered(['a', 'b'], 'a', ['a', 'b'])).toEqual(['b', 'a']);
		expect(withDiscovered(undefined, 'c', ['c'])).toEqual(['c']);
	});
});
