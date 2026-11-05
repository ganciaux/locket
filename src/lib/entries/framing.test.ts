import { describe, expect, it } from 'vitest';
import { framingClass, parseFraming } from './framing';

describe('cadrage de la carte', () => {
	it('garde un multiple de 5 entre 0 et 100, sauf le centre', () => {
		expect(parseFraming(0)).toBe(0);
		expect(parseFraming(35)).toBe(35);
		expect(parseFraming(100)).toBe(100);
		expect(parseFraming(50)).toBeUndefined();
		for (const bad of [-5, 105, 12, 2.5, '20', null, undefined]) expect(parseFraming(bad)).toBeUndefined();
	});

	it('une classe fixe par valeur, centrée par défaut ou si la valeur est invalide', () => {
		expect(framingClass(0)).toBe('object-[0%_0%]');
		expect(framingClass(35)).toBe('object-[35%_35%]');
		expect(framingClass(100)).toBe('object-[100%_100%]');
		expect(framingClass(undefined)).toBe('object-[50%_50%]');
		expect(framingClass(12)).toBe('object-[50%_50%]');
	});
});
