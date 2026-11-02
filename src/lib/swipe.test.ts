import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

describe('swipeDirection', () => {
	it('reconnaît un glissement horizontal assez long', () => {
		expect(swipeDirection(-80, 10)).toBe('left');
		expect(swipeDirection(80, -10)).toBe('right');
	});

	it('ignore un geste trop court ou surtout vertical', () => {
		expect(swipeDirection(30, 0)).toBeNull();
		expect(swipeDirection(80, 60)).toBeNull();
		expect(swipeDirection(0, 200)).toBeNull();
	});
});
