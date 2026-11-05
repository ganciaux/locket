import { describe, expect, it } from 'vitest';
import { DEFAULTS, parsePrefs } from './prefsStorage';

describe('parsePrefs', () => {
	it('rend les valeurs par défaut sans stockage ou s’il est illisible', () => {
		expect(parsePrefs(null)).toEqual(DEFAULTS);
		expect(parsePrefs('{pas du json')).toEqual(DEFAULTS);
		expect(parsePrefs('null')).toEqual(DEFAULTS);
	});

	it('garde les réglages connus et oublie les autres', () => {
		const prefs = parsePrefs(JSON.stringify({ cardSize: 'large', cardLinksExpanded: true }));
		expect(prefs.cardSize).toBe('large');
		expect(prefs).not.toHaveProperty('cardLinksExpanded');
	});

	it('reprend l’ancien « Cartes détaillées » en tags et liens', () => {
		expect(parsePrefs(JSON.stringify({ detailedCards: true }))).toMatchObject({ cardTags: true, cardLinks: true });
		expect(parsePrefs(JSON.stringify({ detailedCards: false }))).toMatchObject({ cardTags: false, cardLinks: false });
		expect(parsePrefs(JSON.stringify({ detailedCards: true }))).not.toHaveProperty('detailedCards');
		// Déjà repris : les nouveaux réglages l'emportent.
		expect(parsePrefs(JSON.stringify({ detailedCards: true, cardTags: false, cardLinks: true }))).toMatchObject({
			cardTags: false,
			cardLinks: true
		});
	});

	it('ramène l’ancien clic « expand » sur l’agrandissement', () => {
		expect(parsePrefs(JSON.stringify({ cardClick: 'expand' })).cardClick).toBe('zoom');
		expect(parsePrefs(JSON.stringify({ cardClick: 'open' })).cardClick).toBe('open');
	});
});
