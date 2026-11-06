import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

describe('swipeDirection', () => {
	it('reconnaît un glissement horizontal assez long', () => {
		expect(swipeDirection(-80, 10)).toBe('left');
		expect(swipeDirection(80, -10)).toBe('right');
	});

	it('reconnaît un glissement vertical assez long', () => {
		expect(swipeDirection(10, -80)).toBe('up');
		expect(swipeDirection(-10, 200)).toBe('down');
	});

	it('ignore un geste trop court ou en diagonale', () => {
		expect(swipeDirection(30, 0)).toBeNull();
		expect(swipeDirection(0, -40)).toBeNull();
		expect(swipeDirection(80, 60)).toBeNull();
		expect(swipeDirection(60, -100)).toBeNull();
	});
});
