import { describe, expect, it } from 'vitest';
import { SCROLL_MAX_MS, SCROLL_MIN_MS, easeInOutCubic, scrollDuration } from './scrollTop';

describe('retour en haut', () => {
	it('dure plus longtemps de plus loin, dans des bornes', () => {
		expect(scrollDuration(0)).toBe(SCROLL_MIN_MS);
		expect(scrollDuration(1200)).toBe(450);
		expect(scrollDuration(3000)).toBeGreaterThan(scrollDuration(1200));
		expect(scrollDuration(50_000)).toBe(SCROLL_MAX_MS);
	});

	it('part de 0, finit à 1, passe par le milieu à mi-chemin', () => {
		expect(easeInOutCubic(0)).toBe(0);
		expect(easeInOutCubic(0.5)).toBe(0.5);
		expect(easeInOutCubic(1)).toBe(1);
		expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
	});
});
