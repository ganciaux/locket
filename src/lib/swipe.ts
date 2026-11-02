/** Glissement horizontal du doigt : pour passer à la fiche voisine sans gêner le défilement vertical. */
const MIN_DISTANCE_PX = 60;

export function swipeDirection(dx: number, dy: number): 'left' | 'right' | null {
	if (Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return null;
	return dx < 0 ? 'left' : 'right';
}

type SwipeHandlers = { onleft?: () => void; onright?: () => void };

/**
 * Action Svelte : `use:swipe={{ onleft, onright }}`. Deux doigts (zoom du navigateur) ne comptent pas, ni un geste parti
 * d'une zone qui défile à l'horizontale (`data-no-swipe`).
 */
export function swipe(node: HTMLElement, initial: SwipeHandlers) {
	let handlers = initial;
	let start: { x: number; y: number } | null = null;

	function onStart(event: TouchEvent) {
		const touch = event.touches[0];
		const scrolls = event.target instanceof Element && event.target.closest('[data-no-swipe]');
		start = event.touches.length === 1 && !scrolls ? { x: touch.clientX, y: touch.clientY } : null;
	}

	function onEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		if (!start || !touch) return;
		const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
		start = null;
		if (direction === 'left') handlers.onleft?.();
		if (direction === 'right') handlers.onright?.();
	}

	node.addEventListener('touchstart', onStart, { passive: true });
	node.addEventListener('touchend', onEnd, { passive: true });
	return {
		update(next: SwipeHandlers) {
			handlers = next;
		},
		destroy() {
			node.removeEventListener('touchstart', onStart);
			node.removeEventListener('touchend', onEnd);
		}
	};
}
