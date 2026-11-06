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

	it('miniature de l’index : ancienne case à cocher reprise, valeur inconnue ignorée', () => {
		expect(parsePrefs(JSON.stringify({ indexThumb: true })).indexThumb).toBe('small');
		expect(parsePrefs(JSON.stringify({ indexThumb: false })).indexThumb).toBe('off');
		expect(parsePrefs(JSON.stringify({ indexThumb: 'large' })).indexThumb).toBe('large');
		expect(parsePrefs(JSON.stringify({ indexThumb: 'huge' })).indexThumb).toBe('off');
	});

	it('tirage au hasard : mode connu, durée arrondie et bornée, sinon les valeurs par défaut', () => {
		expect(parsePrefs(null)).toMatchObject({ revealMode: 'pack', revealMs: 1100 });
		expect(parsePrefs(JSON.stringify({ revealMode: 'flip', revealMs: 2340 }))).toMatchObject({ revealMode: 'flip', revealMs: 2300 });
		expect(parsePrefs(JSON.stringify({ revealMode: 'boom', revealMs: 99999 }))).toMatchObject({ revealMode: 'pack', revealMs: 3000 });
		expect(parsePrefs(JSON.stringify({ revealMs: 10 })).revealMs).toBe(500);
		expect(parsePrefs(JSON.stringify({ revealMs: 'vite' })).revealMs).toBe(1100);
		// Ancien mode « Aléatoire » : devenu l'option à part, le mode revient à Paquet.
		expect(parsePrefs(JSON.stringify({ revealMode: 'random' }))).toMatchObject({ revealMode: 'pack', revealRandom: true });
		expect(parsePrefs(null).revealRandom).toBe(false);
	});

	it('dos des cartes de l’album : bordeaux nuit par défaut, valeur inconnue ignorée', () => {
		expect(parsePrefs(null).albumBack).toBe('night');
		expect(parsePrefs(JSON.stringify({ albumBack: 'ivory' })).albumBack).toBe('ivory');
		expect(parsePrefs(JSON.stringify({ albumBack: 'rouge' })).albumBack).toBe('night');
	});

	it('oublie l’ancien réglage du clic sur une carte (la recherche agrandit toujours)', () => {
		expect('cardClick' in parsePrefs(JSON.stringify({ cardClick: 'open' }))).toBe(false);
		expect(parsePrefs(null).indexCards).toBe(false);
	});
});
