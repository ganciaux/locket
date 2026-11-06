import { describe, expect, it } from 'vitest';
import { type GalleryItem, MAX_GALLERY, galleryImageId, gallerySlots, packThumbs, planGallery, unpackThumbs } from './gallery';

const thumb = { type: 'image/jpeg', bytes: new Uint8Array([9]) };
const item = (seed: number, slot?: number): GalleryItem => ({ type: 'image/webp', image: new Uint8Array([seed]), thumb, ...(slot && { slot }) });

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

describe('vignettes des autres images', () => {
	it('emballées en un bloc et rendues telles quelles, dans l’ordre', () => {
		const thumbs = [
			{ type: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
			{ type: 'image/jpeg', bytes: new Uint8Array([]) },
			{ type: 'image/jpeg', bytes: new Uint8Array([4, 5]) }
		];
		expect(unpackThumbs(packThumbs(thumbs))).toEqual(thumbs);
		expect(unpackThumbs(packThumbs([]))).toEqual([]);
	});

	it('refuse un bloc tronqué, allongé ou à l’en-tête abîmé', () => {
		const packed = packThumbs([{ type: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }]);
		expect(() => unpackThumbs(packed.slice(0, -1))).toThrow('illisibles');
		expect(() => unpackThumbs(new Uint8Array([...packed, 0]))).toThrow('illisibles');
		expect(() => unpackThumbs(new Uint8Array([0, 0, 0, 2, 123, 125]))).toThrow('illisibles');
		expect(() => unpackThumbs(new Uint8Array([0, 0, 0, 99]))).toThrow('illisibles');
	});
});
