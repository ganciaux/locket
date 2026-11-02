import { describe, expect, it } from 'vitest';
import { similarity } from './similar';

const image = (value: number) => new Uint8ClampedArray(192).fill(value);

describe('similarity', () => {
	it('deux images identiques pèsent plus qu’un nom différent', () => {
		const score = similarity({ name: 'Alpha', fingerprint: image(100) }, { name: 'Bravo', fingerprint: image(100) });
		expect(score).toBeGreaterThan(0.7);
	});

	it('des images opposées ne se ressemblent pas', () => {
		expect(similarity({ name: 'Alpha', fingerprint: image(0) }, { name: 'Bravo', fingerprint: image(255) })).toBe(0);
	});

	it('tags, pays et mots du nom rapprochent deux fiches sans image', () => {
		const a = { name: 'Naruto tome 1', tagIds: ['t1', 't2'], country: 'JP' };
		const far = { name: 'Bravo', tagIds: ['t3'], country: 'FR' };
		const near = { name: 'Naruto tome 2', tagIds: ['t1', 't2'], country: 'JP' };
		expect(similarity(a, near)).toBeGreaterThan(0.8);
		expect(similarity(a, far)).toBe(0);
	});

	it('un critère absent des deux côtés ne compte pas comme une différence', () => {
		expect(similarity({ name: 'Alpha Bravo' }, { name: 'alpha bravo' })).toBe(1);
	});
});
