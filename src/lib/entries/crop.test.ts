import { describe, expect, it } from 'vitest';
import { dragCrop, fullCrop, handlePoint, isFullCrop, minCropSide } from './crop';

const image = { width: 400, height: 200 };
const start = { x: 100, y: 50, width: 200, height: 100 };

describe('recadrage', () => {
	it('déplace le cadre sans sortir de l’image', () => {
		expect(dragCrop(start, 'move', 30, -20, image)).toEqual({ x: 130, y: 30, width: 200, height: 100 });
		expect(dragCrop(start, 'move', 500, 500, image)).toEqual({ x: 200, y: 100, width: 200, height: 100 });
		expect(dragCrop(start, 'move', -500, -500, image)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
	});

	it('un coin bouge ses deux bords, le coin opposé reste en place', () => {
		expect(dragCrop(start, 'nw', -20, -10, image)).toEqual({ x: 80, y: 40, width: 220, height: 110 });
		expect(dragCrop(start, 'se', 20, 10, image)).toEqual({ x: 100, y: 50, width: 220, height: 110 });
		expect(dragCrop(start, 'ne', 500, -500, image)).toEqual({ x: 100, y: 0, width: 300, height: 150 });
		expect(dragCrop(start, 'sw', -500, 500, image)).toEqual({ x: 0, y: 50, width: 300, height: 150 });
	});

	it('garde une taille minimale, même en croisant les bords', () => {
		const min = minCropSide(image);
		expect(min).toBe(10);
		expect(dragCrop(start, 'nw', 1000, 1000, image)).toEqual({ x: 290, y: 140, width: min, height: min });
		expect(dragCrop(start, 'se', -1000, -1000, image)).toEqual({ x: 100, y: 50, width: min, height: min });
	});

	it('cadre entier, coins et détection', () => {
		expect(fullCrop(image)).toEqual({ x: 0, y: 0, width: 400, height: 200 });
		expect(isFullCrop(fullCrop(image), image)).toBe(true);
		expect(isFullCrop(start, image)).toBe(false);
		expect(handlePoint(start, 'se')).toEqual({ x: 300, y: 150 });
		expect(handlePoint(start, 'nw')).toEqual({ x: 100, y: 50 });
		expect(handlePoint(start, 'se', 10)).toEqual({ x: 290, y: 140 });
	});
});
