import { describe, expect, it } from 'vitest';
import { parseRevealMode, pickAnimation, revealDuration } from './reveal';

describe('animation du tirage', () => {
	it('sans hasard, le mode choisi ; un mode inconnu revient à Paquet', () => {
		expect(pickAnimation('flip', false)).toBe('flip');
		expect(parseRevealMode('random')).toBe('pack');
	});

	it('au hasard : l’une des huit, jamais deux fois la même de suite', () => {
		const drawn = Array.from({ length: 200 }, () => pickAnimation('pack', true));
		expect(new Set(drawn)).toEqual(new Set(['pack', 'flip', 'glow', 'scratch', 'polaroid', 'drop', 'spin', 'curtain']));
		drawn.slice(1).forEach((animation, i) => expect(animation).not.toBe(drawn[i]));
	});

	it('plus la carte est rare, plus la révélation dure', () => {
		expect(revealDuration(1000, null)).toBe(1000);
		expect(revealDuration(1000, 'blue')).toBe(1000);
		expect(revealDuration(1000, 'bronze')).toBe(1050);
		expect(revealDuration(1000, 'silver')).toBe(1150);
		expect(revealDuration(1000, 'gold')).toBe(1300);
	});
});
