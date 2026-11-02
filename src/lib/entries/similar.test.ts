import { describe, expect, it } from 'vitest';
import { similarity } from './similar';

// Empreinte 16 × 16 RVB d'une seule couleur.
const image = (value: number) => new Uint8ClampedArray(768).fill(value);

describe('similarity', () => {
	it('deux images identiques pèsent plus qu’un nom différent', () => {
		const { score, details } = similarity({ name: 'Alpha', fingerprint: image(100) }, { name: 'Bravo', fingerprint: image(100) });
		expect(details).toEqual({ image: 1, name: 0 });
		expect(score).toBeCloseTo(0.7);
	});

	it('des images opposées ne se ressemblent pas', () => {
		expect(similarity({ name: 'Alpha', fingerprint: image(0) }, { name: 'Bravo', fingerprint: image(255) }).score).toBe(0);
	});

	it('les mêmes couleurs autrement disposées gardent la moitié du score d’image', () => {
		const top = image(0).fill(255, 0, 384);
		const bottom = image(0).fill(255, 384);
		expect(similarity({ name: 'A', fingerprint: top }, { name: 'B', fingerprint: bottom }).details.image).toBeCloseTo(0.5);
	});

	it('tags, pays et mots du nom rapprochent deux fiches sans image', () => {
		const a = { name: 'Naruto tome 1', tagIds: ['t1', 't2'], country: 'JP' };
		const far = { name: 'Bravo', tagIds: ['t3'], country: 'FR' };
		const near = { name: 'Naruto tome 2', tagIds: ['t1', 't2'], country: 'JP' };
		expect(similarity(a, near).score).toBe(1);
		expect(similarity(a, far).score).toBe(0);
	});

	it('un critère renseigné d’un seul côté ne compte pas comme une différence', () => {
		const result = similarity({ name: 'Alpha', tagIds: ['t1'], fingerprint: image(100) }, { name: 'Bravo', fingerprint: image(100) });
		expect(result.details.tags).toBeUndefined();
		expect(result.score).toBeCloseTo(0.7);
	});

	it('sans image ni tags, nom et pays ne suffisent pas', () => {
		expect(similarity({ name: 'Alpha', country: 'JP' }, { name: 'Bravo', country: 'JP' }).score).toBe(0);
	});
});
