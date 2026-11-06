import { describe, expect, it } from 'vitest';
import { parseRevealMode, pickAnimation } from './reveal';

describe('animation du tirage', () => {
	it('un mode choisi joue son animation', () => {
		expect(pickAnimation('flip')).toBe('flip');
		expect(parseRevealMode('random')).toBe('random');
	});

	it('« Aléatoire » tire l’une des trois, jamais deux fois la même de suite', () => {
		const drawn = Array.from({ length: 30 }, () => pickAnimation('random'));
		expect(new Set(drawn)).toEqual(new Set(['pack', 'flip', 'glow']));
		drawn.slice(1).forEach((animation, i) => expect(animation).not.toBe(drawn[i]));
	});
});
