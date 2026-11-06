import { describe, expect, it } from 'vitest';
import { type GalleryItem, MAX_GALLERY, galleryImageId, gallerySlots, planGallery } from './gallery';

const item = (seed: number, slot?: number): GalleryItem => ({ type: 'image/webp', image: new Uint8Array([seed]), ...(slot && { slot }) });

describe('autres images d’une fiche', () => {
	it('rangées à côté de la couverture, cinq emplacements', () => {
		expect(galleryImageId('abc', 2)).toBe('abc_2');
		expect(gallerySlots()).toEqual([1, 2, 3, 4, 5]);
		expect(MAX_GALLERY).toBe(5);
	});

	it('ajout : seules les nouvelles sont écrites', () => {
		const plan = planGallery([item(1, 1), item(2)], 1);
		expect(plan.writes.map((w) => w.slot)).toEqual([2]);
		expect(plan.deletes).toEqual([]);
		expect(plan.types).toEqual(['image/webp', 'image/webp']);
	});

	it('réordonnées : les images déplacées sont réécrites à leur nouvel emplacement', () => {
		const plan = planGallery([item(2, 2), item(1, 1), item(3, 3)], 3);
		expect(plan.writes.map((w) => [w.slot, w.item.image[0]])).toEqual([
			[1, 2],
			[2, 1]
		]);
		expect(plan.deletes).toEqual([]);
	});

	it('retirées : les emplacements libérés à la fin sont supprimés, sans trou', () => {
		const plan = planGallery([item(3, 3)], 3);
		expect(plan.writes.map((w) => w.slot)).toEqual([1]);
		expect(plan.deletes).toEqual([2, 3]);
		expect(planGallery([], 2).deletes).toEqual([1, 2]);
	});

	it('six images au plus, couverture comprise', () => {
		expect(() => planGallery([1, 2, 3, 4, 5, 6].map((seed) => item(seed)), 0)).toThrow('6 images au plus');
	});
});
